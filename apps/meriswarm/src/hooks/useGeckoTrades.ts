import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useGeckoTrades(address: string | null) {
  return useSWR(
    address ? `/api/gecko/trades?address=${encodeURIComponent(address)}` : null,
    fetcher,
    { refreshInterval: 30 * 1000, revalidateOnFocus: false },
  );
}
