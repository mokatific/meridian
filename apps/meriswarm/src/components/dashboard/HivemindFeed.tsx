"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  lessons: Lesson[];
  isLoading: boolean;
  pulledAt?: string;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 60 ? "bg-green-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-zinc-400">{score.toFixed(0)}</span>
    </div>
  );
}

function ConsensusBadge({
  consensus,
  contradictory,
}: {
  consensus: string;
  contradictory: boolean;
}) {
  if (contradictory)
    return (
      <Badge variant="destructive" className="text-xs">
        contradictory
      </Badge>
    );
  if (consensus === "strong")
    return <Badge className="bg-green-700 text-green-100 text-xs hover:bg-green-700">strong</Badge>;
  return (
    <Badge variant="secondary" className="text-xs">
      weak
    </Badge>
  );
}

function OutcomeDot({ outcome }: { outcome: string }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        outcome === "good" ? "bg-green-500" : outcome === "bad" ? "bg-red-500" : "bg-zinc-500",
      )}
    />
  );
}

export function HivemindFeed({ lessons, isLoading, pulledAt }: Props) {
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "good" | "bad">("all");
  const [tagFilter, setTagFilter] = useState("");

  const filtered = useMemo(() => {
    return lessons.filter((l) => {
      if (outcomeFilter !== "all" && l.outcome !== outcomeFilter) return false;
      if (tagFilter) {
        const q = tagFilter.toLowerCase();
        return l.tags.some((t) => t.toLowerCase().includes(q)) || l.rule.toLowerCase().includes(q);
      }
      return true;
    });
  }, [lessons, outcomeFilter, tagFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          {(["all", "good", "bad"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setOutcomeFilter(v)}
              className={cn(
                "px-3 py-1.5 text-xs capitalize transition-colors",
                outcomeFilter === v
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <Input
          placeholder="Filter by tag or keyword…"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="h-8 w-56 border-zinc-700 bg-zinc-900 text-sm"
        />
        <span className="ml-auto text-xs text-zinc-600">
          {filtered.length} lessons{pulledAt ? ` · ${new Date(pulledAt).toLocaleTimeString()}` : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg bg-zinc-900" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-600">No lessons match your filters.</p>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {filtered.map((lesson) => (
            <Card key={lesson.id} className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <OutcomeDot outcome={lesson.outcome} />
                  <ConsensusBadge
                    consensus={lesson.consensus}
                    contradictory={lesson.contradictory}
                  />
                  <span className="text-xs text-zinc-500">
                    {lesson.distinctAgents} agents · {lesson.sampleCount} samples · conf{" "}
                    {(lesson.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="ml-auto text-xs text-zinc-600">
                    {new Date(lesson.created_at).toLocaleDateString()}
                  </span>
                </div>
                <ScoreBar score={lesson.score} />
                <p className="font-mono text-xs text-zinc-200 leading-relaxed">{lesson.rule}</p>
                {lesson.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {lesson.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="border-zinc-700 text-zinc-400 text-xs px-1.5 py-0 cursor-pointer hover:border-zinc-500"
                        onClick={() => setTagFilter(tag)}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
