import { NextResponse } from "next/server";

const HM_BASE = "https://api.agentmeridian.xyz";

export async function POST() {
  const agentId = process.env.HIVEMIND_AGENT_ID ?? "dashboard-viewer";
  const res = await fetch(`${HM_BASE}/api/hivemind/agents/register`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.HIVEMIND_API_KEY ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      agentId,
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      reason: "dashboard-heartbeat",
      capabilities: { telegram: false, lpagent: false, dryRun: false },
    }),
    cache: "no-store",
  });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
