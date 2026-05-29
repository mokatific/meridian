'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTrendingPools } from '@/hooks/useTrendingPools'
import type { MeteoraPool } from '@/lib/types'
import { cn, fmtUsd, fmtPct } from '@/lib/utils'

const CATEGORIES = ['trending', 'new'] as const
const TIMEFRAMES = ['5m', '1h', '4h', '24h'] as const

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (!values?.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 64
  const h = 24
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ')
  const isUp = values[values.length - 1] >= values[0]
  return (
    <svg width={w} height={h} className={className}>
      <polyline points={pts} fill="none" stroke={isUp ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
    </svg>
  )
}

function OrganicBadge({ score, label }: { score?: number; label?: string }) {
  if (score == null) return null
  const color = score >= 70 ? 'text-green-400 border-green-800' : score >= 40 ? 'text-amber-400 border-amber-800' : 'text-red-400 border-red-800'
  return (
    <span className={cn('rounded border px-1.5 py-px text-xs', color)}>
      {label ?? `${score}%`}
    </span>
  )
}

function RiskBadge({ token }: { token?: MeteoraPool['token_x'] }) {
  if (!token) return null
  const warnings = token.warnings ?? []
  if (!warnings.length && !token.has_freeze_authority && !token.has_mint_authority) return null
  return (
    <span className="rounded border border-red-800/50 bg-red-950/30 px-1.5 py-px text-xs text-red-400">
      {warnings[0] ?? (token.has_freeze_authority ? 'freeze' : 'mint-auth')}
    </span>
  )
}

function PoolCard({ pool }: { pool: MeteoraPool }) {
  const [expanded, setExpanded] = useState(false)
  const base = pool.token_x
  const quote = pool.token_y
  const priceTrend = pool.price_trend ?? []
  const isUp = priceTrend.length >= 2 && priceTrend[priceTrend.length - 1] >= priceTrend[0]

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-200 truncate">{pool.name}</span>
            {pool.dlmm_params?.bin_step && (
              <span className="text-xs text-zinc-600">bs {pool.dlmm_params.bin_step}</span>
            )}
            {pool.fee_pct > 0 && (
              <span className="text-xs text-zinc-600">{pool.fee_pct}% fee</span>
            )}
            {pool.launchpad && (
              <span className="rounded bg-zinc-800 px-1.5 py-px text-xs text-zinc-500">{pool.launchpad}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <OrganicBadge score={base?.organic_score} label={base?.organic_score_label} />
            <RiskBadge token={base} />
            {pool.has_farm && <span className="rounded bg-zinc-800 px-1.5 py-px text-xs text-zinc-500">🌾 farm</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Sparkline values={priceTrend} />
          <div className="text-right">
            <div className={cn('text-sm font-bold', pool.pool_price_change_pct != null ? (pool.pool_price_change_pct >= 0 ? 'text-green-400' : 'text-red-400') : 'text-zinc-400')}>
              {pool.pool_price_change_pct != null ? fmtPct(pool.pool_price_change_pct) : '—'}
            </div>
            <div className="text-xs text-zinc-600">TVL {fmtUsd(pool.tvl)}</div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-zinc-600">Volume</span><br />
          <span className="text-zinc-300">{fmtUsd(pool.volume ?? 0)}</span>
          {pool.volume_change_pct != null && (
            <span className={cn('ml-1', pool.volume_change_pct >= 0 ? 'text-green-500' : 'text-red-500')}>
              {fmtPct(pool.volume_change_pct)}
            </span>
          )}
        </div>
        <div>
          <span className="text-zinc-600">Active TVL</span><br />
          <span className="text-zinc-300">{fmtUsd(pool.active_tvl ?? 0)}</span>
        </div>
        <div>
          <span className="text-zinc-600">Fee/aTVL</span><br />
          <span className="text-zinc-300">{pool.fee_active_tvl_ratio != null ? `${(pool.fee_active_tvl_ratio * 100).toFixed(2)}%` : '—'}</span>
        </div>
        <div>
          <span className="text-zinc-600">Volatility</span><br />
          <span className="text-zinc-300">{pool.volatility?.toFixed(2) ?? '—'}</span>
        </div>
      </div>

      <button onClick={() => setExpanded(!expanded)} className="mt-2 text-xs text-zinc-700 hover:text-zinc-500">
        {expanded ? '▲ less' : '▼ more'}
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs border-t border-zinc-800 pt-2">
          <div><span className="text-zinc-600">Pool</span><br /><span className="font-mono text-zinc-500 text-xs">{pool.pool_address.slice(0, 8)}…</span></div>
          <div><span className="text-zinc-600">Open positions</span><br /><span className="text-zinc-300">{pool.open_positions ?? '—'}</span></div>
          <div><span className="text-zinc-600">Active positions</span><br /><span className="text-zinc-300">{pool.active_positions ?? '—'} ({pool.active_positions != null && pool.open_positions ? `${((pool.active_positions / pool.open_positions) * 100).toFixed(0)}%` : '—'})</span></div>
          <div><span className="text-zinc-600">Unique LPers</span><br /><span className="text-zinc-300">{pool.unique_lps ?? '—'}</span></div>
          <div><span className="text-zinc-600">Unique traders</span><br /><span className="text-zinc-300">{pool.unique_traders ?? '—'}</span></div>
          <div><span className="text-zinc-600">Correlation</span><br /><span className="text-zinc-300">{pool.correlation?.toFixed(3) ?? '—'}</span></div>
          {base?.market_cap && <div><span className="text-zinc-600">Base MCap</span><br /><span className="text-zinc-300">{fmtUsd(base.market_cap)}</span></div>}
          {base?.holders && <div><span className="text-zinc-600">Holders</span><br /><span className="text-zinc-300">{base.holders.toLocaleString()}</span></div>}
          <div>
            <a href={`https://app.meteora.ag/dlmm/${pool.pool_address}`} target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-zinc-400">↗ Meteora</a>
          </div>
        </div>
      )}
    </div>
  )
}

export function PoolIntelligence() {
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('trending')
  const [timeframe, setTimeframe] = useState<typeof TIMEFRAMES[number]>('1h')
  const { data, isLoading } = useTrendingPools(category, timeframe, 30)

  const pools = data?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={cn('px-3 py-1.5 text-xs capitalize transition-colors',
                category === c ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800')}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-zinc-800 overflow-hidden">
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTimeframe(t)}
              className={cn('px-3 py-1.5 text-xs transition-colors',
                timeframe === t ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800')}>
              {t}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-zinc-600">
          {pools.length > 0 ? `${pools.length} pools` : ''}{data?.total ? ` of ${data.total.toLocaleString()}` : ''}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full bg-zinc-900" />)}</div>
      )}

      {!isLoading && pools.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-600">No pool data available.</p>
      )}

      <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
        {pools.map(pool => <PoolCard key={pool.pool_address} pool={pool} />)}
      </div>
    </div>
  )
}
