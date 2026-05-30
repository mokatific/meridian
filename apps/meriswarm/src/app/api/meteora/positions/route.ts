import { NextRequest, NextResponse } from "next/server";

const BASE = "https://dlmm.datapi.meteora.ag";

export async function GET(req: NextRequest) {
  const pool = req.nextUrl.searchParams.get("pool");
  const user = req.nextUrl.searchParams.get("user");
  if (!pool || !user)
    return NextResponse.json({ error: "pool and user required" }, { status: 400 });

  const status = req.nextUrl.searchParams.get("status") ?? "closed";
  const pageSize = req.nextUrl.searchParams.get("pageSize") ?? "20";
  const page = req.nextUrl.searchParams.get("page") ?? "0";

  const params = new URLSearchParams({ user, status, pageSize, page });
  const res = await fetch(`${BASE}/positions/${encodeURIComponent(pool)}/pnl?${params}`, {
    cache: "no-store",
  });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
