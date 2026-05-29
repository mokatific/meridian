'use client'

import { useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useHivemindLessons } from '@/hooks/useHivemindLessons'
import { usePublicSummary } from '@/hooks/usePublicSummary'
import { NetworkIntelligence } from './NetworkIntelligence'
import { AgentLeaderboard } from './AgentLeaderboard'
import { StrategyIntelligence } from './StrategyIntelligence'
import { HivemindFeed } from './HivemindFeed'
import { PoolLeaderboard } from './PoolLeaderboard'
import { PoolIntelligence } from './PoolIntelligence'
import { WalletDeepDive } from './WalletDeepDive'

export function DashboardTabs() {
  const { data: lessonsData, isLoading: lessonsLoading } = useHivemindLessons(80)
  const { data: summary } = usePublicSummary()
  const lessons = lessonsData?.lessons ?? []

  useEffect(() => {
    fetch('/api/hivemind/register', { method: 'POST' }).catch(() => {})
  }, [])

  const agentCount = summary?.graph.agents.length
  const activeCount = summary?.overview.activeAgents

  return (
    <Tabs defaultValue="network" className="space-y-4">
      <TabsList className="bg-zinc-900 border border-zinc-800 h-9 flex-wrap gap-px">
        <TabsTrigger value="network" className="text-xs data-[state=active]:bg-zinc-700">
          🌐 Network
          {activeCount && <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300">{activeCount}</span>}
        </TabsTrigger>
        <TabsTrigger value="agents" className="text-xs data-[state=active]:bg-zinc-700">
          🤖 Agents
          {agentCount && <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300">{agentCount}</span>}
        </TabsTrigger>
        <TabsTrigger value="strategies" className="text-xs data-[state=active]:bg-zinc-700">
          🔬 Strategies
        </TabsTrigger>
        <TabsTrigger value="hivemind" className="text-xs data-[state=active]:bg-zinc-700">
          🧠 Lessons
          {lessons.length > 0 && <span className="ml-1.5 rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300">{lessons.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="pools" className="text-xs data-[state=active]:bg-zinc-700">
          🌊 Pools
        </TabsTrigger>
        <TabsTrigger value="leaderboard" className="text-xs data-[state=active]:bg-zinc-700">
          🏆 LP Leaderboard
        </TabsTrigger>
        <TabsTrigger value="wallet" className="text-xs data-[state=active]:bg-zinc-700">
          🔍 Wallet Dive
        </TabsTrigger>
      </TabsList>

      <TabsContent value="network" className="mt-0">
        <NetworkIntelligence />
      </TabsContent>

      <TabsContent value="agents" className="mt-0">
        <AgentLeaderboard />
      </TabsContent>

      <TabsContent value="strategies" className="mt-0">
        <StrategyIntelligence />
      </TabsContent>

      <TabsContent value="hivemind" className="mt-0">
        <HivemindFeed lessons={lessons} isLoading={lessonsLoading} pulledAt={lessonsData?.pulledAt} />
      </TabsContent>

      <TabsContent value="pools" className="mt-0">
        <PoolIntelligence />
      </TabsContent>

      <TabsContent value="leaderboard" className="mt-0">
        <PoolLeaderboard />
      </TabsContent>

      <TabsContent value="wallet" className="mt-0">
        <WalletDeepDive />
      </TabsContent>
    </Tabs>
  )
}

