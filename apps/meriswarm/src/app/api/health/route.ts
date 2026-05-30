import { NextResponse } from "next/server";

const MERIDIAN_BASE = "https://api.agentmeridian.xyz/api";

export async function GET() {
  const res = await fetch(`${MERIDIAN_BASE}/health`, {
    headers: { "x-api-key": process.env.MERIDIAN_API_KEY ?? "" },
    cache: "no-store",
  });
  if (!res.ok)
    return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
  return NextResponse.json(await res.json());
}
