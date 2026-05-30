import { NextRequest, NextResponse } from "next/server";

const MERIDIAN_BASE = "https://api.agentmeridian.xyz/api";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const chainIndex = req.nextUrl.searchParams.get("chainIndex") ?? "501";
  const res = await fetch(
    `${MERIDIAN_BASE}/okx/enrich/${encodeURIComponent(token)}?chainIndex=${encodeURIComponent(chainIndex)}`,
    {
      headers: { "x-api-key": process.env.MERIDIAN_API_KEY ?? "" },
      cache: "no-store",
    },
  );
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
