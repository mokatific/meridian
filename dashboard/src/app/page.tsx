import { DashboardTabs } from '@/components/dashboard/DashboardTabs'

export default function Home() {
  return (
    <main className="container mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Meridian Intelligence</h1>
          <p className="text-xs text-zinc-600 mt-0.5">HiveMind · Pool Leaderboard · Strategy Decoder · OHLCV</p>
        </div>
        <span className="text-xs text-zinc-700">{new Date().toUTCString()}</span>
      </header>
      <DashboardTabs />
    </main>
  )
}
