/**
 * Paper positions — live, forward-running simulated LP positions.
 *
 * Each paper position is opened with the current pool state, then ticked every
 * 5 minutes against real OHLCV candles to accrue fees and recompute IL. State
 * is persisted to paper-positions.json so positions survive restarts.
 *
 * Math: continuous-range (Uniswap v3-style) sqrt-price geometry, treating
 * X as the base token and Y as the SOL quote. Prices are in USD/base
 * throughout; SOL/USD is snapshotted at open and held constant for HODL.
 */

import fs from "fs";
import { randomBytes } from "crypto";
import { log } from "./logger.js";

const PAPER_POSITIONS_FILE = "./paper-positions.json";
const GECKO_BASE = "https://api.geckoterminal.com/api/v2";
const DATAPI_POOL_BASE = "https://dlmm.datapi.meteora.ag/pools";
const DEFAULT_SOL_USD = 160;
const MAX_CANDLES_PER_TICK = 60; // up to 5h of catch-up per tick
const STRATEGIES = new Set(["spot", "curve", "bid_ask"]);

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(n, decimals = 6) {
  if (!Number.isFinite(n)) return n;
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

function load() {
  if (!fs.existsSync(PAPER_POSITIONS_FILE)) return { positions: {} };
  try {
    const data = JSON.parse(fs.readFileSync(PAPER_POSITIONS_FILE, "utf8"));
    if (!data || typeof data !== "object" || !data.positions) return { positions: {} };
    return data;
  } catch {
    return { positions: {} };
  }
}

function save(data) {
  fs.writeFileSync(PAPER_POSITIONS_FILE, JSON.stringify(data, null, 2));
}

function newId(poolAddress) {
  const prefix = String(poolAddress || "pool").slice(0, 6);
  return `paper_${Date.now()}_${prefix}_${randomBytes(3).toString("hex")}`;
}

async function fetchPoolDetail(poolAddress) {
  const res = await fetch(`${DATAPI_POOL_BASE}/${poolAddress}`);
  if (!res.ok) throw new Error(`Pool detail API ${res.status}`);
  return res.json();
}

/**
 * Fetch the close of the most recent 5m candle from GeckoTerminal. Used at
 * open time to detect the price-scale offset between datapi's pool price and
 * the OHLCV feed (token-decimal differences cause ~1000x discrepancies).
 */
async function fetchLatestCandle(poolAddress) {
  const url = `${GECKO_BASE}/networks/solana/pools/${poolAddress}/ohlcv/minute?aggregate=5&limit=1&currency=usd`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const data = await res.json();
  const row = data?.data?.attributes?.ohlcv_list?.[0];
  if (!row) return null;
  const close = Number(row[4]);
  const ts = Number(row[0]) * 1000;
  if (!Number.isFinite(close) || close <= 0) return null;
  return { close, ts: Number.isFinite(ts) ? ts : null };
}

/**
 * Fetch up to `limit` 5m candles, newest-first from GeckoTerminal. The caller
 * filters down to candles strictly newer than `sinceMs`.
 */
async function fetchRecentCandles(poolAddress, limit = MAX_CANDLES_PER_TICK) {
  const url = `${GECKO_BASE}/networks/solana/pools/${poolAddress}/ohlcv/minute?aggregate=5&limit=${limit}&currency=usd`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const data = await res.json();
  const list = data?.data?.attributes?.ohlcv_list || [];
  return list
    .map((row) => ({
      ts: Number(row[0]) * 1000,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .filter((c) => Number.isFinite(c.close) && c.close > 0 && Number.isFinite(c.volume))
    .sort((a, b) => a.ts - b.ts);
}

// ─── Geometry ──────────────────────────────────────────────────

/**
 * Compute a continuous-range price interval from an active price and a bin
 * range. Uses DLMM bin pricing: price(bin) = active * (1 + bin_step/10000)^k.
 */
function priceFromBinOffset(activePrice, binStep, offset) {
  const stepMul = 1 + binStep / 10000;
  return activePrice * Math.pow(stepMul, offset);
}

/**
 * Sqrt-price geometry: given total deposit value in USD and the bin range,
 * compute liquidity L and the initial X/Y split.
 *
 * Convention: prices in USD/base, y in USD-equivalent, x in base tokens.
 * Single-side SOL deploy (active = upper) puts everything in Y.
 */
function computeInitialSplit({ amountUsd, activePrice, lowerPrice, upperPrice }) {
  const sp = Math.sqrt(activePrice);
  const spa = Math.sqrt(lowerPrice);
  const spb = Math.sqrt(upperPrice);

  if (sp >= spb) {
    // Active at or above upper → all Y (single-side quote, e.g. SOL only)
    const L = amountUsd / (spb - spa);
    return { L, xTokens: 0, yUsd: amountUsd };
  }
  if (sp <= spa) {
    // Active at or below lower → all X (would be weird for a fresh single-side SOL deploy)
    const L = (amountUsd * spa * spb) / ((spb - spa) * activePrice);
    const xTokens = (L * (spb - spa)) / (spa * spb);
    return { L, xTokens, yUsd: 0 };
  }
  // In-range: compute L from y portion. Caller may pass amountUsd as the full
  // SOL value when active is exactly at upper, which still hits this branch
  // only when sp < spb strictly. Use the deposit-value equation:
  //   amountUsd = L * [(spb - sp) * sp / spb + (sp - spa)]
  const factor = ((spb - sp) * sp) / spb + (sp - spa);
  const L = amountUsd / factor;
  const xTokens = (L * (spb - sp)) / (sp * spb);
  const yUsd = L * (sp - spa);
  return { L, xTokens, yUsd };
}

/**
 * IL for a concentrated-liquidity LP position, as a deposit-relative ratio.
 *
 *   IL_ratio = (2√r / (1 + r) - 1) × √(upperPrice / lowerPrice)
 *
 * where r = effectivePrice / entryPrice, with effectivePrice clamped to
 * [lowerPrice, upperPrice] so price excursions outside the range stop
 * contributing further loss. Multiply by the deposit amount to get USD.
 *
 * Replaces the old USD-fraction rebalance that silently summed to the
 * deposit amount when entry == upper (single-side SOL), masking real IL.
 */
function computeIlRatio({ entryPrice, currentPrice, lowerPrice, upperPrice }) {
  if (!(entryPrice > 0) || !(lowerPrice > 0) || !(upperPrice > 0)) return 0;
  const effective = Math.min(Math.max(currentPrice, lowerPrice), upperPrice);
  const r = effective / entryPrice;
  if (!(r > 0)) return 0;
  const baseIl = (2 * Math.sqrt(r)) / (1 + r) - 1;
  const rangeMultiplier = Math.sqrt(upperPrice / lowerPrice);
  return baseIl * rangeMultiplier;
}

/**
 * Recompute LP value (in USD) at a given price, using stored liquidity L and
 * the original range [Pa, Pb].
 */
function computeLpValue({ L, lowerPrice, upperPrice, currentPrice }) {
  const sp = Math.sqrt(currentPrice);
  const spa = Math.sqrt(lowerPrice);
  const spb = Math.sqrt(upperPrice);

  if (sp >= spb) {
    // All Y
    return { xTokens: 0, yUsd: L * (spb - spa), valueUsd: L * (spb - spa) };
  }
  if (sp <= spa) {
    // All X
    const xTokens = (L * (spb - spa)) / (spa * spb);
    return { xTokens, yUsd: 0, valueUsd: xTokens * currentPrice };
  }
  const xTokens = (L * (spb - sp)) / (sp * spb);
  const yUsd = L * (sp - spa);
  return { xTokens, yUsd, valueUsd: xTokens * currentPrice + yUsd };
}

// ─── Summary formatting ────────────────────────────────────────

/**
 * Map a persisted position row to the curated shape returned by the tool
 * layer. Centralising this here means open/get/close all agree on the field
 * set.
 */
function formatSummary(pos) {
  const inRangePct =
    pos.total_candles_seen > 0
      ? round((pos.in_range_candles / pos.total_candles_seen) * 100, 1)
      : null;
  return {
    id: pos.id,
    pool_address: pos.pool_address,
    pool_name: pos.pool_name,
    base_symbol: pos.base_symbol,
    quote_symbol: pos.quote_symbol,
    strategy: pos.strategy,
    status: pos.status,
    opened_at: pos.opened_at,
    closed_at: pos.closed_at,
    close_reason: pos.close_reason ?? null,
    note: pos.note ?? null,
    amount_sol: pos.amount_sol,
    sol_usd_at_open: pos.sol_usd_at_open,
    initial_value_usd: pos.initial_value_usd,
    current_value_usd: pos.current_value_usd,
    fees_earned_usd: pos.fees_earned_usd,
    il_usd: pos.il_usd,
    il_pct: pos.il_pct,
    net_pnl_usd: pos.net_pnl_usd,
    in_range_pct: inRangePct,
    total_candles_seen: pos.total_candles_seen,
    in_range_candles: pos.in_range_candles,
    range: {
      lower: pos.lower_price,
      upper: pos.upper_price,
      entry: pos.entry_price ?? pos.active_price,
    },
    bins_below: pos.bins_below,
    bins_above: pos.bins_above,
    bin_step: pos.bin_step,
    fee_pct: pos.fee_pct,
    tvl_share: pos.tvl_share,
    pool_tvl_usd_at_open: pos.pool_tvl_usd_at_open,
    price_scale: pos.price_scale ?? 1,
    raw_active_price: pos.raw_active_price ?? null,
    last_price: pos.last_price,
    last_tick_at: pos.last_tick_at,
  };
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Open a new paper position. Snapshots current pool state, computes the
 * initial X/Y split via sqrt-price geometry, persists to JSON.
 */
export async function openPaperPosition({
  pool_address,
  amount_sol,
  bins_below,
  bins_above = 0,
  strategy = "spot",
  sol_price_usd = null,
  note = null,
}) {
  if (!pool_address) throw new Error("pool_address is required");
  const amountSol = num(amount_sol, null);
  if (!(amountSol > 0)) throw new Error("amount_sol must be positive");
  const binsBelow = Math.round(num(bins_below, null));
  if (!(binsBelow >= 0)) throw new Error("bins_below must be >= 0");
  const binsAbove = Math.round(num(bins_above, 0));
  const strategyKey = String(strategy || "spot").toLowerCase();
  if (!STRATEGIES.has(strategyKey)) {
    throw new Error(`strategy must be one of: ${[...STRATEGIES].join(", ")}`);
  }

  const [pool, latestCandle] = await Promise.all([
    fetchPoolDetail(pool_address),
    fetchLatestCandle(pool_address).catch(() => null),
  ]);
  const latestCandleClose = latestCandle?.close ?? null;
  const binStep = num(pool?.dlmm_params?.bin_step ?? pool?.pool_config?.bin_step, null);
  if (!(binStep > 0)) throw new Error("Could not read pool bin_step");
  const feePct = num(pool?.fee_pct ?? pool?.base_fee_pct, null);
  if (!(feePct > 0)) throw new Error("Could not read pool fee_pct");
  const rawActivePrice = num(pool?.current_price ?? pool?.price, null);
  if (!(rawActivePrice > 0)) throw new Error("Could not read pool current_price");
  const poolTvlUsd = num(pool?.tvl ?? pool?.active_tvl, 0);

  // Price-scale normalization: datapi's pool price and GeckoTerminal's OHLCV
  // close can disagree by orders of magnitude (token decimal mismatches).
  // Anchor everything to the OHLCV scale so subsequent ticks compare directly
  // against stored lower/upper bounds. Fall back to 1.0 if the candle feed
  // is unavailable.
  const priceScale =
    latestCandleClose && latestCandleClose > 0 ? latestCandleClose / rawActivePrice : 1;

  const entryPrice = rawActivePrice * priceScale;
  const lowerPrice = priceFromBinOffset(entryPrice, binStep, -binsBelow);
  const upperPrice =
    binsAbove > 0 ? priceFromBinOffset(entryPrice, binStep, binsAbove) : entryPrice;

  const solUsd = num(sol_price_usd, DEFAULT_SOL_USD);
  const initialValueUsd = amountSol * solUsd;

  const { L, xTokens, yUsd } = computeInitialSplit({
    amountUsd: initialValueUsd,
    activePrice: entryPrice,
    lowerPrice,
    upperPrice,
  });

  const tvlShare = poolTvlUsd > 0 ? initialValueUsd / (poolTvlUsd + initialValueUsd) : 1;

  const now = Date.now();
  const id = newId(pool_address);
  const position = {
    id,
    pool_address,
    pool_name: pool?.name || null,
    base_symbol: pool?.token_x?.symbol || null,
    quote_symbol: pool?.token_y?.symbol || null,
    status: "open",
    strategy: strategyKey,
    opened_at: new Date(now).toISOString(),
    opened_at_ts: now,
    closed_at: null,
    note,
    amount_sol: amountSol,
    sol_usd_at_open: solUsd,
    initial_value_usd: round(initialValueUsd, 4),
    bin_step: binStep,
    fee_pct: feePct,
    bins_below: binsBelow,
    bins_above: binsAbove,
    raw_active_price: rawActivePrice,
    price_scale: priceScale,
    entry_price: entryPrice,
    active_price: entryPrice,
    lower_price: lowerPrice,
    upper_price: upperPrice,
    pool_tvl_usd_at_open: poolTvlUsd,
    tvl_share: round(tvlShare, 8),
    liquidity: L,
    x_initial: xTokens,
    y_initial_usd: round(yUsd, 4),
    last_candle_timestamp: latestCandle?.ts ?? now,
    last_price: entryPrice,
    last_tick_at: null,
    fees_earned_usd: 0,
    in_range_candles: 0,
    total_candles_seen: 0,
    current_value_usd: round(initialValueUsd, 4),
    current_x_tokens: xTokens,
    current_y_usd: round(yUsd, 4),
    il_usd: 0,
    il_pct: 0,
    net_pnl_usd: 0,
  };

  const data = load();
  data.positions[id] = position;
  save(data);
  log("paper", `Opened ${id} on ${pool_address.slice(0, 8)} (${strategyKey}, ${amountSol} SOL)`);
  return formatSummary(position);
}

/**
 * Tick all open paper positions: fetch new candles since each position's
 * last_candle_timestamp, accrue fees per in-range candle, recompute IL.
 * Returns a summary of what changed.
 */
export async function tickPaperPositions() {
  const data = load();
  const openPositions = Object.values(data.positions).filter((p) => p.status === "open");
  if (openPositions.length === 0) {
    return { ticked: 0, positions: [] };
  }

  const updates = [];
  for (const pos of openPositions) {
    try {
      const updated = await tickOne(pos);
      data.positions[pos.id] = updated;
      updates.push({
        id: updated.id,
        pool: updated.pool_address,
        new_candles: updated._lastTickNewCandles ?? 0,
        fees_earned_usd: updated.fees_earned_usd,
        il_pct: updated.il_pct,
        net_pnl_usd: updated.net_pnl_usd,
        in_range_pct:
          updated.total_candles_seen > 0
            ? round((updated.in_range_candles / updated.total_candles_seen) * 100, 1)
            : null,
      });
    } catch (e) {
      log("paper_warn", `Tick failed for ${pos.id}: ${e.message}`);
      updates.push({ id: pos.id, error: e.message });
    }
  }
  save(data);
  return { ticked: updates.length, positions: updates };
}

async function tickOne(pos) {
  const candles = await fetchRecentCandles(pos.pool_address);
  const newCandles = candles.filter((c) => c.ts > pos.last_candle_timestamp);
  if (newCandles.length === 0) {
    pos._lastTickNewCandles = 0;
    pos.last_tick_at = new Date().toISOString();
    return pos;
  }

  let feesUsd = pos.fees_earned_usd;
  let inRange = pos.in_range_candles;
  let totalSeen = pos.total_candles_seen;
  const feeRate = pos.fee_pct / 100;
  let latestPrice = pos.last_price;
  let latestTs = pos.last_candle_timestamp;

  for (const c of newCandles) {
    totalSeen += 1;
    const priceTouchedRange = c.high >= pos.lower_price && c.low <= pos.upper_price;
    if (priceTouchedRange) {
      inRange += 1;
      // Approximate: fee accrual proportional to fraction of candle inside range
      const effHigh = Math.min(c.high, pos.upper_price);
      const effLow = Math.max(c.low, pos.lower_price);
      const candleSpan = Math.max(c.high - c.low, 1e-12);
      const inRangeSpan = Math.max(effHigh - effLow, 0);
      const inRangeFraction = candleSpan > 0 ? inRangeSpan / candleSpan : 1;
      feesUsd += c.volume * feeRate * pos.tvl_share * inRangeFraction;
    }
    latestPrice = c.close;
    latestTs = c.ts;
  }

  const lp = computeLpValue({
    L: pos.liquidity,
    lowerPrice: pos.lower_price,
    upperPrice: pos.upper_price,
    currentPrice: latestPrice,
  });
  const ilRatio = computeIlRatio({
    entryPrice: pos.entry_price ?? pos.active_price,
    currentPrice: latestPrice,
    lowerPrice: pos.lower_price,
    upperPrice: pos.upper_price,
  });
  const ilUsd = pos.initial_value_usd * ilRatio;
  const ilPct = ilRatio * 100;
  const netPnl = feesUsd + ilUsd;

  return {
    ...pos,
    last_candle_timestamp: latestTs,
    last_tick_at: new Date().toISOString(),
    last_price: latestPrice,
    fees_earned_usd: round(feesUsd, 4),
    in_range_candles: inRange,
    total_candles_seen: totalSeen,
    current_value_usd: round(lp.valueUsd, 4),
    current_x_tokens: lp.xTokens,
    current_y_usd: round(lp.yUsd, 4),
    il_usd: round(ilUsd, 4),
    il_pct: round(ilPct, 4),
    net_pnl_usd: round(netPnl, 4),
    _lastTickNewCandles: newCandles.length,
  };
}

export function getPaperPosition({ id }) {
  if (!id) throw new Error("id is required");
  const data = load();
  const pos = data.positions[id];
  if (!pos) return { error: `Paper position ${id} not found` };
  const durationMs = Date.now() - pos.opened_at_ts;
  const durationDays = Math.max(durationMs / 86_400_000, 1 / 1440);
  const annualizedFeeApr =
    pos.initial_value_usd > 0
      ? round((pos.fees_earned_usd / pos.initial_value_usd) * (365 / durationDays) * 100, 2)
      : null;
  return {
    ...formatSummary(pos),
    annualized_fee_apr_pct: annualizedFeeApr,
    age_hours: round(durationMs / 3_600_000, 2),
  };
}

export function closePaperPosition({ id, reason = null }) {
  if (!id) throw new Error("id is required");
  const data = load();
  const pos = data.positions[id];
  if (!pos) return { error: `Paper position ${id} not found` };
  if (pos.status === "closed") return { error: `Paper position ${id} already closed` };

  pos.status = "closed";
  pos.closed_at = new Date().toISOString();
  pos.close_reason = reason;
  data.positions[id] = pos;
  save(data);
  log(
    "paper",
    `Closed ${id} — fees=${pos.fees_earned_usd} IL=${pos.il_pct}% reason=${reason || "n/a"}`,
  );
  return getPaperPosition({ id });
}

export function listPaperPositions({ status } = {}) {
  const data = load();
  const all = Object.values(data.positions);
  const filtered = status ? all.filter((p) => p.status === status) : all;
  return {
    total: filtered.length,
    positions: filtered
      .sort((a, b) => b.opened_at_ts - a.opened_at_ts)
      .map((p) => ({
        id: p.id,
        pool_address: p.pool_address,
        pool_name: p.pool_name,
        strategy: p.strategy,
        status: p.status,
        opened_at: p.opened_at,
        closed_at: p.closed_at,
        amount_sol: p.amount_sol,
        initial_value_usd: p.initial_value_usd,
        current_value_usd: p.current_value_usd,
        fees_earned_usd: p.fees_earned_usd,
        il_pct: p.il_pct,
        net_pnl_usd: p.net_pnl_usd,
        in_range_pct:
          p.total_candles_seen > 0
            ? round((p.in_range_candles / p.total_candles_seen) * 100, 1)
            : null,
      })),
  };
}
