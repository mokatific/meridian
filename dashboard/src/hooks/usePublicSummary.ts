import useSWR from 'swr'
import type { PublicSummary } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function usePublicSummary() {
  return useSWR<PublicSummary>('/api/hivemind/summary', fetcher, {
    refreshInterval: 30 * 1000,
    revalidateOnFocus: false,
  })
}
