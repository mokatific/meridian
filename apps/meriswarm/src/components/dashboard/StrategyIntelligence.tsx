"use client";

import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicSummary } from "@/hooks/usePublicSummary";
import type { StrategyStat, SummaryLesson } from "@/lib/types";
import { cn, fmtUsd } from "@/lib/utils";

// ─── Strategy performance bar ─────────────────────────────────────────────────

function StrategyCard({ s }: { s: StrategyStat }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-sm font-bold text-zinc-100">{s.strategy}</div>
          <div className="text-xs text-zinc-600 mt-0.5">
            {s.adjustedSampleCount.toLocaleString()} closes
          </div>
        </div>
        <div className="text-right">
          <div
            className={cn(
              "text-xl font-bold tabular-nums",
              s.adjustedWinRatePct >= 65
                ? "text-green-400"
                : s.adjustedWinRatePct >= 55
                  ? "text-amber-400"
                  : "text-red-400",
            )}
          >
            {s.adjustedWinRatePct}%
          </div>
          <div className="text-xs text-zinc-600">adj. win rate</div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-zinc-800">
        <div
          className={cn(
            "h-full rounded-full",
            s.adjustedWinRatePct >= 65
              ? "bg-green-500"
              : s.adjustedWinRatePct >= 55
                ? "bg-amber-500"
                : "bg-red-500",
          )}
          style={{ width: `${Math.min(100, s.adjustedWinRatePct)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-zinc-600">Avg PnL</span>
          <br />
          <span className={s.avgPnlPct >= 0 ? "text-green-400" : "text-red-400"}>
            {s.avgPnlPct >= 0 ? "+" : ""}
            {s.avgPnlPct.toFixed(2)}%
          </span>
        </div>
        <div>
          <span className="text-zinc-600">Total fees</span>
          <br />
          <span className="text-zinc-300">{fmtUsd(s.totalFeesUsd)}</span>
        </div>
        <div>
          <span className="text-zinc-600">Avg hold</span>
          <br />
          <span className="text-zinc-300">{s.avgHoldMinutes.toFixed(0)}m</span>
        </div>
        <div>
          <span className="text-zinc-600">Total PnL</span>
          <br />
          <span className={s.totalPnlUsd >= 0 ? "text-green-400" : "text-red-400"}>
            {fmtUsd(s.totalPnlUsd)}
          </span>
        </div>
        <div>
          <span className="text-zinc-600">Raw closes</span>
          <br />
          <span className="text-zinc-400">{s.sampleCount.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Strategy comparison chart ────────────────────────────────────────────────

function StrategyChart({ data }: { data: StrategyStat[] }) {
  const chartData = data.map((s) => ({
    name: s.strategy,
    winRate: s.adjustedWinRatePct,
    avgPnl: s.avgPnlPct,
    fees: s.totalFeesUsd,
    closes: s.adjustedSampleCount,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
        <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11, fontFamily: "monospace" }} />
        <YAxis tick={{ fill: "#71717a", fontSize: 11 }} domain={[0, 100]} />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(v) => [`${Number(v).toFixed(1)}%`, "adj. win rate"]}
        />
        <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell
              key={i}
              fill={d.winRate >= 65 ? "#22c55e" : d.winRate >= 55 ? "#f59e0b" : "#ef4444"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Consensus lesson card ────────────────────────────────────────────────────

function LessonCard({
  lesson,
  type,
}: {
  lesson: SummaryLesson;
  type: "strong" | "emerging" | "disputed";
}) {
  const [expanded, setExpanded] = useState(false);
  const agentIds = lesson.agentIds ?? [];

  const tagGroups = useMemo(() => {
    const strategies =
      lesson.tags?.filter((t) => ["spot", "bid_ask", "curve", "ba_spot", "spot_bid"].includes(t)) ??
      [];
    const range =
      lesson.tags?.filter(
        (t) => t.startsWith("tempo:") || ["wide", "narrow", "medium"].includes(t),
      ) ?? [];
    const market =
      lesson.tags?.filter((t) =>
        ["volatile", "stable", "regime_dump_with_pullback", "trinity", "efficient"].includes(t),
      ) ?? [];
    const bins = lesson.tags?.filter((t) => t.startsWith("bins_")) ?? [];
    return { strategies, range, market, bins };
  }, [lesson.tags]);

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        type === "strong"
          ? "border-green-900/50 bg-green-950/10"
          : type === "disputed"
            ? "border-red-900/50 bg-red-950/10"
            : "border-zinc-800 bg-zinc-900/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              className={cn(
                "text-xs",
                type === "strong"
                  ? "bg-green-800 text-green-200"
                  : type === "disputed"
                    ? "bg-red-800 text-red-200"
                    : "bg-zinc-700 text-zinc-300",
              )}
            >
              {type}
            </Badge>
            <span className="text-xs text-zinc-500">score {lesson.score?.toFixed(2)}</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">
              {lesson.distinctAgents ?? agentIds.length} agents
            </span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">{lesson.sampleCount} samples</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">
              conf {((lesson.confidence ?? 0) * 100).toFixed(0)}%
            </span>
          </div>

          {/* Tag groups */}
          <div className="flex flex-wrap gap-1">
            {tagGroups.strategies.map((t) => (
              <span
                key={t}
                className={cn(
                  "rounded px-1.5 py-px text-xs",
                  t === "spot"
                    ? "bg-blue-900/50 text-blue-300"
                    : "bg-purple-900/50 text-purple-300",
                )}
              >
                {t}
              </span>
            ))}
            {tagGroups.range.map((t) => (
              <span key={t} className="rounded bg-zinc-800 px-1.5 py-px text-xs text-zinc-400">
                {t}
              </span>
            ))}
            {tagGroups.bins.map((t) => (
              <span key={t} className="rounded bg-zinc-800/70 px-1.5 py-px text-xs text-zinc-500">
                {t}
              </span>
            ))}
            {tagGroups.market.map((t) => (
              <span key={t} className="rounded bg-amber-900/30 px-1.5 py-px text-xs text-amber-500">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="font-mono text-xs text-zinc-200 leading-relaxed">{lesson.rule}</p>

      {agentIds.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-zinc-600 hover:text-zinc-400"
          >
            {expanded ? "▲ hide agents" : `▼ ${agentIds.length} agents learned this`}
          </button>
          {expanded && (
            <div className="mt-2 flex flex-wrap gap-1">
              {agentIds.map((id) => (
                <span
                  key={id}
                  className="rounded bg-zinc-800 px-1.5 py-px font-mono text-xs text-zinc-400"
                >
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function StrategyIntelligence() {
  const { data, isLoading } = usePublicSummary();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 bg-zinc-900" />
          ))}
        </div>
        <Skeleton className="h-48 bg-zinc-900" />
      </div>
    );
  }

  if (!data) return <p className="py-8 text-center text-sm text-zinc-600">No data.</p>;

  const allLessons = [
    ...data.consensus.strong.map((l) => ({ ...l, _type: "strong" as const })),
    ...data.consensus.emerging.map((l) => ({ ...l, _type: "emerging" as const })),
    ...data.consensus.disputed.map((l) => ({ ...l, _type: "disputed" as const })),
    ...data.graph.lessons
      .filter((l) => !data.consensus.strong.find((s) => s.id === l.id))
      .map((l) => ({ ...l, _type: "strong" as const })),
  ];

  return (
    <div className="space-y-6">
      {/* Strategy performance */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">
          Strategy Performance — Network ({data.overview.adjustedSampleCount.toLocaleString()}{" "}
          closes)
        </h3>
        <StrategyChart data={data.topStrategies} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.topStrategies.map((s) => (
            <StrategyCard key={s.strategy} s={s} />
          ))}
        </div>
      </div>

      {/* Consensus lessons */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">
          Consensus Lessons — {allLessons.length} active lessons
          <span className="ml-2 text-xs text-zinc-600 font-normal">
            showing which agents learned each strategy
          </span>
        </h3>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {allLessons.map((l) => (
            <LessonCard key={l.id} lesson={l} type={l._type} />
          ))}
        </div>
      </div>
    </div>
  );
}
