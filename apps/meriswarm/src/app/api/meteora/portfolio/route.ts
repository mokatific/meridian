import { NextRequest, NextResponse } from "next/server";

const BASE = "https://dlmm.datapi.meteora.ag";

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user");
  if (!user) return NextResponse.json({ error: "user required" }, { status: 400 });

  const res = await fetch(`${BASE}/portfolio/open?user=${encodeURIComponent(user)}`, {
    cache: "no-store",
  });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
