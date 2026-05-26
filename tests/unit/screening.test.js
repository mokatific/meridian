import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({ log: vi.fn() }));
vi.mock("../../config.js", () => ({
  config: {
    screening: {
      timeframe: "5m",
      category: "trending",
      minTvl: 10_000,
      maxTvl: 150_000,
      minVolume: 500,
      minOrganic: 60,
      minQuoteOrganic: 60,
      minHolders: 500,
      minMcap: 150_000,
      maxMcap: 10_000_000,
      minBinStep: 80,
      maxBinStep: 125,
      minFeeActiveTvlRatio: 0.05,
      excludeHighSupplyConcentration: true,
      useDiscordSignals: false,
      minTokenAgeHours: null,
      maxTokenAgeHours: null,
      allowedLaunchpads: [],
      blockedLaunchpads: [],
    },
  },
}));
vi.mock("../../token-blacklist.js", () => ({ isBlacklisted: vi.fn(() => false) }));
vi.mock("../../dev-blocklist.js", () => ({
  isDevBlocked: vi.fn(() => false),
  getBlockedDevs: vi.fn(() => []),
}));
vi.mock("../../pool-memory.js", () => ({
  isBaseMintOnCooldown: vi.fn(() => null),
  isPoolOnCooldown: vi.fn(() => null),
}));
vi.mock("../chart-indicators.js", () => ({
  confirmIndicatorPreset: vi.fn(),
}));
vi.mock("../agent-meridian.js", () => ({
  getAgentMeridianBase: vi.fn(() => "https://api.agentmeridian.xyz/api"),
  getAgentMeridianHeaders: vi.fn(() => ({})),
}));
vi.mock("../jupiter-official.js", () => ({
  searchTokenOfficial: vi.fn(() => null),
  mapOfficialToScreening: vi.fn((x) => x),
}));
vi.mock("../../utils/datapi-limiter.js", () => ({
  rateLimitedDataPiFetch: vi.fn(),
}));

let discoverPools;
let getPoolDetail;
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  ({ discoverPools, getPoolDetail } = await import("../../tools/screening.js"));
});

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => body,
  };
}

function rawPool(over = {}) {
  return {
    pool_address: "POOL1",
    name: "FOO-SOL",
    pool_type: "dlmm",
    tvl: 50_000,
    active_tvl: 30_000,
    fee: 100,
    volume: 5_000,
    fee_active_tvl_ratio: 0.5,
    volatility: 4,
    pool_price: 1.23,
    base_token_holders: 800,
    active_positions: 12,
    active_positions_pct: 80,
    dlmm_params: { bin_step: 100 },
    token_x: {
      symbol: "FOO",
      address: "MINT_FOO",
      organic_score: 75,
      market_cap: 500_000,
      created_at: Date.now() - 24 * 3_600_000,
    },
    token_y: { symbol: "SOL", address: "So11111111111111111111111111111111111111112" },
    ...over,
  };
}

describe("getPoolDetail", () => {
  it("returns the first pool when the API responds with data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [rawPool({ name: "BONK-SOL" })] }));
    const detail = await getPoolDetail({ pool_address: "POOL1" });
    expect(detail).toBeDefined();
    expect(detail.name).toBe("BONK-SOL");
    expect(detail.pool_address).toBe("POOL1");
  });

  it("throws when the pool is not found (empty data array)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    await expect(getPoolDetail({ pool_address: "MISSING" })).rejects.toThrow(/MISSING not found/);
  });

  it("throws on non-2xx API responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }));
    await expect(getPoolDetail({ pool_address: "POOL1" })).rejects.toThrow(/Pool detail API error/);
  });

  it("issues a request against the pool-discovery endpoint with the right filter", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [rawPool()] }));
    await getPoolDetail({ pool_address: "POOLX", timeframe: "1h" });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("pool-discovery-api.datapi.meteora.ag");
    expect(url).toContain("pool_address%3DPOOLX");
    expect(url).toContain("timeframe=1h");
  });
});

describe("discoverPools", () => {
  it("returns raw pools and totals from the discovery API", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [rawPool(), rawPool({ pool_address: "POOL2", name: "BAR-SOL" })],
        total: 2,
      }),
    );
    const out = await discoverPools({ page_size: 10 });
    expect(out).toBeDefined();
    expect(Array.isArray(out.pools)).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("propagates the screening filters into the request URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], total: 0 }));
    await discoverPools({ page_size: 25 });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("page_size=25");
    expect(url).toContain("pool_type%3Ddlmm");
    expect(url).toContain("tvl%3E%3D10000"); // tvl>=10000
    expect(url).toContain("category=trending");
    expect(url).toContain("timeframe=5m");
  });

  it("handles an empty data array without throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [], total: 0 }));
    const out = await discoverPools({ page_size: 5 });
    expect(out.pools).toEqual([]);
  });

  it("surfaces upstream HTTP errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
    await expect(discoverPools({ page_size: 5 })).rejects.toThrow(/Pool Discovery API error/);
  });
});
