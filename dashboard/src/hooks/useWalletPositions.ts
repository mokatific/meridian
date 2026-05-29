import useSWR from 'swr'
import type { MeteoraPositionsResponse } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useWalletPositions(pool: string | null, user: string | null, status = 'closed') {
  return useSWR<MeteoraPositionsResponse>(
    pool && user ? `/api/meteora/positions?pool=${encodeURIComponent(pool)}&user=${encodeURIComponent(user)}&status=${status}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
}
