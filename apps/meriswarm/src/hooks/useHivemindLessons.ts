import useSWR from "swr";
import type { Lesson } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useHivemindLessons(limit = 50) {
  return useSWR<{ lessons: Lesson[]; pulledAt?: string }>(
    `/api/hivemind/lessons?limit=${limit}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );
}
