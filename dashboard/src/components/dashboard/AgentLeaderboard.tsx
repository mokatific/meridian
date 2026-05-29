'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { usePublicSummary } from '@/hooks/usePublicSummary'
import { useSolanaWallet } from '@/hooks/useSolanaWallet'
import type { GraphAgent, SummaryLesson, GraphEdge } from '@/lib/types'
import { cn, fmtUsd } from '@/lib/utils'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function winRateColor(pct: number) {
  if (pct >= 80) return 'text-green-400'
  if (pct >= 65) return 'text-emerald-400'
  if (pct >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function WinBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-zinc-800">
        <div
          className={cn('h-full rounded-full', pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500')}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={cn('text-xs tabular-nums', winRateColor(pct))}>{pct.toFixed(1)}%</span>
    </div>
  )
}

// ─── Agent detail panel ───────────────────────────────────────────────────────

function AgentDetail({
  agent,
  lessons,
  edges,
  terminalLines,
}: {
  agent: GraphAgent
  lessons: SummaryLesson[]
  edges: GraphEdge[]
  terminalLines: { line: string; at: string; type: string }[]
}) {
  const [walletInput, setWalletInput] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const { data: walletData } = useSolanaWallet(wallet)

  // Lessons this agent contributed to
  const agentLessons = useMemo(
    () => lessons.filter(l => l.agentIds?.includes(agent.id)),
    [lessons, agent.id],
  )

  // This agent's terminal feed events
  const agentEvents = useMemo(
    () => terminalLines.filter(e => e.line.startsWith(agent.id + ' ')),
    [terminalLines, agent.id],
  )

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-mono text-zinc-300 font-medium">{agent.id}</span>
        <span>·</span>
        <span>win rate <span className={winRateColor(agent.winRatePct)}>{agent.winRatePct}%</span></span>
        <span>·</span>
        <span>{agentLessons.length} lessons contributed</span>
      </div>

      {/* Wallet cross-reference */}
      <div className="space-y-1">
        <div className="text-xs text-zinc-600">Cross-reference wallet address (optional)</div>
        <div className="flex gap-2">
          <Input
            placeholder="Solana wallet…"
            value={walletInput}
            onChange={e => setWalletInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && walletInput.trim() && setWallet(walletInput.trim())}
            className="border-zinc-700 bg-zinc-800 font-mono text-xs h-7 max-w-xs"
          />
          <button
            onClick={() => walletInput.trim() && setWallet(walletInput.trim())}
            className="rounded border border-zinc-700 px-2 text-xs text-zinc-400 hover:bg-zinc-700"
          >
            Look up
          </button>
        </div>
        {walletData && (
          <div className="rounded border border-zinc-800 bg-zinc-800/50 px-2 py-1.5 text-xs">
            <span className="font-mono text-zinc-200">{walletData.wallet}</span>
            <span className="ml-3 text-zinc-400">{walletData.solBalance.toFixed(4)} SOL</span>
            <span className="ml-3 text-zinc-600">{walletData.recentSignatures.length} recent txns</span>
            <a href={`https://solscan.io/account/${walletData.wallet}`} target="_blank" rel="noreferrer"
              className="ml-3 text-zinc-600 hover:text-zinc-400">↗ Solscan</a>
            <a href={`https://birdeye.so/profile/${walletData.wallet}?chain=solana`} target="_blank" rel="noreferrer"
              className="ml-2 text-zinc-600 hover:text-zinc-400">↗ Birdeye</a>
          </div>
        )}
      </div>

      {/* Recent activity for this agent */}
      {agentEvents.length > 0 && (
        <div>
          <div className="text-xs text-zinc-600 mb-1">Recent activity ({agentEvents.length} events)</div>
          <div className="space-y-0.5">
            {agentEvents.map((e, i) => {
              const rest = e.line.slice(agent.id.length + 1)
              const pnlMatch = rest.match(/([+-]\d+\.?\d*)%/)
              const pnl = pnlMatch ? parseFloat(pnlMatch[1]) : null
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-zinc-700 shrink-0">{new Date(e.at).toLocaleTimeString()}</span>
                  <span className={cn('shrink-0', e.type === 'lesson' ? 'text-blue-400' : pnl && pnl > 0 ? 'text-green-400' : 'text-red-400')}>
                    {e.type === 'lesson' ? '💡' : pnl && pnl > 0 ? '▲' : '▼'}
                  </span>
                  <span className="text-zinc-400 leading-relaxed">{rest}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lessons this agent contributed to */}
      {agentLessons.length > 0 && (
        <div>
          <div className="text-xs text-zinc-600 mb-1">Lessons contributed to</div>
          <div className="space-y-1.5">
            {agentLessons.map(l => (
              <div key={l.id} className="rounded border border-zinc-800 bg-zinc-900/60 p-2 text-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge className={cn('text-xs', l.consensus === 'strong' ? 'bg-green-800 text-green-200' : 'bg-zinc-700 text-zinc-300')}>
                    {l.consensus}
                  </Badge>
                  <span className="text-zinc-600">score {l.score?.toFixed(1)}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-600">{l.agentIds?.length ?? 0} agents</span>
                </div>
                <div className="font-mono text-zinc-300 leading-relaxed">{l.rule}</div>
                {l.tags && l.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.tags.map(t => <span key={t} className="rounded bg-zinc-800 px-1 text-zinc-500">{t}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AgentLeaderboard() {
  const { data, isLoading } = usePublicSummary()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'winRate' | 'id'>('winRate')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const agents: GraphAgent[] = useMemo(() => {
    if (!data?.graph.agents) return []
    return [...data.graph.agents]
      .filter(a => !search || a.id.includes(search.toLowerCase()))
      .sort((a, b) => sortBy === 'winRate' ? b.winRatePct - a.winRatePct : a.id.localeCompare(b.id))
  }, [data, search, sortBy])

  const lessons = data?.graph.lessons ?? []
  const terminalFeed = data?.terminalFeed ?? []

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-9 bg-zinc-900" />)}</div>
  }

  if (!data) return <p className="py-8 text-center text-sm text-zinc-600">No agent data.</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search agent ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border-zinc-700 bg-zinc-900 font-mono text-xs h-8 w-48"
        />
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          {(['winRate', 'id'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={cn('px-3 py-1.5 text-xs transition-colors', sortBy === s ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800')}>
              {s === 'winRate' ? 'Win rate' : 'Agent ID'}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-600">{agents.length} of {data.graph.agents.length} agents</span>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden max-h-[70vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800">
            <tr className="text-zinc-600">
              <th className="py-2 px-3 text-left w-8">#</th>
              <th className="py-2 px-2 text-left">Agent ID</th>
              <th className="py-2 px-2 text-left w-44">Win Rate</th>
              <th className="py-2 px-2 text-right">Lessons</th>
              <th className="py-2 px-2 text-right">Recent</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, i) => {
              const lessonCount = lessons.filter(l => l.agentIds?.includes(agent.id)).length
              const recentCount = terminalFeed.filter(e => e.line.startsWith(agent.id + ' ')).length
              const isExpanded = expandedId === agent.id
              return (
                <>
                  <tr
                    key={agent.id}
                    onClick={() => setExpandedId(isExpanded ? null : agent.id)}
                    className={cn(
                      'cursor-pointer border-b border-zinc-800/40 transition-colors hover:bg-zinc-800/30',
                      isExpanded && 'bg-zinc-800/40',
                    )}
                  >
                    <td className="py-2.5 px-3 text-zinc-600">{i + 1}</td>
                    <td className="py-2.5 px-2 font-mono text-zinc-200">{agent.id}</td>
                    <td className="py-2.5 px-2"><WinBar pct={agent.winRatePct} /></td>
                    <td className="py-2.5 px-2 text-right text-zinc-500">{lessonCount > 0 ? lessonCount : '—'}</td>
                    <td className="py-2.5 px-2 text-right text-zinc-600">{recentCount > 0 ? `${recentCount} events` : '—'}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${agent.id}-detail`}>
                      <td colSpan={5} className="px-3 pb-3">
                        <AgentDetail
                          agent={agent}
                          lessons={lessons}
                          edges={data.graph.edges}
                          terminalLines={terminalFeed}
                        />
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
