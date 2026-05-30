import { NextRequest, NextResponse } from "next/server";

const BASE = "https://dlmm.datapi.meteora.ag";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const res = await fetch(`${BASE}/pools/${encodeURIComponent(address)}`, { cache: "no-store" });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
