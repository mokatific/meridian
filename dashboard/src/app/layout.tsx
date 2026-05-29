import type { Metadata } from 'next'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Meridian Intelligence',
  description: 'Live HiveMind feed, pool leaderboard, strategy decoder, and OHLCV charts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${GeistMono.className} bg-zinc-950 text-zinc-100 min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  )
}
