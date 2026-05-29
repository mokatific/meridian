'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTopLp } from '@/hooks/useTopLp'
import { useStudyTopLp } from '@/hooks/useStudyTopLp'
import { cn, shortAddr, fmtUsd, fmtPct, fmtHours } from '@/lib/utils'
import type { TopLper, StudyEntry } from '@/lib/types'

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="ml-1 text-zinc-600 hover:text-zinc-300 transition-colors"
      title="Copy address"
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

function StudyEntryPanel({ entry, label }: { entry: StudyEntry; label: string }) {
  return (
    <div className="mt-2 rounded-md bg-zinc-800/60 p-3 text-xs text-zinc-400 grid grid-cols-3 gap-2">
      <div><span className="text-zinc-600">PnL USD</span><br /><span className="text-zinc-200">{fmtUsd(entry.pnlUsd)}</span></div>
      <div><span className="text-zinc-600">Win Rate</span><br /><span className="text-zinc-200">{entry.winRatePct.toFixed(1)}%</span></div>
      <div><span className="text-zinc-600">Avg Hold</span><br /><span className="text-zinc-200">{fmtHours(entry.avgAgeHours)}</span></div>
    </div>
  )
}

export function PoolLeaderboard() {
  const [input, setInput] = useState('')
  const [pool, setPool] = useState<string | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const { data: topData, isLoading: topLoading } = useTopLp(pool)
  const { data: studyData } = useStudyTopLp(pool)

  const lpers = topData?.topLpers ?? []
  const loading = topLoading && !!pool

  const studyByOwner = new Map<string, StudyEntry>()
  if (studyData) {
    for (const e of [...(studyData.topWinnersByPct ?? []), ...(studyData.topLosersByPct ?? [])]) {
      studyByOwner.set(e.owner, e)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Pool address (e.g. 5rCf1DM8…)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && input.trim() && setPool(input.trim())}
          className="border-zinc-700 bg-zinc-900 font-mono text-sm"
        />
        <Button
          onClick={() => input.trim() && setPool(input.trim())}
          disabled={!input.trim()}
          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100"
        >
          Load
        </Button>
      </div>

      {topData?.overview && (
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          <a
            href={`https://www.meteora.ag/dlmm/${pool}`}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-300 font-medium hover:text-blue-400"
          >
            {topData.overview.tokenXSymbol}-{topData.overview.tokenYSymbol} ↗
          </a>
          {topData.overview.tvl != null && <span>TVL {fmtUsd(topData.overview.tvl)}</span>}
          {topData.overview.feePct != null && <span>Fee {topData.overview.feePct}%</span>}
          {topData.overview.binStep != null && <span>Bin step {topData.overview.binStep}</span>}
          {studyData && <span>{studyData.activePositionCount} active positions · {studyData.ownerCount} LPers</span>}
        </div>
      )}

      {!pool && (
        <p className="py-8 text-center text-sm text-zinc-600">Enter a pool address to load the leaderboard.</p>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded bg-zinc-900" />
          ))}
        </div>
      )}

      {!loading && lpers.length === 0 && pool && (
        <p className="py-8 text-center text-sm text-zinc-600">No LP data found for this pool.</p>
      )}

      {!loading && lpers.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80 text-zinc-500">
                <th className="py-2 pl-3 pr-2 text-left w-8">#</th>
                <th className="py-2 px-2 text-left">Wallet</th>
                <th className="py-2 px-2 text-right">PnL USD</th>
                <th className="py-2 px-2 text-right">PnL %</th>
                <th className="py-2 px-2 text-right">Win Rate</th>
                <th className="py-2 px-2 text-right">Avg Hold</th>
                <th className="py-2 px-2 text-right">Fee %</th>
                <th className="py-2 px-2 text-right">LPs</th>
              </tr>
            </thead>
            <tbody>
              {lpers.map((lp, i) => {
                const isWinner = i < 3
                const isLoser = i >= lpers.length - 3
                const isExpanded = expandedRow === lp.owner
                const study = studyByOwner.get(lp.owner)
                return (
                  <>
                    <tr
                      key={lp.owner}
                      onClick={() => setExpandedRow(isExpanded ? null : lp.owner)}
                      className={cn(
                        'cursor-pointer border-b border-zinc-800/50 transition-colors',
                        isWinner ? 'bg-green-950/30 hover:bg-green-950/50' : isLoser ? 'bg-red-950/30 hover:bg-red-950/50' : 'hover:bg-zinc-800/40',
                      )}
                    >
                      <td className="py-2.5 pl-3 pr-2 text-zinc-600">{i + 1}</td>
                      <td className="py-2.5 px-2 font-mono text-zinc-300">
                        {shortAddr(lp.owner)}
                        <CopyButton value={lp.owner} />
                      </td>
                      <td className={cn('py-2.5 px-2 text-right', lp.totalPnlUsd >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {fmtUsd(lp.totalPnlUsd)}
                      </td>
                      <td className={cn('py-2.5 px-2 text-right', lp.roiPct >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {fmtPct(lp.roiPct)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-zinc-300">{lp.winRatePct.toFixed(1)}%</td>
                      <td className="py-2.5 px-2 text-right text-zinc-400">{fmtHours(lp.avgAgeHours)}</td>
                      <td className="py-2.5 px-2 text-right text-zinc-400">{lp.feePercent.toFixed(2)}%</td>
                      <td className="py-2.5 px-2 text-right text-zinc-600">{lp.totalLp}</td>
                    </tr>
                    {isExpanded && study && (
                      <tr key={`${lp.owner}-detail`} className="bg-zinc-900/40">
                        <td colSpan={8} className="px-3 pb-3">
                          <StudyEntryPanel entry={study} label={shortAddr(lp.owner)} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
