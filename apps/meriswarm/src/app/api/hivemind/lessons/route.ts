import { NextRequest, NextResponse } from "next/server";

const HM_BASE = "https://api.agentmeridian.xyz";

export async function GET(req: NextRequest) {
  const agentId =
    req.nextUrl.searchParams.get("agentId") ?? process.env.HIVEMIND_AGENT_ID ?? "dashboard-viewer";
  const limit = req.nextUrl.searchParams.get("limit") ?? "50";

  const res = await fetch(
    `${HM_BASE}/api/hivemind/lessons/pull?agentId=${encodeURIComponent(agentId)}&limit=${encodeURIComponent(limit)}`,
    {
      headers: { "x-api-key": process.env.HIVEMIND_API_KEY ?? "" },
      cache: "no-store",
    },
  );
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
