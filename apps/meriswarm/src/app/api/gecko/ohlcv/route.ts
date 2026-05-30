import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.geckoterminal.com/api/v2";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const timeframe = req.nextUrl.searchParams.get("timeframe") ?? "minute";
  const aggregate = req.nextUrl.searchParams.get("aggregate") ?? "5";
  const limit = req.nextUrl.searchParams.get("limit") ?? "200";

  const params = new URLSearchParams({ aggregate, limit });
  const res = await fetch(
    `${BASE}/networks/solana/pools/${encodeURIComponent(address)}/ohlcv/${timeframe}?${params}`,
    { headers: { Accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
