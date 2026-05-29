'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { Lesson } from '@/lib/types'

interface TagStat {
  tag: string
  good: number
  bad: number
  total: number
  winRate: number
}

const STRATEGY_TAGS = ['spot', 'bid_ask', 'curve']

export function StrategyDecoder({ lessons, isLoading }: { lessons: Lesson[]; isLoading: boolean }) {
  const tagStats: TagStat[] = useMemo(() => {
    const map = new Map<string, { good: number; bad: number }>()
    for (const lesson of lessons) {
      for (const tag of lesson.tags) {
        const entry = map.get(tag) ?? { good: 0, bad: 0 }
        if (lesson.outcome === 'good') entry.good++
        else if (lesson.outcome === 'bad') entry.bad++
        map.set(tag, entry)
      }
    }
    return Array.from(map.entries())
      .map(([tag, counts]) => ({
        tag,
        good: counts.good,
        bad: counts.bad,
        total: counts.good + counts.bad,
        winRate: counts.good + counts.bad > 0 ? counts.good / (counts.good + counts.bad) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
  }, [lessons])

  const strategyStats = useMemo(() => {
    return STRATEGY_TAGS.map(tag => tagStats.find(t => t.tag === tag)).filter(Boolean) as TagStat[]
  }, [tagStats])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48 bg-zinc-900" />
        <Skeleton className="h-80 w-full bg-zinc-900" />
      </div>
    )
  }

  if (tagStats.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-600">No lesson data available yet.</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">Tag Win/Loss Distribution (top 20 tags)</h3>
        <ResponsiveContainer width="100%" height={480}>
          <BarChart data={tagStats} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis
              dataKey="tag"
              type="category"
              width={90}
              tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }}
            />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#e4e4e7' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
            <Bar dataKey="good" name="good" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
            <Bar dataKey="bad" name="bad" stackId="a" fill="#ef4444" radius={[0, 2, 2, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {strategyStats.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-zinc-400">Strategy win rates</h3>
          <div className="grid grid-cols-3 gap-3">
            {strategyStats.map(s => (
              <div key={s.tag} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="font-mono text-sm text-zinc-200">{s.tag}</div>
                <div className="mt-1 text-2xl font-bold text-zinc-100">{(s.winRate * 100).toFixed(0)}%</div>
                <div className="mt-1 text-xs text-zinc-600">{s.good}W / {s.bad}L · {s.total} lessons</div>
                <div className="mt-2 h-1 rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${s.winRate * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-medium text-zinc-400">All tags ranked by win rate (min 2 lessons)</h3>
        <div className="space-y-1.5">
          {tagStats
            .filter(t => t.total >= 2)
            .sort((a, b) => b.winRate - a.winRate)
            .map(t => (
              <div key={t.tag} className="flex items-center gap-3 text-xs">
                <span className="w-28 font-mono text-zinc-300 truncate">{t.tag}</span>
                <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${t.winRate * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right text-zinc-400">{(t.winRate * 100).toFixed(0)}%</span>
                <span className="w-16 text-right text-zinc-600">{t.good}W/{t.bad}L</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
