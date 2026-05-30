import { NextRequest, NextResponse } from "next/server";

const BASE = "https://pool-discovery-api.datapi.meteora.ag";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? "trending";
  const timeframe = req.nextUrl.searchParams.get("timeframe") ?? "1h";
  const pageSize = req.nextUrl.searchParams.get("pageSize") ?? "20";

  const params = new URLSearchParams({ category, timeframe, page_size: pageSize });
  const res = await fetch(`${BASE}/pools?${params}`, { cache: "no-store" });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
