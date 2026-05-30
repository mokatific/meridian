import { NextResponse } from "next/server";

// No auth required — this is a public endpoint
export async function GET() {
  const res = await fetch("https://api.agentmeridian.xyz/api/hivemind/summary/public", {
    cache: "no-store",
  });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
