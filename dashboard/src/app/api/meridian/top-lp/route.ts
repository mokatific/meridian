import { NextRequest, NextResponse } from 'next/server'

const MERIDIAN_BASE = 'https://api.agentmeridian.xyz/api'

export async function GET(req: NextRequest) {
  const pool = req.nextUrl.searchParams.get('pool')
  if (!pool) return NextResponse.json({ error: 'pool required' }, { status: 400 })

  const res = await fetch(`${MERIDIAN_BASE}/top-lp/${encodeURIComponent(pool)}`, {
    headers: { 'x-api-key': process.env.MERIDIAN_API_KEY ?? '' },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status })
  return NextResponse.json(await res.json())
}
