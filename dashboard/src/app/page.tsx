import { DashboardTabs } from '@/components/dashboard/DashboardTabs'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1400px] px-3 sm:px-6 py-4 overflow-x-hidden">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-100">Meridian Intelligence</h1>
          <p className="text-xs text-zinc-600 mt-0.5">HiveMind · Pool Leaderboard · Strategy Decoder</p>
        </div>
        <span className="text-xs text-zinc-700 shrink-0">{new Date().toUTCString()}</span>
      </header>
      <DashboardTabs />
    </main>
  )
}
