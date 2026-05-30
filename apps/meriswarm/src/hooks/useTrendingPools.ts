import useSWR from "swr";
import type { MeteoraTrendingResponse } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useTrendingPools(category = "trending", timeframe = "1h", pageSize = 20) {
  return useSWR<MeteoraTrendingResponse>(
    `/api/meteora/trending?category=${category}&timeframe=${timeframe}&pageSize=${pageSize}`,
    fetcher,
    { refreshInterval: 2 * 60 * 1000, revalidateOnFocus: false },
  );
}
