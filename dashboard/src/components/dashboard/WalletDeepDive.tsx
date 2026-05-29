'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { useSolanaWallet } from '@/hooks/useSolanaWallet'
import type { MeteoraPositionPnl } from '@/lib/types'
import { cn, shortAddr, fmtUsd, fmtPct } from '@/lib/utils'

function PositionCard({ pos, poolAddress }: { pos: MeteoraPositionPnl; poolAddress: string }) {
  const created = pos.createdAt ? new Date(pos.createdAt * 1000) : null
  const closed = pos.closedAt ? new Date(pos.closedAt * 1000) : null
  const ageMs = created && closed ? closed.getTime() - created.getTime() : null
  const ageHours = ageMs ? ageMs / 3_600_000 : null

  return (
    <div className={cn('rounded-lg border p-3 text-xs', pos.pnlPctChange >= 0 ? 'border-green-900/50 bg-green-950/20' : 'border-red-900/50 bg-red-950/20')}>
      <div className="flex items-start justify-between">
        <div>
          <a href={`https://www.meteora.ag/dlmm/${poolAddress}`} target="_blank" rel="noreferrer" className="font-mono text-zinc-400 hover:text-blue-400">
        {shortAddr(pos.positionAddress)}
      </a>
          {pos.isOutOfRange && <span className="ml-2 rounded bg-amber-900/40 px-1.5 text-amber-400">OOR</span>}
          {pos.isClosed && <span className="ml-2 rounded bg-zinc-800 px-1.5 text-zinc-500">closed</span>}
        </div>
        <div className={cn('text-sm font-bold', pos.pnlPctChange >= 0 ? 'text-green-400' : 'text-red-400')}>
          {fmtPct(pos.pnlPctChange)}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div><span className="text-zinc-600">PnL USD</span><br /><span className={pos.pnlUsd >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtUsd(pos.pnlUsd)}</span></div>
        <div><span className="text-zinc-600">Range</span><br /><span className="text-zinc-300">{pos.lowerBinId} → {pos.upperBinId}</span></div>
        <div><span className="text-zinc-600">Age</span><br /><span className="text-zinc-300">{ageHours != null ? `${ageHours.toFixed(1)}h` : '—'}</span></div>
        {pos.allTimeFees?.total?.usd != null && (
          <div><span className="text-zinc-600">Fees earned</span><br /><span className="text-zinc-300">{fmtUsd(pos.allTimeFees.total.usd)}</span></div>
        )}
        {pos.allTimeDeposits?.total?.usd != null && (
          <div><span className="text-zinc-600">Deposited</span><br /><span className="text-zinc-300">{fmtUsd(pos.allTimeDeposits.total.usd)}</span></div>
        )}
        {pos.feePerTvl24h != null && (
          <div><span className="text-zinc-600">Fee/TVL 24h</span><br /><span className="text-zinc-300">{(pos.feePerTvl24h * 100).toFixed(2)}%</span></div>
        )}
      </div>
      {created && (
        <div className="mt-1 text-zinc-600">
          {created.toLocaleString()}{closed ? ` → ${closed.toLocaleString()}` : ' (open)'}
        </div>
      )}
    </div>
  )
}

function WalletOverview({ wallet }: { wallet: string }) {
  const { data, isLoading } = useSolanaWallet(wallet)

  if (isLoading) return <Skeleton className="h-20 w-full bg-zinc-900" />
  if (!data) return null

  return (
    <Card className="border-zinc-800 bg-zinc-900/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-zinc-200">{shortAddr(wallet)}</span>
              <a href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noreferrer" className="text-xs text-zinc-600 hover:text-zinc-400">↗ Solscan</a>
              <a href={`https://birdeye.so/profile/${wallet}?chain=solana`} target="_blank" rel="noreferrer" className="text-xs text-zinc-600 hover:text-zinc-400">↗ Birdeye</a>
            </div>
            <div className="mt-1 text-xs text-zinc-600">
              {data.lastActivity ? `Last active: ${new Date(data.lastActivity * 1000).toLocaleString()}` : 'No recent activity'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-zinc-100">{data.solBalance.toFixed(4)} SOL</div>
            <div className="text-xs text-zinc-600">{data.recentSignatures.length} recent txns</div>
          </div>
        </div>

        {data.recentSignatures.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-zinc-600 mb-1">Recent transactions</div>
            <div className="space-y-1">
              {data.recentSignatures.slice(0, 5).map(sig => (
                <div key={sig.signature} className="flex items-center gap-2 text-xs">
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', sig.err ? 'bg-red-500' : 'bg-green-500')} />
                  <a href={`https://solscan.io/tx/${sig.signature}`} target="_blank" rel="noreferrer"
                    className="font-mono text-zinc-500 hover:text-zinc-300 truncate">
                    {sig.signature.slice(0, 16)}…
                  </a>
                  <span className="shrink-0 text-zinc-600">{sig.blockTime ? new Date(sig.blockTime * 1000).toLocaleTimeString() : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function WalletDeepDive() {
  const [walletInput, setWalletInput] = useState('')
  const [poolInput, setPoolInput] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const [pool, setPool] = useState('')

  const [positions, setPositions] = useState<MeteoraPositionPnl[]>([])
  const [posLoading, setPosLoading] = useState(false)
  const [posError, setPosError] = useState<string | null>(null)
  const [posStatus, setPosStatus] = useState<'closed' | 'open'>('closed')

  const loadPositions = async () => {
    if (!wallet || !pool.trim()) return
    setPosLoading(true)
    setPosError(null)
    try {
      const res = await fetch(`/api/meteora/positions?pool=${encodeURIComponent(pool.trim())}&user=${encodeURIComponent(wallet)}&status=${posStatus}&pageSize=50`)
      const data = await res.json()
      setPositions(data?.positions ?? [])
    } catch {
      setPosError('Failed to load positions')
    } finally {
      setPosLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Wallet input */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">Wallet</h3>
        <div className="flex gap-2">
          <Input placeholder="Solana wallet address…" value={walletInput} onChange={e => setWalletInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && walletInput.trim() && setWallet(walletInput.trim())}
            className="border-zinc-700 bg-zinc-900 font-mono text-sm max-w-lg" />
          <Button onClick={() => walletInput.trim() && setWallet(walletInput.trim())} disabled={!walletInput.trim()}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100">
            Load
          </Button>
        </div>
        {wallet && <WalletOverview wallet={wallet} />}
      </div>

      {/* Position history */}
      {wallet && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">Position History</h3>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Pool address (required)…" value={poolInput} onChange={e => setPoolInput(e.target.value)}
              className="border-zinc-700 bg-zinc-900 font-mono text-sm max-w-sm" />
            <div className="flex rounded-md border border-zinc-800 overflow-hidden">
              {(['closed', 'open'] as const).map(s => (
                <button key={s} onClick={() => setPosStatus(s)}
                  className={cn('px-3 py-1.5 text-xs capitalize transition-colors', posStatus === s ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800')}>
                  {s}
                </button>
              ))}
            </div>
            <Button onClick={() => { setPool(poolInput); loadPositions() }} disabled={!poolInput.trim() || posLoading}
              className="bg-zinc-700 hover:bg-zinc-600 text-zinc-100">
              {posLoading ? 'Loading…' : 'Load Positions'}
            </Button>
          </div>

          {posError && <p className="text-xs text-red-400">{posError}</p>}

          {positions.length > 0 && (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              <p className="text-xs text-zinc-600">{positions.length} positions</p>
              {positions.map(pos => <PositionCard key={pos.positionAddress} pos={pos} poolAddress={pool} />)}
            </div>
          )}

          {!posLoading && positions.length === 0 && pool && (
            <p className="text-xs text-zinc-600">No {posStatus} positions found for this wallet/pool combination.</p>
          )}
        </div>
      )}

      {!wallet && (
        <p className="py-8 text-center text-sm text-zinc-600">Enter a wallet address to begin. Try any top LPer address from the Pool Leaderboard or Strategy Decoder.</p>
      )}
    </div>
  )
}
