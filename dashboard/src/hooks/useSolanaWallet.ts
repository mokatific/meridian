import useSWR from 'swr'
import type { SolanaWalletResponse } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useSolanaWallet(wallet: string | null) {
  return useSWR<SolanaWalletResponse>(
    wallet ? `/api/solana/wallet?wallet=${encodeURIComponent(wallet)}` : null,
    fetcher,
    { refreshInterval: 60 * 1000, revalidateOnFocus: false },
  )
}
