'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHivemindLessons } from '@/hooks/useHivemindLessons'
import { HivemindFeed } from './HivemindFeed'
import { PoolLeaderboard } from './PoolLeaderboard'
import { StrategyDecoder } from './StrategyDecoder'
import { PoolIntelligence } from './PoolIntelligence'
import { WalletDeepDive } from './WalletDeepDive'

// SSR-safe: lightweight-charts accesses window/document
const OhlcvChart = dynamic(() => import('./OhlcvChart').then(m => ({ default: m.OhlcvChart })), {
  ssr: false,
  loading: () => <div className="h-96 rounded-lg bg-zinc-900 animate-pulse" />,
})

export function DashboardTabs() {
  const { data, isLoading } = useHivemindLessons(80)
  const lessons = data?.lessons ?? []

  useEffect(() => {
    fetch('/api/hivemind/register', { method: 'POST' }).catch(() => {})
  }, [])

  return (
    <Tabs defaultValue="pools" className="space-y-4">
      <TabsList className="bg-zinc-900 border border-zinc-800 h-9 flex-wrap gap-px">
        <TabsTrigger value="pools" className="text-xs data-[state=active]:bg-zinc-700">
          🌊 Pool Intel
        </TabsTrigger>
        <TabsTrigger value="leaderboard" className="text-xs data-[state=active]:bg-zinc-700">
          🏆 Leaderboard
        </TabsTrigger>
        <TabsTrigger value="strategy" className="text-xs data-[state=active]:bg-zinc-700">
          🔬 Strategies
        </TabsTrigger>
        <TabsTrigger value="wallet" className="text-xs data-[state=active]:bg-zinc-700">
          🔍 Wallet Dive
        </TabsTrigger>
        <TabsTrigger value="chart" className="text-xs data-[state=active]:bg-zinc-700">
          📈 Chart + Trades
        </TabsTrigger>
        <TabsTrigger value="hivemind" className="text-xs data-[state=active]:bg-zinc-700">
          🧠 HiveMind
          {lessons.length > 0 && (
            <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300">
              {lessons.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pools" className="mt-0">
        <PoolIntelligence />
      </TabsContent>

      <TabsContent value="leaderboard" className="mt-0">
        <PoolLeaderboard />
      </TabsContent>

      <TabsContent value="strategy" className="mt-0">
        <StrategyDecoder lessons={lessons} isLoading={isLoading} />
      </TabsContent>

      <TabsContent value="wallet" className="mt-0">
        <WalletDeepDive />
      </TabsContent>

      <TabsContent value="chart" className="mt-0">
        <OhlcvChart />
      </TabsContent>

      <TabsContent value="hivemind" className="mt-0">
        <HivemindFeed lessons={lessons} isLoading={isLoading} pulledAt={data?.pulledAt} />
      </TabsContent>
    </Tabs>
  )
}
