import useSWR from 'swr'
import type { JupiterAsset } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useJupiterToken(mint: string | null) {
  return useSWR<{ asset: JupiterAsset | null }>(
    mint ? `/api/jupiter/token?mint=${encodeURIComponent(mint)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
}
