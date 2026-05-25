import { config } from "../config.js";
import { log } from "../logger.js";

const GECKO_BASE = "https://api.geckoterminal.com/api/v2";
const DATAPI_POOL_BASE = "https://dlmm.datapi.meteora.ag/pools";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const STRATEGIES = new Set(["spot", "curve", "bid_ask"]);
const DEFAULT_HOURS = 24;
const MAX_CANDLES = 1000;

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function fetchPoolDetail(poolAddress) {
  const res = await fetch(`${DATAPI_POOL_BASE}/${poolAddress}`);
  if (!res.ok) throw new Error(`Pool detail API ${res.status}`);
  return res.json();
}

async function fetchGeckoOhlcv(poolAddress, hours) {
  const limit = Math.min(MAX_CANDLES, Math.ceil((hours * 60) / 5));
  const url = `${GECKO_BASE}/networks/solana/pools/${poolAddress}/ohlcv/minute?aggregate=5&limit=${limit}&currency=usd`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GeckoTerminal ${res.status}`);
  const data = await res.json();
  const list = data?.data?.attributes?.ohlcv_list || [];
  // GeckoTerminal returns [ts, open, high, low, close, volume]; newest first
  return list
    .map((row) => ({
      ts: Number(row[0]) * 1000,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }))
    .filter((c) => Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.ts - b.ts);
}

function buildBinWeights(strategy, lowerBin, upperBin, activeBin) {
  const bins = [];
  for (let id = lowerBin; id <= upperBin; id++) bins.push(id);
  if (bins.length === 0) return [];

  let raw;
  switch (strategy) {
    case "spot":
      raw = bins.map(() => 1);
      break;
    case "curve": {
      // Bell curve centered on active bin
      const sigma = Math.max(1, (upperBin - lowerBin) / 4);
      raw = bins.map((id) => Math.exp(-Math.pow((id - activeBin) / sigma, 2)));
      break;
    }
    case "bid_ask": {
      // Edge-weighted: linear in distance from active
      const halfWidth = Math.max(1, Math.max(activeBin - lowerBin, upperBin - activeBin));
      raw = bins.map((id) => Math.abs(id - activeBin) / halfWidth + 0.05);
      break;
    }
    default:
      raw = bins.map(() => 1);
  }
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return bins.map((id, i) => ({ binId: id, weight: raw[i] / sum }));
}

function binPrice(binStep, binId, activeBinId, activePrice) {
  const stepMul = 1 + binStep / 10000;
  return activePrice * Math.pow(stepMul, binId - activeBinId);
}

function binIdForPrice(price, binStep, activeBinId, activePrice) {
  if (!(price > 0) || !(activePrice > 0)) return activeBinId;
  const stepMul = Math.log(1 + binStep / 10000);
  return activeBinId + Math.round(Math.log(price / activePrice) / stepMul);
}

function computeIlSingleSideSol(weights, binPrices, endPrice, initialUsd) {
  // Single-side SOL (Y): every bin starts holding Y. As price drops below a bin,
  // that bin converts Y -> X at the bin's price. So at end:
  //   - bins where binPrice > endPrice: still Y (SOL)
  //   - bins where binPrice <= endPrice: converted to X at binPrice
  let yValue = 0;
  let xValue = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i].weight;
    const bp = binPrices[i];
    const slice = w * initialUsd;
    if (bp > endPrice) {
      yValue += slice;
    } else {
      // tokens acquired at bp, now worth endPrice each
      const xAmount = slice / bp;
      xValue += xAmount * endPrice;
    }
  }
  const lpValue = yValue + xValue;
  // HODL = held SOL the whole time = initialUsd (constant SOL-USD assumption)
  const ilUsd = lpValue - initialUsd;
  const ilPct = (ilUsd / initialUsd) * 100;
  return { lpValue, ilUsd, ilPct };
}

function synthCandlesFromPool(pool, hours) {
  // Fallback when OHLCV API unavailable: generate a flat synthetic 5m series
  // using the pool's recent average volume and price so the sim can still run.
  const numCandles = Math.ceil((hours * 60) / 5);
  const price = num(pool?.current_price ?? pool?.price, null);
  const volWindow = num(pool?.volume ?? pool?.volume_window, 0);
  const tfMinutes = 60; // assume volume window ~1h if unknown
  const volPerCandle = (volWindow / Math.max(1, tfMinutes / 5)) * 0.8;
  if (!(price > 0)) return [];
  const now = Date.now();
  const out = [];
  for (let i = 0; i < numCandles; i++) {
    const ts = now - (numCandles - i) * 5 * 60 * 1000;
    out.push({
      ts,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: volPerCandle,
      synth: true,
    });
  }
  return out;
}

/**
 * Replay 5m OHLCV candles against a chosen liquidity distribution to estimate
 * fees, impermanent loss, in-range time, and TVL share for a hypothetical LP.
 */
export async function simulateLpPosition({
  pool_address,
  amount_sol,
  bins_below,
  bins_above = 0,
  strategy = config.strategy?.strategy || "spot",
  hours = DEFAULT_HOURS,
  sol_price_usd = null,
}) {
  if (!pool_address) throw new Error("pool_address is required");
  const amountSol = num(amount_sol, null);
  if (!(amountSol > 0)) throw new Error("amount_sol must be positive");
  const requestedBinsBelow = num(bins_below, null);
  if (!(requestedBinsBelow >= 0)) throw new Error("bins_below must be >= 0");
  const requestedBinsAbove = num(bins_above, 0);
  const strategyKey = String(strategy || "spot").toLowerCase();
  if (!STRATEGIES.has(strategyKey)) {
    throw new Error(`strategy must be one of: ${[...STRATEGIES].join(", ")}`);
  }
  const lookbackHours = Math.max(1, Math.min(168, num(hours, DEFAULT_HOURS)));

  const pool = await fetchPoolDetail(pool_address).catch((e) => {
    log("simulator_warn", `Pool detail fetch failed: ${e.message}`);
    return null;
  });
  if (!pool) throw new Error(`Pool ${pool_address} not found`);

  const binStep = num(pool?.dlmm_params?.bin_step ?? pool?.pool_config?.bin_step, null);
  if (!(binStep > 0)) throw new Error("Could not read pool bin_step");
  const feePct = num(pool?.fee_pct ?? pool?.base_fee_pct, null);
  if (!(feePct > 0)) throw new Error("Could not read pool fee_pct");
  const poolTvlUsd = num(pool?.tvl ?? pool?.active_tvl, 0);
  const activePrice = num(pool?.current_price ?? pool?.price, null);
  if (!(activePrice > 0)) throw new Error("Could not read pool current_price");

  // Active bin id is unknown without SDK; use 0 as origin and compute all bins relative to it.
  const activeBinId = 0;
  const lowerBin = activeBinId - Math.round(requestedBinsBelow);
  const upperBin = activeBinId + Math.round(requestedBinsAbove);
  const totalBins = upperBin - lowerBin + 1;
  if (totalBins < 1) throw new Error("Bin range must include at least 1 bin");

  const weights = buildBinWeights(strategyKey, lowerBin, upperBin, activeBinId);
  const binPrices = weights.map((w) => binPrice(binStep, w.binId, activeBinId, activePrice));

  // Fetch OHLCV (real first, synthetic fallback)
  let candles = [];
  let dataSource = "geckoterminal";
  try {
    candles = await fetchGeckoOhlcv(pool_address, lookbackHours);
  } catch (e) {
    log("simulator_warn", `OHLCV fetch failed: ${e.message} — falling back to pool snapshot`);
    candles = synthCandlesFromPool(pool, lookbackHours);
    dataSource = "pool_snapshot_fallback";
  }
  if (candles.length === 0) {
    candles = synthCandlesFromPool(pool, lookbackHours);
    dataSource = "pool_snapshot_fallback";
  }
  if (candles.length === 0) throw new Error("No candles available for simulation");

  // Convert candle absolute prices to ratios relative to the candle series' starting close,
  // then anchor to the pool's current activePrice. This makes the candle data interchangeable
  // with the pool's bin price space regardless of whether candles are in USD or SOL.
  const refPrice = candles[0].close;
  const scale = activePrice / refPrice;
  for (const c of candles) {
    c.priceLow = c.low * scale;
    c.priceHigh = c.high * scale;
    c.priceClose = c.close * scale;
  }

  // SOL price for USD conversion (default ~$160; allow caller override)
  const solUsd = num(sol_price_usd, 160);
  const initialUsd = amountSol * solUsd;

  // Per-bin TVL share — assume uniform pool TVL across our N bins (best fallback
  // when SDK per-bin reserve data isn't fetched). Position adds initialUsd weighted.
  const poolTvlPerBin = poolTvlUsd > 0 ? poolTvlUsd / Math.max(1, totalBins) : 0;
  const tvlShares = weights.map((w) => {
    const myBinUsd = w.weight * initialUsd;
    const denom = poolTvlPerBin + myBinUsd;
    return denom > 0 ? myBinUsd / denom : 0;
  });
  const tvlShareAvg = weights.reduce((acc, w, i) => acc + w.weight * tvlShares[i], 0);

  // Replay
  let feesUsd = 0;
  let inRangeCandles = 0;
  for (const c of candles) {
    const lowBin = binIdForPrice(c.priceLow, binStep, activeBinId, activePrice);
    const highBin = binIdForPrice(c.priceHigh, binStep, activeBinId, activePrice);
    const candleLow = Math.min(lowBin, highBin);
    const candleHigh = Math.max(lowBin, highBin);

    // Bins of our position touched by this candle's [low, high] sweep
    let coverage = 0;
    let candleFee = 0;
    for (let i = 0; i < weights.length; i++) {
      const bId = weights[i].binId;
      if (bId < candleLow || bId > candleHigh) continue;
      coverage += weights[i].weight;
      // Fee accrual: volume in that bin * fee% * our share of that bin
      // Approximation: candle volume spreads evenly across bins it touched
      const binsTouched = Math.max(1, candleHigh - candleLow + 1);
      const volInBin = c.volume / binsTouched;
      candleFee += volInBin * (feePct / 100) * tvlShares[i];
    }
    if (coverage > 0) inRangeCandles += 1;
    feesUsd += candleFee;
  }
  const inRangePct = (inRangeCandles / candles.length) * 100;

  // IL: use the final candle's price vs deploy active price
  const endPrice = candles[candles.length - 1].priceClose;
  const il = computeIlSingleSideSol(weights, binPrices, endPrice, initialUsd);

  const netPnL = feesUsd + il.ilUsd;
  const durationMs = candles[candles.length - 1].ts - candles[0].ts;
  const durationDays = Math.max(durationMs / 86_400_000, 5 / 1440);
  const annualizedFeeApr = (feesUsd / initialUsd) * (365 / durationDays) * 100;

  return {
    pool: pool_address,
    strategy: strategyKey,
    bins_below: Math.round(requestedBinsBelow),
    bins_above: Math.round(requestedBinsAbove),
    total_bins: totalBins,
    deploy_amount_sol: amountSol,
    initial_value_usd: round(initialUsd, 2),
    sol_price_usd: solUsd,
    pool_tvl_usd: round(poolTvlUsd, 0),
    fee_pct: feePct,
    bin_step: binStep,
    active_price: activePrice,
    end_price: round(endPrice, 8),
    price_change_pct: round(((endPrice - activePrice) / activePrice) * 100, 3),
    candles_used: candles.length,
    duration_hours: round(durationMs / 3_600_000, 2),
    data_source: dataSource,
    feesEarned: round(feesUsd, 2),
    ilUsd: round(il.ilUsd, 2),
    ilPct: round(il.ilPct, 3),
    netPnL: round(netPnL, 2),
    inRangePct: round(inRangePct, 1),
    tvlShareAvg: round(tvlShareAvg, 6),
    annualizedFeeApr: round(annualizedFeeApr, 1),
    notes:
      dataSource === "pool_snapshot_fallback"
        ? "OHLCV API unavailable — used flat synthetic candles from pool snapshot. IL is approximate."
        : undefined,
  };
}

function round(n, decimals = 2) {
  if (!Number.isFinite(n)) return n;
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}
