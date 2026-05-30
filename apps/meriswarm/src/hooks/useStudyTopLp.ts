import useSWR from "swr";
import type { StudyTopLpResponse } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useStudyTopLp(pool: string | null) {
  return useSWR<StudyTopLpResponse>(
    pool ? `/api/meridian/study-top-lp?pool=${encodeURIComponent(pool)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
}
