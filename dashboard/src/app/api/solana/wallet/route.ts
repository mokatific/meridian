import { NextRequest, NextResponse } from 'next/server'

const RPC = 'https://api.mainnet-beta.solana.com'

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  })
  return res.json()
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet')
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 })

  const [balanceRes, sigsRes] = await Promise.all([
    rpc('getBalance', [wallet]),
    rpc('getSignaturesForAddress', [wallet, { limit: 20, commitment: 'finalized' }]),
  ])

  const lamports = balanceRes?.result?.value ?? 0
  const signatures = sigsRes?.result ?? []

  return NextResponse.json({
    wallet,
    solBalance: lamports / 1e9,
    lamports,
    recentSignatures: signatures,
    lastActivity: signatures[0]?.blockTime ?? null,
  })
}
