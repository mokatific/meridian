import { NextRequest, NextResponse } from 'next/server'

const MERIDIAN_BASE = 'https://api.agentmeridian.xyz/api'

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get('mint')
  if (!mint) return NextResponse.json({ error: 'mint required' }, { status: 400 })

  const interval = req.nextUrl.searchParams.get('interval') ?? '5_MINUTE'
  const candles = req.nextUrl.searchParams.get('candles') ?? '200'
  const entryPreset = req.nextUrl.searchParams.get('entryPreset') ?? 'supertrend_break'
  const exitPreset = req.nextUrl.searchParams.get('exitPreset') ?? 'supertrend_break'

  const params = new URLSearchParams({ interval, candles, entryPreset, exitPreset })
  const res = await fetch(`${MERIDIAN_BASE}/chart-indicators/${encodeURIComponent(mint)}?${params}`, {
    headers: { 'x-api-key': process.env.MERIDIAN_API_KEY ?? '' },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
