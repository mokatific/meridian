"use client";

import { useRef, useEffect } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicSummary } from "@/hooks/usePublicSummary";
import type { TerminalEvent, NetworkOverview, DayTrend } from "@/lib/types";
import { cn, fmtUsd } from "@/lib/utils";

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className={cn("mt-1 text-xl font-bold tabular-nums", color ?? "text-zinc-100")}>
        {value}
      </div>
      {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Overview grid ────────────────────────────────────────────────────────────

function OverviewGrid({ ov }: { ov: NetworkOverview }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat
        label="Active agents"
        value={ov.activeAgents.toLocaleString()}
        sub={`of ${ov.registeredAgents.toLocaleString()} registered`}
      />
      <Stat
        label="Win rate (adj.)"
        value={`${ov.adjustedWinRatePct}%`}
        color={
          ov.adjustedWinRatePct >= 60
            ? "text-green-400"
            : ov.adjustedWinRatePct >= 50
              ? "text-amber-400"
              : "text-red-400"
        }
      />
      <Stat
        label="Total fees earned"
        value={fmtUsd(ov.totalFeesUsd)}
        sub={`${ov.syncedWalletFeesSol.toFixed(1)} SOL synced`}
        color="text-green-400"
      />
      <Stat
        label="Network PnL"
        value={fmtUsd(ov.totalPnlUsd)}
        color={ov.totalPnlUsd >= 0 ? "text-green-400" : "text-red-400"}
      />
      <Stat
        label="Total closes"
        value={ov.sampleCount.toLocaleString()}
        sub={`${ov.adjustedSampleCount.toLocaleString()} adjusted`}
      />
      <Stat label="Avg hold time" value={`${ov.avgHoldMinutes.toFixed(1)}m`} />
      <Stat
        label="Avg PnL per trade"
        value={`${ov.avgPnlPct >= 0 ? "+" : ""}${ov.avgPnlPct.toFixed(2)}%`}
        color={ov.avgPnlPct >= 0 ? "text-green-400" : "text-red-400"}
      />
      <Stat label="Lessons in network" value={ov.totalLessons.toLocaleString()} />
    </div>
  );
}

// ─── 7-day trend chart ────────────────────────────────────────────────────────

function TrendChart({ data }: { data: DayTrend[] }) {
  const fmt = (d: DayTrend) => ({ ...d, date: d.date.slice(5) }); // MM-DD
  const chartData = data.map(fmt);

  return (
    <div className="space-y-1">
      <div className="text-xs text-zinc-500">7-day network trend</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
          <YAxis
            yAxisId="pnl"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickFormatter={(v) => `$${v}`}
            width={50}
          />
          <YAxis
            yAxisId="closes"
            orientation="right"
            tick={{ fill: "#71717a", fontSize: 11 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 6,
              fontSize: 11,
            }}
            formatter={(v, name) => [
              name === "closes" ? Number(v).toLocaleString() : `$${Number(v).toFixed(0)}`,
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
          <Bar yAxisId="pnl" dataKey="feesUsd" name="fees $" fill="#22c55e" opacity={0.8} />
          <Bar
            yAxisId="pnl"
            dataKey="pnlUsd"
            name="pnl $"
            fill="#3b82f6"
            opacity={0.8}
            // color each bar red/green by value
          />
          <Line
            yAxisId="closes"
            type="monotone"
            dataKey="closes"
            name="closes"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Live terminal feed ───────────────────────────────────────────────────────

function parseEvent(line: string) {
  // "agent-XXXXXX closed POOL-SOL +1.23% • reason"
  // "agent-XXXXXX insight • lesson text"
  const parts = line.split(" ");
  const agentId = parts[0] ?? "";
  const verb = parts[1] ?? "";
  const rest = parts.slice(2).join(" ");
  return { agentId, verb, rest };
}

function TerminalLine({ event }: { event: TerminalEvent }) {
  const { agentId, verb, rest } = parseEvent(event.line);
  const time = new Date(event.at).toLocaleTimeString();

  const pnlMatch = rest.match(/([+-]\d+\.?\d*)%/);
  const pnlPct = pnlMatch ? parseFloat(pnlMatch[1]) : null;
  const isPositive = pnlPct !== null && pnlPct > 0;
  const isNegative = pnlPct !== null && pnlPct < 0;

  return (
    <div
      className={cn(
        "flex items-start gap-2 py-1.5 px-2 border-b border-zinc-800/30 text-xs font-mono",
        event.type === "lesson"
          ? "bg-blue-950/10"
          : isPositive
            ? "bg-green-950/10"
            : isNegative
              ? "bg-red-950/10"
              : "",
      )}
    >
      <span className="text-zinc-700 shrink-0 w-16">{time}</span>
      <span
        className={cn(
          "shrink-0 w-6 font-bold",
          event.type === "lesson"
            ? "text-blue-400"
            : isPositive
              ? "text-green-400"
              : isNegative
                ? "text-red-400"
                : "text-zinc-500",
        )}
      >
        {event.type === "lesson" ? "💡" : isPositive ? "▲" : isNegative ? "▼" : "•"}
      </span>
      <span className="text-amber-400/80 shrink-0">{agentId}</span>
      <span className={cn("shrink-0", event.type === "lesson" ? "text-blue-400" : "text-zinc-500")}>
        {verb}
      </span>
      <span className="text-zinc-300 leading-tight">{rest}</span>
    </div>
  );
}

function LiveFeed({ events }: { events: TerminalEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/60 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400">⚡ Live Network Feed</span>
        <span className="text-xs text-zinc-600">auto-refresh 30s · {events.length} events</span>
      </div>
      <div ref={scrollRef} className="max-h-80 overflow-y-auto">
        {events.map((e, i) => (
          <TerminalLine key={i} event={e} />
        ))}
      </div>
    </div>
  );
}

// ─── Top pools mini table ─────────────────────────────────────────────────────

function TopPoolsTable({ pools }: { pools: PublicSummary["topPools"] }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-3 py-2 bg-zinc-900/60 border-b border-zinc-800 text-xs font-medium text-zinc-400">
        🏆 Top Pools by Network PnL
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-600">
              <th className="py-1.5 px-3 text-left">Pool</th>
              <th className="py-1.5 px-2 text-right">Closes</th>
              <th className="py-1.5 px-2 text-right">PnL</th>
              <th className="py-1.5 px-2 text-right">Fees</th>
              <th className="py-1.5 px-2 text-right">Win%</th>
              <th className="py-1.5 px-2 text-right">Avg PnL</th>
              <th className="py-1.5 px-2 text-right">Avg hold</th>
            </tr>
          </thead>
          <tbody>
            {pools.map((p) => (
              <tr key={p.pool} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                <td className="py-2 px-3 font-medium text-zinc-200">{p.pool}</td>
                <td className="py-2 px-2 text-right text-zinc-500">
                  {p.adjustedSampleCount.toLocaleString()}
                </td>
                <td
                  className={cn(
                    "py-2 px-2 text-right font-medium",
                    p.totalPnlUsd >= 0 ? "text-green-400" : "text-red-400",
                  )}
                >
                  {fmtUsd(p.totalPnlUsd)}
                </td>
                <td className="py-2 px-2 text-right text-zinc-300">{fmtUsd(p.totalFeesUsd)}</td>
                <td
                  className={cn(
                    "py-2 px-2 text-right",
                    p.adjustedWinRatePct >= 65
                      ? "text-green-400"
                      : p.adjustedWinRatePct >= 55
                        ? "text-amber-400"
                        : "text-zinc-400",
                  )}
                >
                  {p.adjustedWinRatePct}%
                </td>
                <td
                  className={cn(
                    "py-2 px-2 text-right",
                    p.avgPnlPct >= 0 ? "text-green-400" : "text-red-400",
                  )}
                >
                  {p.avgPnlPct >= 0 ? "+" : ""}
                  {p.avgPnlPct.toFixed(2)}%
                </td>
                <td className="py-2 px-2 text-right text-zinc-500">
                  {p.avgHoldMinutes.toFixed(0)}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

import type { PublicSummary } from "@/lib/types";

export function NetworkIntelligence() {
  const { data, isLoading } = usePublicSummary();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 bg-zinc-900" />
          ))}
        </div>
        <Skeleton className="h-48 bg-zinc-900" />
        <Skeleton className="h-64 bg-zinc-900" />
      </div>
    );
  }

  if (!data) return <p className="py-8 text-center text-sm text-zinc-600">No data available.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-600">
          Last updated: {new Date(data.updatedAt).toLocaleTimeString()} · auto-refresh 30s
        </div>
      </div>

      <OverviewGrid ov={data.overview} />
      <TrendChart data={data.recentTrend} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopPoolsTable pools={data.topPools} />
        <LiveFeed events={data.terminalFeed} />
      </div>
    </div>
  );
}
