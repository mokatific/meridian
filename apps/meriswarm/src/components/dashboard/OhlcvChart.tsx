"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useChartIndicators } from "@/hooks/useChartIndicators";
import { useGeckoTrades } from "@/hooks/useGeckoTrades";
import { useGeckoPool } from "@/hooks/useGeckoPool";
import { useJupiterToken } from "@/hooks/useJupiterToken";
import type { Candle, GeckoTrade } from "@/lib/types";
import { cn, shortAddr, fmtUsd } from "@/lib/utils";

const INTERVALS = ["5_MINUTE", "15_MINUTE"] as const;
type Interval = (typeof INTERVALS)[number];

// ─── Chart canvas (lightweight-charts v5) ────────────────────────────────────

function ChartCanvas({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;
    let chart: ReturnType<typeof import("lightweight-charts").createChart> | null = null;

    import("lightweight-charts").then(
      ({ createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries }) => {
        if (!containerRef.current) return;
        chart = createChart(containerRef.current, {
          layout: { background: { type: ColorType.Solid, color: "#09090b" }, textColor: "#a1a1aa" },
          grid: { vertLines: { color: "#27272a" }, horzLines: { color: "#27272a" } },
          crosshair: { mode: CrosshairMode.Normal },
          rightPriceScale: { borderColor: "#3f3f46" },
          timeScale: { borderColor: "#3f3f46", timeVisible: true },
          width: containerRef.current.clientWidth,
          height: 360,
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderUpColor: "#22c55e",
          borderDownColor: "#ef4444",
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: "#3f3f46",
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
        chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candleSeries.setData(
          candles.map((c) => ({
            time: c.time as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        volumeSeries.setData(
          candles.map((c) => ({
            time: c.time as any,
            value: c.volume,
            color: c.close >= c.open ? "#22c55e44" : "#ef444444",
          })),
        );
        chart.timeScale().fitContent();
      },
    );

    return () => {
      chart?.remove();
    };
  }, [candles]);

  return <div ref={containerRef} className="w-full" />;
}

// ─── Token Intel panel ────────────────────────────────────────────────────────

function TokenIntel({ mint }: { mint: string }) {
  const { data } = useJupiterToken(mint);
  const asset = data?.asset;
  if (!asset) return null;

  const audit = asset.audit;
  const hasRisk = audit && (!audit.mintAuthorityDisabled || !audit.freezeAuthorityDisabled);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {asset.icon && <img src={asset.icon} alt="" className="h-6 w-6 rounded-full" />}
        <span className="font-medium text-zinc-200">{asset.symbol}</span>
        <span className="text-xs text-zinc-500">{asset.name}</span>
        {asset.isVerified && (
          <Badge className="bg-blue-900/40 text-blue-300 text-xs">verified</Badge>
        )}
        {asset.organicScoreLabel && (
          <span
            className={cn(
              "rounded border px-1.5 py-px text-xs",
              (asset.organicScore ?? 0) >= 70
                ? "border-green-800 text-green-400"
                : (asset.organicScore ?? 0) >= 40
                  ? "border-amber-800 text-amber-400"
                  : "border-red-800 text-red-400",
            )}
          >
            organic {asset.organicScoreLabel}
          </span>
        )}
        {hasRisk && (
          <span className="rounded border border-red-800 text-red-400 px-1.5 py-px text-xs">
            ⚠ risk
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        {asset.usdPrice && (
          <div>
            <span className="text-zinc-600">Price</span>
            <br />
            <span className="text-zinc-300">${asset.usdPrice.toPrecision(4)}</span>
          </div>
        )}
        {asset.mcap && (
          <div>
            <span className="text-zinc-600">MCap</span>
            <br />
            <span className="text-zinc-300">{fmtUsd(asset.mcap)}</span>
          </div>
        )}
        {asset.holderCount && (
          <div>
            <span className="text-zinc-600">Holders</span>
            <br />
            <span className="text-zinc-300">{asset.holderCount.toLocaleString()}</span>
          </div>
        )}
        {asset.ctLikes != null && (
          <div>
            <span className="text-zinc-600">CT likes</span>
            <br />
            <span className="text-zinc-300">
              {asset.ctLikes} <span className="text-zinc-600">({asset.smartCtLikes} smart)</span>
            </span>
          </div>
        )}
      </div>

      {asset.stats24h && (
        <div className="grid grid-cols-4 gap-2 text-xs border-t border-zinc-800 pt-2">
          <div>
            <span className="text-zinc-600">Vol 24h</span>
            <br />
            <span className="text-zinc-300">
              {fmtUsd((asset.stats24h.buyVolume ?? 0) + (asset.stats24h.sellVolume ?? 0))}
            </span>
          </div>
          <div>
            <span className="text-zinc-600">Organic vol</span>
            <br />
            <span className="text-zinc-300">
              {fmtUsd(
                (asset.stats24h.buyOrganicVolume ?? 0) + (asset.stats24h.sellOrganicVolume ?? 0),
              )}
            </span>
          </div>
          <div>
            <span className="text-zinc-600">Traders</span>
            <br />
            <span className="text-zinc-300">{asset.stats24h.numTraders ?? "—"}</span>
          </div>
          <div>
            <span className="text-zinc-600">Net buyers</span>
            <br />
            <span
              className={cn(
                "",
                (asset.stats24h.numNetBuyers ?? 0) >= 0 ? "text-green-400" : "text-red-400",
              )}
            >
              {asset.stats24h.numNetBuyers ?? "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live trades feed ─────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: GeckoTrade }) {
  const isBuy = trade.kind === "buy";
  const vol = parseFloat(trade.volume_in_usd);
  const time = new Date(trade.block_timestamp);

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs py-1.5 border-b border-zinc-800/40",
        isBuy ? "bg-green-950/10" : "bg-red-950/10",
      )}
    >
      <span className={cn("w-8 font-medium shrink-0", isBuy ? "text-green-400" : "text-red-400")}>
        {isBuy ? "BUY" : "SELL"}
      </span>
      <span className="text-zinc-300 w-16 shrink-0 text-right">{fmtUsd(vol)}</span>
      <span className="text-zinc-500 w-20 shrink-0">
        {shortAddr(trade.from_token_amount ? trade.tx_from_address : "")}
      </span>
      <a
        href={`https://solscan.io/tx/${trade.tx_hash}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-zinc-600 hover:text-zinc-400 truncate"
      >
        {trade.tx_hash.slice(0, 12)}…
      </a>
      <span className="ml-auto text-zinc-700 shrink-0">{time.toLocaleTimeString()}</span>
    </div>
  );
}

function LiveTrades({ poolAddress }: { poolAddress: string }) {
  const { data, isLoading } = useGeckoTrades(poolAddress);
  const trades: GeckoTrade[] =
    data?.data?.map((t: { attributes: GeckoTrade }) => t.attributes) ?? [];

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-3 py-2 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">Live Trades</span>
        <span className="text-xs text-zinc-600">auto-refreshes 30s</span>
      </div>
      {isLoading ? (
        <div className="p-3 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full bg-zinc-900" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <p className="p-4 text-center text-xs text-zinc-600">No recent trades.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto px-3">
          {trades.slice(0, 30).map((t) => (
            <TradeRow key={t.tx_hash} trade={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Indicator state pills ────────────────────────────────────────────────────

function IndicatorPills({ data }: { data: ChartResponse }) {
  const latest = data.latest;
  if (!latest) return null;
  const states = latest.states ?? {};

  return (
    <div className="flex flex-wrap gap-1.5">
      {latest.rsi != null && (
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-xs",
            latest.rsi < 30
              ? "border-green-800 text-green-400"
              : latest.rsi > 70
                ? "border-red-800 text-red-400"
                : "border-zinc-700 text-zinc-400",
          )}
        >
          RSI {latest.rsi.toFixed(1)}
        </span>
      )}
      {latest.supertrend && (
        <span
          className={cn(
            "rounded border px-2 py-0.5 text-xs",
            latest.supertrend.direction === "bullish"
              ? "border-green-800 text-green-400"
              : "border-red-800 text-red-400",
          )}
        >
          ST {latest.supertrend.direction}
        </span>
      )}
      {states.supertrendBreakUp && (
        <span className="rounded border border-green-700 bg-green-950/30 px-2 py-0.5 text-xs text-green-300">
          ↑ break up
        </span>
      )}
      {states.supertrendBreakDown && (
        <span className="rounded border border-red-700 bg-red-950/30 px-2 py-0.5 text-xs text-red-300">
          ↓ break down
        </span>
      )}
      {states.priceAboveUpperBand && (
        <span className="rounded border border-amber-700 px-2 py-0.5 text-xs text-amber-400">
          above BB
        </span>
      )}
      {states.priceBelowLowerBand && (
        <span className="rounded border border-blue-700 px-2 py-0.5 text-xs text-blue-400">
          below BB
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

import type { ChartResponse } from "@/lib/types";

export function OhlcvChart() {
  const [mintInput, setMintInput] = useState("");
  const [poolInput, setPoolInput] = useState("");
  const [mint, setMint] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [interval, setInterval] = useState<Interval>("5_MINUTE");
  const [useGecko, setUseGecko] = useState(false);

  const { data: meridianData, isLoading: meridianLoading } = useChartIndicators(
    useGecko ? null : mint,
    interval,
    200,
  );
  const { data: geckoOhlcvData, isLoading: geckoLoading } = useGeckoPool(
    useGecko ? poolAddress : null,
  );

  const chartData: ChartResponse | null = meridianData ?? null;
  const loading = useGecko ? geckoLoading : meridianLoading;

  const handleLoad = () => {
    const m = mintInput.trim();
    const p = poolInput.trim();
    if (m) setMint(m);
    if (p) setPoolAddress(p);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <label className="text-xs text-zinc-600">Token mint (for Meridian indicators)</label>
          <Input
            placeholder="So111…"
            value={mintInput}
            onChange={(e) => setMintInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            className="border-zinc-700 bg-zinc-900 font-mono text-sm w-64"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-600">Pool address (for live trades)</label>
          <Input
            placeholder="5rCf1D…"
            value={poolInput}
            onChange={(e) => setPoolInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            className="border-zinc-700 bg-zinc-900 font-mono text-sm w-64"
          />
        </div>
        <div className="flex rounded-md border border-zinc-800 overflow-hidden self-end">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className={cn(
                "px-3 py-2 text-xs transition-colors",
                interval === iv
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800",
              )}
            >
              {iv.replace("_", " ")}
            </button>
          ))}
        </div>
        <Button
          onClick={handleLoad}
          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100 self-end"
        >
          Load
        </Button>
      </div>

      {/* Token intel */}
      {mint && <TokenIntel mint={mint} />}

      {/* Chart */}
      {!mint && !poolAddress && (
        <p className="py-8 text-center text-sm text-zinc-600">
          Enter a token mint for the chart + indicators, and/or a pool address for live trades.
        </p>
      )}

      {loading && mint && <Skeleton className="h-96 w-full rounded-lg bg-zinc-900" />}

      {chartData?.candles && chartData.candles.length > 0 && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs text-zinc-400">{chartData.mint?.slice(0, 8)}…</span>
            <span className="text-xs text-zinc-600">
              {chartData.interval} · {chartData.candles.length} candles
            </span>
            {chartData.candles.length > 0 && (
              <span
                className={cn(
                  "text-xs font-medium",
                  chartData.candles[chartData.candles.length - 1].close >= chartData.candles[0].open
                    ? "text-green-400"
                    : "text-red-400",
                )}
              >
                {chartData.candles[chartData.candles.length - 1].close.toPrecision(6)}
              </span>
            )}
            <div className="ml-auto">
              <IndicatorPills data={chartData} />
            </div>
          </div>
          <ChartCanvas candles={chartData.candles} />
        </div>
      )}

      {/* Live trades */}
      {poolAddress && <LiveTrades poolAddress={poolAddress} />}
    </div>
  );
}
