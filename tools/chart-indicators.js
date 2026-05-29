import { config } from "../config.js";
import { log } from "../logger.js";
import { agentMeridianJson, getAgentMeridianHeaders } from "./agent-meridian.js";
import { safeNumber } from "../utils/number.js";

const DEFAULT_INTERVALS = ["5_MINUTE"];
const DEFAULT_CANDLES = 298;

function normalizeIntervals(intervals) {
  const list = Array.isArray(intervals) ? intervals : DEFAULT_INTERVALS;
  return list
    .map((value) =>
      String(value || "")
        .trim()
        .toUpperCase(),
    )
    .filter((value) => value === "5_MINUTE" || value === "15_MINUTE");
}

function safeNum(value) {
  return safeNumber(value, null);
}

function buildSignalSummary(payload) {
  const latest = payload?.latest || {};
  const candle = latest?.candle || {};
  const previousCandle = latest?.previousCandle || {};
  const rsi = safeNum(latest?.rsi?.value);
  const bollinger = latest?.bollinger || {};
  const supertrend = latest?.supertrend || {};
  const fibonacciLevels = latest?.fibonacci?.levels || {};
  return {
    close: safeNum(candle.close),
    previousClose: safeNum(previousCandle.close),
    rsi,
    lowerBand: safeNum(bollinger.lower),
    middleBand: safeNum(bollinger.middle),
    upperBand: safeNum(bollinger.upper),
    supertrendValue: safeNum(supertrend.value),
    supertrendDirection: String(supertrend.direction || "unknown"),
    supertrendBreakUp: !!latest?.states?.supertrendBreakUp,
    supertrendBreakDown: !!latest?.states?.supertrendBreakDown,
    fib50: safeNum(fibonacciLevels["0.500"]),
    fib618: safeNum(fibonacciLevels["0.618"]),
    fib786: safeNum(fibonacciLevels["0.786"]),
  };
}

function evaluatePreset(side, preset, payload) {
  const summary = buildSignalSummary(payload);
  const oversold = Number(config.indicators.rsiOversold ?? 30);
  const overbought = Number(config.indicators.rsiOverbought ?? 80);
  const close = summary.close;
  const previousClose = summary.previousClose;
  const lowerBand = summary.lowerBand;
  const upperBand = summary.upperBand;
  const rsi = summary.rsi;
  const isBullish = summary.supertrendDirection === "bullish";
  const isBearish = summary.supertrendDirection === "bearish";
  const crossedUp = (level) =>
    level != null &&
    close != null &&
    previousClose != null &&
    previousClose < level &&
    close >= level;
  const crossedDown = (level) =>
    level != null &&
    close != null &&
    previousClose != null &&
    previousClose > level &&
    close <= level;

  switch (preset) {
    case "supertrend_break":
      return side === "entry"
        ? {
            confirmed:
              summary.supertrendBreakUp ||
              (isBullish &&
                close != null &&
                summary.supertrendValue != null &&
                close >= summary.supertrendValue),
            reason: summary.supertrendBreakUp
              ? "Supertrend flipped bullish"
              : "Price is above bullish Supertrend",
            signal: summary,
          }
        : {
            confirmed:
              summary.supertrendBreakDown ||
              (isBearish &&
                close != null &&
                summary.supertrendValue != null &&
                close <= summary.supertrendValue),
            reason: summary.supertrendBreakDown
              ? "Supertrend flipped bearish"
              : "Price is below bearish Supertrend",
            signal: summary,
          };
    case "rsi_reversal":
      return side === "entry"
        ? {
            confirmed: rsi != null && rsi <= oversold,
            reason: `RSI ${rsi ?? "n/a"} <= oversold ${oversold}`,
            signal: summary,
          }
        : {
            confirmed: rsi != null && rsi >= overbought,
            reason: `RSI ${rsi ?? "n/a"} >= overbought ${overbought}`,
            signal: summary,
          };
    case "bollinger_reversion":
      return side === "entry"
        ? {
            confirmed: close != null && lowerBand != null && close <= lowerBand,
            reason: `Close ${close ?? "n/a"} <= lower band ${lowerBand ?? "n/a"}`,
            signal: summary,
          }
        : {
            confirmed: close != null && upperBand != null && close >= upperBand,
            reason: `Close ${close ?? "n/a"} >= upper band ${upperBand ?? "n/a"}`,
            signal: summary,
          };
    case "rsi_plus_supertrend":
      return side === "entry"
        ? {
            confirmed: rsi != null && rsi <= oversold && (summary.supertrendBreakUp || isBullish),
            reason: `RSI oversold with bullish Supertrend context`,
            signal: summary,
          }
        : {
            confirmed:
              rsi != null && rsi >= overbought && (summary.supertrendBreakDown || isBearish),
            reason: `RSI overbought with bearish Supertrend context`,
            signal: summary,
          };
    case "supertrend_or_rsi":
      return side === "entry"
        ? {
            confirmed:
              summary.supertrendBreakUp ||
              (isBullish &&
                close != null &&
                summary.supertrendValue != null &&
                close >= summary.supertrendValue) ||
              (rsi != null && rsi <= oversold),
            reason: "Supertrend bullish confirmation or RSI oversold",
            signal: summary,
          }
        : {
            confirmed:
              summary.supertrendBreakDown ||
              (isBearish &&
                close != null &&
                summary.supertrendValue != null &&
                close <= summary.supertrendValue) ||
              (rsi != null && rsi >= overbought),
            reason: "Supertrend bearish confirmation or RSI overbought",
            signal: summary,
          };
    case "bb_plus_rsi":
      return side === "entry"
        ? {
            confirmed:
              close != null &&
              lowerBand != null &&
              close <= lowerBand &&
              rsi != null &&
              rsi <= oversold,
            reason: "Close at/below lower band with RSI oversold",
            signal: summary,
          }
        : {
            confirmed:
              close != null &&
              upperBand != null &&
              close >= upperBand &&
              rsi != null &&
              rsi >= overbought,
            reason: "Close at/above upper band with RSI overbought",
            signal: summary,
          };
    case "fibo_reclaim":
      return side === "entry"
        ? {
            confirmed:
              crossedUp(summary.fib618) || crossedUp(summary.fib50) || crossedUp(summary.fib786),
            reason: "Price reclaimed a key Fibonacci level",
            signal: summary,
          }
        : {
            confirmed: crossedUp(summary.fib618) || crossedUp(summary.fib50),
            reason: "Price reclaimed a key Fibonacci level upward",
            signal: summary,
          };
    case "fibo_reject":
      return side === "entry"
        ? {
            confirmed: crossedDown(summary.fib618) || crossedDown(summary.fib50),
            reason: "Price rejected from a key Fibonacci level",
            signal: summary,
          }
        : {
            confirmed:
              crossedDown(summary.fib618) ||
              crossedDown(summary.fib50) ||
              crossedDown(summary.fib786),
            reason: "Price rejected below a key Fibonacci level",
            signal: summary,
          };

    // ── New presets for new Solana pairs ─────────────────────────────────
    //
    // Rationale: classic indicators don't work well on brand-new Solana pairs
    // (too little history, high volatility, no meaningful ATH reference).
    // These presets are pragmatic — they avoid the worst entry points
    // (pumped ATH candles, RSI >70 momentum chases) rather than trying to
    // time perfect entries. "Not wrong" > "perfectly right" for new pairs.

    case "momentum_dip":
      // Entry: Supertrend bullish AND RSI has cooled off from overbought.
      // Accepts: RSI < 60 (not chasing a hot candle) — catches both genuine dips
      // (RSI oversold) and mild pullbacks (RSI 35–55). Only blocks entries when RSI
      // is clearly overbought (>60), which is when price is most likely at local top.
      // For new Solana pairs: avoids buying the first explosive 5m candle (RSI 80+),
      // waits for any cooling off, then enters while trend is intact.
      // Exit: supertrend flips bearish.
      return side === "entry"
        ? {
            confirmed: isBullish && rsi != null && rsi < 60,
            reason: !isBullish
              ? `BLOCKED: Supertrend bearish (${summary.supertrendDirection}), RSI ${rsi?.toFixed(1)}`
              : rsi != null && rsi >= 60
                ? `BLOCKED: RSI ${rsi?.toFixed(1)} overbought — wait for cooldown`
                : `Supertrend bullish, RSI ${rsi?.toFixed(1)} — confirmed`,
            signal: summary,
          }
        : {
            confirmed:
              summary.supertrendBreakDown ||
              (isBearish &&
                close != null &&
                summary.supertrendValue != null &&
                close <= summary.supertrendValue),
            reason: summary.supertrendBreakDown
              ? "Supertrend flipped bearish"
              : "Price below bearish Supertrend",
            signal: summary,
          };

    case "not_near_ath":
      // Entry: price is NOT above the upper Bollinger band (not at local ATH/extended top)
      // AND supertrend is bullish OR price is in oversold zone.
      // This is a NEGATIVE gate — it only blocks entries when price is clearly overextended.
      // Price below BB upper = fine. Price above BB upper = extended, skip.
      // Most useful when combined with other filters: "deploy if not at ATH AND trend ok".
      // Exit: price reaches upper band (take profit zone) or supertrend flips.
      return side === "entry"
        ? {
            confirmed:
              (isBullish || (rsi != null && rsi <= (oversold ?? 35))) &&
              (close == null || upperBand == null || close < upperBand), // not above upper BB
            reason:
              close != null && upperBand != null && close >= upperBand
                ? `BLOCKED: Price ${close?.toFixed(6)} at/above BB upper ${upperBand?.toFixed(6)} — extended, skip`
                : `Price below BB upper — not at local top, trend context ok`,
            signal: summary,
          }
        : {
            confirmed:
              (close != null && upperBand != null && close >= upperBand) ||
              summary.supertrendBreakDown ||
              (isBearish &&
                close != null &&
                summary.supertrendValue != null &&
                close <= summary.supertrendValue),
            reason: "Price at BB upper (local ATH) or Supertrend flipped bearish",
            signal: summary,
          };

    case "fibo_pullback":
      // Entry: price has pulled back into the 0.382–0.618 Fibonacci retracement zone
      // AND supertrend is still bullish. Classic "buy the dip" on a trending pair.
      // The 0.382–0.618 zone is the "golden pocket" — strong hands accumulate here.
      // For new pairs, fib levels are computed from the candle window high/low,
      // so they update continuously — this is fine, we just want "middle of range".
      // Exit: price reclaims fib 0.236 (near high) or supertrend flips.
      return side === "entry"
        ? {
            confirmed: (() => {
              if (!isBullish || close == null) return false;
              const fib382 =
                summary.fib50 != null && summary.fib618 != null
                  ? summary.fib618 + (summary.fib50 - summary.fib618) * 0.5 // approximate 0.382
                  : null;
              const fib618 = summary.fib618;
              // Price in golden pocket: between fib 0.382 and 0.618
              if (fib382 != null && fib618 != null) {
                return close >= fib618 && close <= fib382;
              }
              // Fallback: price near or below fib50 (middle of range)
              return summary.fib50 != null && close <= summary.fib50 * 1.005;
            })(),
            reason: `Price in Fibonacci golden pocket (0.382–0.618 zone) with bullish Supertrend`,
            signal: summary,
          }
        : {
            confirmed:
              summary.supertrendBreakDown ||
              (isBearish &&
                close != null &&
                summary.supertrendValue != null &&
                close <= summary.supertrendValue) ||
              (close != null &&
                summary.fib50 != null &&
                close >= summary.fib50 * 0.998 &&
                crossedUp(summary.fib50)),
            reason: "Supertrend flipped bearish or price reclaimed fib 0.5 mid-level",
            signal: summary,
          };

    case "supertrend_or_dip":
      // Permissive combo: confirms if EITHER supertrend just broke up OR RSI dipped
      // below oversold. Useful when you want to catch both breakout and dip entries.
      // Good for volatile new pairs where momentum can reverse fast.
      return side === "entry"
        ? {
            confirmed:
              summary.supertrendBreakUp || (isBullish && rsi != null && rsi <= (oversold ?? 35)),
            reason: summary.supertrendBreakUp
              ? "Supertrend just flipped bullish (breakout entry)"
              : `RSI oversold (${rsi ?? "n/a"}) with bullish Supertrend (dip entry)`,
            signal: summary,
          }
        : {
            confirmed: summary.supertrendBreakDown || (rsi != null && rsi >= overbought),
            reason: summary.supertrendBreakDown
              ? "Supertrend flipped bearish"
              : `RSI overbought (${rsi ?? "n/a"})`,
            signal: summary,
          };

    default:
      return {
        confirmed: false,
        reason: `Unknown preset ${preset}`,
        signal: summary,
      };
  }
}

async function fetchChartIndicatorsForMint(
  mint,
  {
    interval,
    candles = config.indicators.candles ?? DEFAULT_CANDLES,
    rsiLength = config.indicators.rsiLength ?? 2,
    refresh = false,
  } = {},
) {
  const normalizedInterval = String(interval || "15_MINUTE")
    .trim()
    .toUpperCase();
  const search = new URLSearchParams({
    interval: normalizedInterval,
    candles: String(candles),
    rsiLength: String(rsiLength),
  });
  if (refresh) search.set("refresh", "1");

  return agentMeridianJson(`/chart-indicators/${mint}?${search.toString()}`, {
    headers: getAgentMeridianHeaders(),
  });
}

export async function confirmIndicatorPreset({
  mint,
  side,
  preset = side === "entry" ? config.indicators.entryPreset : config.indicators.exitPreset,
  intervals = config.indicators.intervals,
  refresh = false,
} = {}) {
  if (!config.indicators.enabled || !mint || !preset) {
    return {
      enabled: false,
      confirmed: true,
      reason: "Indicators disabled or not configured",
      intervals: [],
    };
  }

  const targets = normalizeIntervals(intervals);
  if (targets.length === 0) {
    return {
      enabled: false,
      confirmed: true,
      reason: "No indicator intervals configured",
      intervals: [],
    };
  }

  const results = [];
  for (const interval of targets) {
    try {
      const payload = await fetchChartIndicatorsForMint(mint, { interval, refresh });
      const evaluation = evaluatePreset(side, preset, payload);
      results.push({
        interval,
        ok: true,
        confirmed: !!evaluation.confirmed,
        reason: evaluation.reason,
        signal: evaluation.signal,
        latest: payload?.latest || null,
      });
    } catch (error) {
      log(
        "indicators_warn",
        `Indicator fetch failed for ${mint.slice(0, 8)} ${interval}: ${error.message}`,
      );
      results.push({
        interval,
        ok: false,
        confirmed: null,
        reason: error.message,
        signal: null,
        latest: null,
      });
    }
  }

  const successful = results.filter((entry) => entry.ok);
  if (successful.length === 0) {
    return {
      enabled: true,
      confirmed: true,
      skipped: true,
      preset,
      side,
      reason: "Indicator API unavailable; falling back to existing logic",
      intervals: results,
    };
  }

  const requireAll = !!config.indicators.requireAllIntervals;
  const confirmed = requireAll
    ? successful.every((entry) => entry.confirmed)
    : successful.some((entry) => entry.confirmed);

  return {
    enabled: true,
    confirmed,
    skipped: false,
    preset,
    side,
    requireAllIntervals: requireAll,
    reason: confirmed
      ? `${preset} confirmed on ${successful
          .filter((entry) => entry.confirmed)
          .map((entry) => entry.interval)
          .join(", ")}`
      : `${preset} not confirmed on ${successful.map((entry) => `${entry.interval}[${entry.reason}]`).join(", ")}`,
    intervals: results,
  };
}
