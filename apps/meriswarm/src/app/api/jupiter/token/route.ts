import { NextRequest, NextResponse } from "next/server";

const BASE = "https://datapi.jup.ag/v1";

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint");
  if (!mint) return NextResponse.json({ error: "mint required" }, { status: 400 });

  const res = await fetch(`${BASE}/assets/search?query=${encodeURIComponent(mint)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  const data = await res.json();
  // Return first matching asset (exact mint match)
  const assets = Array.isArray(data) ? data : (data.assets ?? data.data ?? []);
  const exact = assets.find((a: { id?: string }) => a.id === mint) ?? assets[0] ?? null;
  return NextResponse.json({ asset: exact, all: assets.slice(0, 5) });
}
