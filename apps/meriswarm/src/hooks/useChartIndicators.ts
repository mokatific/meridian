import useSWR from "swr";
import type { ChartResponse } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useChartIndicators(mint: string | null, interval = "5_MINUTE", candles = 200) {
  return useSWR<ChartResponse>(
    mint
      ? `/api/meridian/chart?mint=${encodeURIComponent(mint)}&interval=${interval}&candles=${candles}`
      : null,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );
}
