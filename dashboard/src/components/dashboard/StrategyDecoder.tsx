'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTopLp } from '@/hooks/useTopLp'
import { useStudyTopLp } from '@/hooks/useStudyTopLp'
import type { Lesson, HistoricalOwner, HistoricalPosition } from '@/lib/types'
import { cn, shortAddr, fmtUsd, fmtPct, fmtHours } from '@/lib/utils'

// ─── Tag aggregation from HiveMind lessons ────────────────────────────────────

interface TagStat {
  tag: string
  good: number
  bad: number
  total: number
  winRate: number
}

const STRATEGY_TAGS = ['spot', 'bid_ask', 'curve']
const RANGE_TAGS = ['tempo:wide', 'tempo:narrow', 'tempo:medium', 'wide', 'narrow', 'medium']

function TagChart({ tagStats }: { tagStats: TagStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart data={tagStats} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} />
        <YAxis dataKey="tag" type="category" width={100} tick={{ fill: '#a1a1aa', fontSize: 11, fontFamily: 'monospace' }} />
        <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 12 }} labelStyle={{ color: '#e4e4e7' }} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
        <Bar dataKey="good" name="good" stackId="a" fill="#22c55e" />
        <Bar dataKey="bad" name="bad" stackId="a" fill="#ef4444" radius={[0, 2, 2, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function StrategyCards({ tagStats }: { tagStats: TagStat[] }) {
  const strategies = STRATEGY_TAGS.map(t => tagStats.find(s => s.tag === t)).filter(Boolean) as TagStat[]
  if (!strategies.length) return null
  return (
    <div className="grid grid-cols-3 gap-3">
      {strategies.map(s => (
        <div key={s.tag} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="font-mono text-sm font-medium text-zinc-200">{s.tag}</div>
          <div className="mt-1 text-2xl font-bold">{(s.winRate * 100).toFixed(0)}%</div>
          <div className="text-xs text-zinc-600">{s.good}W / {s.bad}L · {s.total} lessons</div>
          <div className="mt-2 h-1 rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${s.winRate * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Wallet profile derived from top-lp historicalOwners ─────────────────────

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200) }}
      className="ml-1 text-zinc-600 hover:text-zinc-300">
      {done ? '✓' : '⎘'}
    </button>
  )
}

function PositionRow({ pos }: { pos: HistoricalPosition }) {
  return (
    <tr className="border-b border-zinc-800/40 hover:bg-zinc-800/20 text-xs">
      <td className="py-1.5 px-2 font-mono text-zinc-500">
        <a href={`https://www.meteora.ag/dlmm/${pos.pool}`} target="_blank" rel="noreferrer" className="hover:text-blue-400">
          {shortAddr(pos.position)}
        </a>
      </td>
      <td className="py-1.5 px-2">
        <span className={cn('rounded px-1.5 py-px text-xs', pos.strategy === 'spot' ? 'bg-blue-900/50 text-blue-300' : pos.strategy === 'bid_ask' ? 'bg-purple-900/50 text-purple-300' : 'bg-zinc-800 text-zinc-400')}>
          {pos.strategy}
        </span>
      </td>
      <td className="py-1.5 px-2 text-zinc-500">{pos.rangeStyle ?? '—'}</td>
      <td className="py-1.5 px-2 text-right text-zinc-400">{pos.widthBins} bins</td>
      <td className={cn('py-1.5 px-2 text-right', pos.pnlPct >= 0 ? 'text-green-400' : 'text-red-400')}>{fmtPct(pos.pnlPct)}</td>
      <td className="py-1.5 px-2 text-right text-zinc-400">{pos.feePercent.toFixed(2)}%</td>
      <td className="py-1.5 px-2 text-right text-zinc-500">{fmtHours(pos.ageHours)}</td>
      <td className="py-1.5 px-2 text-right text-zinc-600">{pos.closedAt ? '✓' : '●'}</td>
    </tr>
  )
}

function WalletCard({ owner, rank }: { owner: HistoricalOwner; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 w-5">#{rank}</span>
            <div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs text-zinc-200">{shortAddr(owner.owner)}</span>
                <CopyBtn value={owner.owner} />
                <a href={`https://solscan.io/account/${owner.owner}`} target="_blank" rel="noreferrer"
                  className="ml-1 text-xs text-zinc-600 hover:text-zinc-400">↗</a>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className={cn('rounded px-1.5 py-px text-xs font-medium',
                  owner.preferredStrategy === 'spot' ? 'bg-blue-900/50 text-blue-300' :
                  owner.preferredStrategy === 'bid_ask' ? 'bg-purple-900/50 text-purple-300' :
                  'bg-zinc-800 text-zinc-400')}>
                  {owner.preferredStrategy}
                </span>
                {owner.preferredRangeStyle && (
                  <span className="rounded bg-zinc-800 px-1.5 py-px text-xs text-zinc-400">{owner.preferredRangeStyle}</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={cn('text-sm font-bold', owner.avgPnlPct >= 0 ? 'text-green-400' : 'text-red-400')}>
              {fmtPct(owner.avgPnlPct)}
            </div>
            <div className="text-xs text-zinc-600">avg PnL</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div><span className="text-zinc-600">Avg hold</span><br /><span className="text-zinc-300">{fmtHours(owner.avgHoldHours)}</span></div>
          <div><span className="text-zinc-600">Avg fee</span><br /><span className="text-zinc-300">{owner.avgFeePercent.toFixed(2)}%</span></div>
          <div><span className="text-zinc-600">Avg width</span><br /><span className="text-zinc-300">{owner.avgWidthBins?.toFixed(0) ?? '—'} bins</span></div>
        </div>

        {owner.topPositions?.length > 0 && (
          <button onClick={() => setExpanded(!expanded)} className="mt-3 text-xs text-zinc-600 hover:text-zinc-400">
            {expanded ? '▲ hide' : `▼ show ${owner.topPositions.length} positions`}
          </button>
        )}

        {expanded && owner.topPositions?.length > 0 && (
          <div className="mt-2 overflow-x-auto rounded border border-zinc-800 max-w-full">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-600">
                  <th className="py-1.5 px-2 text-left">Position</th>
                  <th className="py-1.5 px-2 text-left">Strategy</th>
                  <th className="py-1.5 px-2 text-left">Range</th>
                  <th className="py-1.5 px-2 text-right">Width</th>
                  <th className="py-1.5 px-2 text-right">PnL</th>
                  <th className="py-1.5 px-2 text-right">Fee</th>
                  <th className="py-1.5 px-2 text-right">Age</th>
                  <th className="py-1.5 px-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {owner.topPositions.map(pos => <PositionRow key={pos.position} pos={pos} />)}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StrategyDecoder({ lessons, isLoading }: { lessons: Lesson[]; isLoading: boolean }) {
  const [poolInput, setPoolInput] = useState('')
  const [pool, setPool] = useState<string | null>(null)

  const { data: topData, isLoading: topLoading } = useTopLp(pool)
  const { data: studyData } = useStudyTopLp(pool)

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
      .map(([tag, counts]) => ({ tag, good: counts.good, bad: counts.bad, total: counts.good + counts.bad, winRate: counts.good + counts.bad > 0 ? counts.good / (counts.good + counts.bad) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
  }, [lessons])

  const historicalOwners = topData?.historicalOwners ?? studyData?.topHistoricalOwners ?? []
  const suggestedStyle = studyData?.suggestedStyle

  return (
    <div className="space-y-8">

      {/* Pool search for wallet strategy profiles */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">Wallet Strategy Profiles from Pool</h3>
        <p className="text-xs text-zinc-600">Enter a pool address to see each LPer&apos;s preferred strategy, range style, and full position history.</p>
        <div className="flex gap-2">
          <Input placeholder="Pool address…" value={poolInput} onChange={e => setPoolInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && poolInput.trim() && setPool(poolInput.trim())}
            className="border-zinc-700 bg-zinc-900 font-mono text-sm max-w-sm" />
          <Button onClick={() => poolInput.trim() && setPool(poolInput.trim())} disabled={!poolInput.trim()}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100">Decode</Button>
        </div>

        {suggestedStyle && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
            <span className="text-xs text-zinc-500">Pool suggests:</span>
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium',
              suggestedStyle.strategy === 'spot' ? 'bg-blue-900/50 text-blue-300' :
              suggestedStyle.strategy === 'bid_ask' ? 'bg-purple-900/50 text-purple-300' : 'bg-zinc-800 text-zinc-300')}>
              {suggestedStyle.strategy}
            </span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{suggestedStyle.rangeStyle}</span>
          </div>
        )}

        {topLoading && pool && (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full bg-zinc-900" />)}</div>
        )}

        {!topLoading && historicalOwners.length === 0 && pool && (
          <p className="text-xs text-zinc-600 py-4">No historical owner data for this pool.</p>
        )}

        {historicalOwners.length > 0 && (
          <div className="space-y-3">
            {historicalOwners.map((owner, i) => <WalletCard key={owner.owner} owner={owner} rank={i + 1} />)}
          </div>
        )}
      </div>

      {/* HiveMind collective tag analysis */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-zinc-300">HiveMind Collective — Tag Win/Loss ({lessons.length} lessons from network)</h3>

        {isLoading ? (
          <Skeleton className="h-80 w-full bg-zinc-900" />
        ) : tagStats.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-600">No lesson data yet.</p>
        ) : (
          <div className="space-y-6">
            <StrategyCards tagStats={tagStats} />
            <TagChart tagStats={tagStats} />

            <div className="space-y-1.5">
              <p className="text-xs text-zinc-600 mb-2">All tags by win rate (min 2 lessons)</p>
              {tagStats.filter(t => t.total >= 2).sort((a, b) => b.winRate - a.winRate).map(t => (
                <div key={t.tag} className="flex items-center gap-3 text-xs">
                  <span className="w-32 font-mono text-zinc-300 truncate">{t.tag}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${t.winRate * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-zinc-400">{(t.winRate * 100).toFixed(0)}%</span>
                  <span className="w-16 text-right text-zinc-600">{t.good}W/{t.bad}L</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
