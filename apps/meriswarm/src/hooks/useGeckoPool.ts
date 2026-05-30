import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useGeckoPool(address: string | null) {
  return useSWR(
    address ? `/api/gecko/pool?address=${encodeURIComponent(address)}` : null,
    fetcher,
    { refreshInterval: 60 * 1000, revalidateOnFocus: false },
  );
}
