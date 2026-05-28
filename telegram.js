import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_CONFIG_PATH = path.join(__dirname, "user-config.json");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || null;
const BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const ALLOWED_USER_IDS = new Set(
  String(process.env.TELEGRAM_ALLOWED_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

let chatId = process.env.TELEGRAM_CHAT_ID || null;
let _offset = 0;
let _polling = false;
let _liveMessageDepth = 0;
let _warnedMissingChatId = false;
let _warnedMissingAllowedUsers = false;
const _messageCache = new Map();

function normalizeText(value) {
  return String(value ?? "").slice(0, 4096);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripTags(s) {
  return String(s).replace(/<\/?[bi]>|<\/?code>|<\/?pre>/g, "");
}

function convertTables(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (/^\s*\|.+\|\s*$/.test(line) && next != null && /^\s*\|[\s|:\-]+\|\s*$/.test(next)) {
      const headerCells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());
      out.push(headerCells.map((c) => `<b>${stripTags(c)}</b>`).join(" | "));
      i += 2;
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        out.push(cells.join(" | "));
        i++;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/**
 * Convert common Markdown emitted by the LLM into Telegram-safe HTML.
 * Telegram HTML supports <b>, <i>, <code>, <pre>, <a>, <blockquote> — not headings,
 * tables, or horizontal rules. We map markdown to those primitives and drop the rest.
 */
function markdownToTelegramHtml(input) {
  if (input == null) return "";
  let text = String(input);

  // Sentinel chars from the Unicode Private Use Area — won't appear in LLM output
  // and won't be matched by \s or any markdown regex below.
  const SO = "\uE000";
  const SC = "\uE001";

  const codeBlocks = [];
  text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, body) => {
    codeBlocks.push(body.replace(/\n+$/, ""));
    return `${SO}CB${codeBlocks.length - 1}${SC}`;
  });

  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, body) => {
    inlineCodes.push(body);
    return `${SO}IC${inlineCodes.length - 1}${SC}`;
  });

  text = escapeHtml(text);

  text = convertTables(text);

  // Horizontal rule (---, ***, ___) → drop
  text = text.replace(/^\s*([-*_])\1{2,}\s*$/gm, "");

  // Bold
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  text = text.replace(/__([^_\n]+)__/g, "<b>$1</b>");

  // Headings → <b>
  text = text.replace(/^#{1,6}\s+(.+?)\s*#*\s*$/gm, (_, m) => `<b>${stripTags(m)}</b>`);

  // Bullets → •
  text = text.replace(/^[ \t]*[-*]\s+/gm, "• ");

  // Collapse runs of 3+ blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  // Restore code placeholders
  text = text.replace(
    new RegExp(`${SO}IC(\\d+)${SC}`, "g"),
    (_, i) => `<code>${escapeHtml(inlineCodes[Number(i)])}</code>`,
  );
  text = text.replace(
    new RegExp(`${SO}CB(\\d+)${SC}`, "g"),
    (_, i) => `<pre>${escapeHtml(codeBlocks[Number(i)])}</pre>`,
  );

  return text.trim();
}

function toTelegramHtml(text) {
  return markdownToTelegramHtml(text).slice(0, 4096);
}

function normalizeKeyboard(inlineKeyboard) {
  return inlineKeyboard ? JSON.stringify(inlineKeyboard) : null;
}

function cacheMessage(messageId, text, keyboardKey) {
  if (!messageId) return;
  _messageCache.set(String(messageId), { text, keyboardKey });
}

function getCachedMessage(messageId) {
  if (!messageId) return null;
  return _messageCache.get(String(messageId)) || null;
}

// ─── chatId persistence ──────────────────────────────────────────
function loadChatId() {
  try {
    if (fs.existsSync(USER_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"));
      if (cfg.telegramChatId) chatId = cfg.telegramChatId;
    }
  } catch (error) {
    log("telegram_warn", `Invalid user-config.json; chatId not loaded: ${error.message}`);
  }
}

function saveChatId(id) {
  try {
    let cfg = fs.existsSync(USER_CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(USER_CONFIG_PATH, "utf8"))
      : {};
    cfg.telegramChatId = id;
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    log("telegram_error", `Failed to persist chatId: ${e.message}`);
  }
}

loadChatId();

function isAuthorizedIncomingMessage(msg) {
  const incomingChatId = String(msg.chat?.id || "");
  const senderUserId = msg.from?.id != null ? String(msg.from.id) : null;
  const chatType = msg.chat?.type || "unknown";

  if (!chatId) {
    if (!_warnedMissingChatId) {
      log(
        "telegram_warn",
        "Ignoring inbound Telegram messages because TELEGRAM_CHAT_ID / user-config.telegramChatId is not configured. Auto-registration is disabled for safety.",
      );
      _warnedMissingChatId = true;
    }
    return false;
  }

  if (incomingChatId !== chatId) return false;

  if (chatType !== "private" && ALLOWED_USER_IDS.size === 0) {
    if (!_warnedMissingAllowedUsers) {
      log(
        "telegram_warn",
        "Ignoring group Telegram messages because TELEGRAM_ALLOWED_USER_IDS is not configured. Set explicit allowed user IDs for command/control.",
      );
      _warnedMissingAllowedUsers = true;
    }
    return false;
  }

  if (ALLOWED_USER_IDS.size > 0) {
    if (!senderUserId || !ALLOWED_USER_IDS.has(senderUserId)) return false;
  }

  return true;
}

// ─── Core send ───────────────────────────────────────────────────
export function isEnabled() {
  return !!TOKEN;
}

async function postTelegram(method, body, retries = 3) {
  if (!TOKEN || !chatId) return null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${BASE}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, ...body }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const err = await res.text();
        if (res.status === 400 && err.includes("message is not modified")) {
          return { ok: true, skipped: true };
        }
        if (res.status === 429) {
          // Rate limited - wait and retry
          const retryAfter = parseInt(err.match(/retry_after":(\d+)/)?.[1] || "5");
          log("telegram_warn", `Rate limited, retry after ${retryAfter}s`);
          await sleep(retryAfter * 1000);
          continue;
        }
        log("telegram_error", `${method} ${res.status}: ${err.slice(0, 200)}`);
        return null;
      }
      return await res.json();
    } catch (e) {
      if (attempt < retries - 1) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      log("telegram_error", `${method} failed after ${retries} attempts: ${e.message}`);
      return null;
    }
  }
  return null;
}

async function postTelegramRaw(method, body) {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`${BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      log("telegram_error", `${method} ${res.status}: ${err.slice(0, 200)}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    log("telegram_error", `${method} failed: ${e.message}`);
    return null;
  }
}

export async function sendMessage(text) {
  if (!TOKEN || !chatId) return;
  const html = toTelegramHtml(text);
  const sent = await postTelegram("sendMessage", { text: html, parse_mode: "HTML" });
  if (!sent) {
    const plain = normalizeText(text);
    const fallback = await postTelegram("sendMessage", { text: plain });
    const messageId = fallback?.result?.message_id;
    if (messageId) cacheMessage(messageId, plain, null);
    return fallback;
  }
  const messageId = sent?.result?.message_id;
  if (messageId) cacheMessage(messageId, html, null);
  return sent;
}

export async function sendMessageWithButtons(text, inlineKeyboard) {
  if (!TOKEN || !chatId) return;
  const html = toTelegramHtml(text);
  const keyboardKey = normalizeKeyboard(inlineKeyboard);
  const sent = await postTelegram("sendMessage", {
    text: html,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
  if (!sent) {
    const plain = normalizeText(text);
    const fallback = await postTelegram("sendMessage", {
      text: plain,
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
    const messageId = fallback?.result?.message_id;
    if (messageId) cacheMessage(messageId, plain, keyboardKey);
    return fallback;
  }
  const messageId = sent?.result?.message_id;
  if (messageId) cacheMessage(messageId, html, keyboardKey);
  return sent;
}

export async function sendHTML(html) {
  if (!TOKEN || !chatId) return;
  const normalizedText = normalizeText(html);
  const sent = await postTelegram("sendMessage", { text: normalizedText, parse_mode: "HTML" });
  const messageId = sent?.result?.message_id;
  if (messageId) cacheMessage(messageId, normalizedText, null);
  return sent;
}

export async function editMessage(text, messageId) {
  if (!TOKEN || !chatId || !messageId) return null;
  const html = toTelegramHtml(text);
  const cached = getCachedMessage(messageId);
  if (cached && cached.text === html) {
    return { ok: true, skipped: true };
  }
  const res = await postTelegram("editMessageText", {
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
  });
  if (!res) {
    const plain = normalizeText(text);
    const fallback = await postTelegram("editMessageText", {
      message_id: messageId,
      text: plain,
    });
    if (fallback?.ok !== false) {
      cacheMessage(messageId, plain, cached?.keyboardKey ?? null);
    }
    return fallback;
  }
  if (res?.ok !== false) {
    cacheMessage(messageId, html, cached?.keyboardKey ?? null);
  }
  return res;
}

export async function editMessageWithButtons(text, messageId, inlineKeyboard) {
  if (!TOKEN || !chatId || !messageId) return null;
  const html = toTelegramHtml(text);
  const keyboardKey = normalizeKeyboard(inlineKeyboard);
  const cached = getCachedMessage(messageId);
  if (cached && cached.text === html && cached.keyboardKey === keyboardKey) {
    return { ok: true, skipped: true };
  }
  const res = await postTelegram("editMessageText", {
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
  if (!res) {
    const plain = normalizeText(text);
    const fallback = await postTelegram("editMessageText", {
      message_id: messageId,
      text: plain,
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
    if (fallback?.ok !== false) {
      cacheMessage(messageId, plain, keyboardKey);
    }
    return fallback;
  }
  if (res?.ok !== false) {
    cacheMessage(messageId, html, keyboardKey);
  }
  return res;
}

export async function answerCallbackQuery(callbackQueryId, text = "") {
  if (!TOKEN || !callbackQueryId) return null;
  return postTelegramRaw("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text: String(text).slice(0, 200) } : {}),
  });
}

export function hasActiveLiveMessage() {
  return _liveMessageDepth > 0;
}

function createTypingIndicator() {
  if (!TOKEN || !chatId) {
    return { stop() {} };
  }

  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    await postTelegram("sendChatAction", { action: "typing" });
    timer = setTimeout(() => {
      tick().catch(() => null);
    }, 4000);
  }

  tick().catch(() => null);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

function toolLabel(name) {
  const labels = {
    get_token_info: "get token info",
    get_token_narrative: "get token narrative",
    get_token_holders: "get token holders",
    get_top_candidates: "get top candidates",
    get_pool_detail: "get pool detail",
    get_active_bin: "get active bin",
    deploy_position: "deploy position",
    close_position: "close position",
    claim_fees: "claim fees",
    swap_token: "swap token",
    update_config: "update config",
    get_my_positions: "get positions",
    get_wallet_balance: "get wallet balance",
    check_smart_wallets_on_pool: "check smart wallets",
    study_top_lpers: "study top LPers",
    get_top_lpers: "get top LPers",
    search_pools: "search pools",
    discover_pools: "discover pools",
  };
  return labels[name] || name.replace(/_/g, " ");
}

function summarizeToolResult(name, result) {
  if (!result) return "";
  if (result.error) return result.error;
  if (result.reason && result.blocked) return result.reason;
  switch (name) {
    case "deploy_position":
      return result.position ? `position ${String(result.position).slice(0, 8)}...` : "submitted";
    case "close_position":
      return result.success ? "closed" : result.reason || "failed";
    case "claim_fees":
      return result.claimed_amount != null ? `claimed ${result.claimed_amount}` : "done";
    case "update_config":
      return Object.keys(result.applied || {}).join(", ") || "updated";
    case "get_top_candidates":
      return `${result.candidates?.length ?? 0} candidates`;
    case "get_my_positions":
      return `${result.total_positions ?? result.positions?.length ?? 0} positions`;
    case "get_wallet_balance":
      return `${result.sol ?? "?"} SOL`;
    case "study_top_lpers":
    case "get_top_lpers":
      return `${result.lpers?.length ?? 0} LPers`;
    default:
      return result.success === false ? "failed" : "done";
  }
}

export async function createLiveMessage(title, intro = "Starting...") {
  if (!TOKEN || !chatId) return null;
  const typing = createTypingIndicator();

  const state = {
    title,
    intro,
    toolLines: [],
    footer: "",
    messageId: null,
    flushTimer: null,
    flushPromise: null,
    flushRequested: false,
  };

  function render() {
    const sections = [state.title];
    if (state.intro) sections.push(state.intro);
    if (state.toolLines.length > 0) sections.push(state.toolLines.join("\n"));
    if (state.footer) sections.push(state.footer);
    return sections.join("\n\n").slice(0, 4096);
  }

  async function flushNow() {
    state.flushTimer = null;
    state.flushRequested = false;
    const text = render();
    if (!state.messageId) {
      const sent = await sendMessage(text);
      state.messageId = sent?.result?.message_id ?? null;
      return;
    }
    await editMessage(text, state.messageId);
  }

  function scheduleFlush(delay = 300) {
    if (state.flushTimer) {
      state.flushRequested = true;
      return;
    }
    state.flushTimer = setTimeout(() => {
      state.flushPromise = flushNow().catch(() => null);
    }, delay);
  }

  async function upsertToolLine(name, icon, suffix = "") {
    const label = toolLabel(name);
    const line = `${icon} ${label}${suffix ? ` ${suffix}` : ""}`;
    const idx = state.toolLines.findIndex((entry) => entry.includes(` ${label}`));
    if (idx >= 0) state.toolLines[idx] = line;
    else state.toolLines.push(line);
    scheduleFlush();
  }

  _liveMessageDepth += 1;
  await flushNow();

  return {
    async toolStart(name) {
      await upsertToolLine(name, "ℹ️", "...");
    },
    async toolFinish(name, result, success) {
      const icon = success ? "✅" : "❌";
      const summary = summarizeToolResult(name, result);
      await upsertToolLine(name, icon, summary ? `— ${summary}` : "");
    },
    async note(text) {
      state.intro = text;
      scheduleFlush();
    },
    async finalize(finalText) {
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
      if (state.flushPromise) await state.flushPromise;
      state.footer = finalText;
      await flushNow();
      _liveMessageDepth = Math.max(0, _liveMessageDepth - 1);
      typing.stop();
    },
    async fail(errorText) {
      if (state.flushTimer) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
      }
      if (state.flushPromise) await state.flushPromise;
      state.footer = `❌ ${errorText}`;
      await flushNow();
      _liveMessageDepth = Math.max(0, _liveMessageDepth - 1);
      typing.stop();
    },
  };
}

// ─── Long polling ────────────────────────────────────────────────
async function poll(onMessage) {
  let consecutiveErrors = 0;
  while (_polling) {
    try {
      // Use shorter timeout (10s) to avoid connection drops
      const res = await fetch(`${BASE}/getUpdates?offset=${_offset}&timeout=10`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        consecutiveErrors++;
        const delay = Math.min(3000 * consecutiveErrors, 30000);
        if (consecutiveErrors <= 3) {
          log("telegram_warn", `Poll HTTP ${res.status}, retry in ${delay / 1000}s`);
        }
        await sleep(delay);
        continue;
      }
      consecutiveErrors = 0;
      const data = await res.json();
      for (const update of data.result || []) {
        _offset = update.update_id + 1;
        const callback = update.callback_query;
        if (callback?.data && callback?.message) {
          const callbackMsg = {
            chat: callback.message.chat,
            from: callback.from,
            text: callback.data,
          };
          if (!isAuthorizedIncomingMessage(callbackMsg)) continue;
          await onMessage({
            ...callbackMsg,
            isCallback: true,
            callbackQueryId: callback.id,
            callbackData: callback.data,
            messageId: callback.message.message_id,
          });
          continue;
        }
        const msg = update.message;
        if (!msg?.text) continue;
        if (!isAuthorizedIncomingMessage(msg)) continue;
        await onMessage(msg);
      }
    } catch (e) {
      if (!e.message?.includes("aborted")) {
        consecutiveErrors++;
        // Only log first few errors to avoid spam
        if (consecutiveErrors <= 3) {
          log("telegram_error", `Poll error: ${e.message}`);
        }
        await sleep(Math.min(3000 * consecutiveErrors, 30000));
        continue;
      }
      // Aborted (timeout) - normal, just continue
      await sleep(500);
    }
  }
}

export function startPolling(onMessage) {
  if (!TOKEN) return;
  _polling = true;
  poll(onMessage); // fire-and-forget
  log("telegram", "Bot polling started");
}

export function stopPolling() {
  _polling = false;
}

// ─── Notification helpers ────────────────────────────────────────
export async function notifyDeploy({
  pair,
  amountSol,
  position,
  tx,
  priceRange,
  rangeCoverage,
  binStep,
  baseFee,
  dryRun,
  narrative,
}) {
  if (hasActiveLiveMessage()) return;
  const icon = dryRun ? "🧪" : "✅";
  const label = dryRun ? "Deployed (DRY RUN)" : "Deployed";
  const priceStr = priceRange
    ? `Price range: ${priceRange.min < 0.0001 ? priceRange.min.toExponential(3) : priceRange.min.toFixed(6)} – ${priceRange.max < 0.0001 ? priceRange.max.toExponential(3) : priceRange.max.toFixed(6)}\n`
    : "";
  const coverageStr = rangeCoverage
    ? `Range cover: ${fmtPct(rangeCoverage.downside_pct)} downside | ${fmtPct(rangeCoverage.upside_pct)} upside | ${fmtPct(rangeCoverage.width_pct)} total\n`
    : "";
  const poolStr =
    binStep || baseFee
      ? `Bin step: ${binStep ?? "?"}  |  Base fee: ${baseFee != null ? baseFee + "%" : "?"}\n`
      : "";
  const posStr = dryRun
    ? `Mode: DRY RUN — no real transaction sent\n`
    : `Position: <code>${position?.slice(0, 8)}...</code>\nTx: <code>${tx?.slice(0, 16)}...</code>`;
  const narrativeStr = narrative ? `\n\n📖 Narrative\n${normalizeText(narrative)}` : "";
  // Gas cost estimate for live reference
  const gasEstimate = dryRun
    ? `\n⛽ Est. gas (live): ~0.0005 SOL (~$${(0.0005 * 80).toFixed(3)})\n`
    : "";
  await sendHTML(
    `${icon} <b>${label}</b> ${pair}\n` +
      `Amount: ${amountSol} SOL\n` +
      priceStr +
      coverageStr +
      poolStr +
      posStr +
      gasEstimate +
      narrativeStr,
  );
}

export async function notifyClose({
  pair,
  pnlUsd,
  pnlPct,
  reason,
  feesUsd,
  minutesHeld,
  priceChangePct,
  dryRun,
  amountSol,
}) {
  if (hasActiveLiveMessage()) return;
  const sign = pnlUsd >= 0 ? "+" : "";
  const reasonLine = reason ? `Reason: ${reason}\n` : "";
  const feesLine = feesUsd != null ? `Fees earned: $${feesUsd.toFixed(3)}\n` : "";
  const holdLine = minutesHeld != null ? `Held: ${minutesHeld}m\n` : "";
  const priceChangeLine =
    priceChangePct != null
      ? `Price Δ: ${priceChangePct >= 0 ? "+" : ""}${priceChangePct.toFixed(1)}%\n`
      : "";
  const icon = dryRun ? "🧪" : "🔒";
  const label = dryRun ? "Closed (DRY RUN)" : "Closed";

  // Gas cost + real net PnL for dry-run (so you know what live would look like)
  let gasLine = "";
  let netLine = "";
  if (dryRun) {
    const gasDeploy = 0.0005 * 80; // ~$0.04
    const gasClose = 0.0002 * 80; // ~$0.016
    const totalGas = gasDeploy + gasClose;
    const netPnl = (pnlUsd ?? 0) - totalGas;
    const netSign = netPnl >= 0 ? "+" : "";
    gasLine = `⛽ Est. gas (live): ~$${totalGas.toFixed(3)} (deploy+close)\n`;
    netLine = `📊 Net after gas: ${netSign}$${netPnl.toFixed(3)}\n`;
  }

  await sendHTML(
    `${icon} <b>${label}</b> ${pair}\n` +
      `PnL: ${sign}$${(pnlUsd ?? 0).toFixed(2)} (${sign}${(pnlPct ?? 0).toFixed(2)}%)\n` +
      feesLine +
      holdLine +
      priceChangeLine +
      gasLine +
      netLine +
      reasonLine,
  );
}

export async function notifySwap({ inputSymbol, outputSymbol, amountIn, amountOut, tx }) {
  if (hasActiveLiveMessage()) return;
  await sendHTML(
    `🔄 <b>Swapped</b> ${inputSymbol} → ${outputSymbol}\n` +
      `In: ${amountIn ?? "?"} | Out: ${amountOut ?? "?"}\n` +
      `Tx: <code>${tx?.slice(0, 16)}...</code>`,
  );
}

export async function notifyOutOfRange({ pair, minutesOOR }) {
  if (hasActiveLiveMessage()) return;
  await sendHTML(`⚠️ <b>Out of Range</b> ${pair}\n` + `Been OOR for ${minutesOOR} minutes`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "?";
}
