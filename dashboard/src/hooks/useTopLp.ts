import useSWR from 'swr'
import type { TopLpResponse } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useTopLp(pool: string | null) {
  return useSWR<TopLpResponse>(
    pool ? `/api/meridian/top-lp?pool=${encodeURIComponent(pool)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
}
