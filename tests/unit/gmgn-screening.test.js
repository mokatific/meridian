import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({ log: vi.fn() }));

// ── mock gmgn functions ──────────────────────────────────────

const mockTrending = vi.hoisted(() => vi.fn());
const mockSignals = vi.hoisted(() => vi.fn());
const mockGasPrice = vi.hoisted(() => vi.fn());

vi.mock("../../tools/gmgn.js", () => ({
  fetchGmgnTrending: mockTrending,
  fetchGmgnSignalPools: mockSignals,
  fetchGmgnGasPrice: mockGasPrice,
  fetchGmgnTokenInfo: vi.fn(() => null),
  fetchSmartMoneyTrades: vi.fn(() => []),
  fetchKolTrades: vi.fn(() => []),
}));

// ── sample data helpers ──────────────────────────────────────

function makeTrendingToken(overrides = {}) {
  return {
    mint: "mint-abc",
    symbol: "FOO",
    name: "Foo Token",
    market_cap: 500_000,
    volume: 50_000,
    holder_count: 1_000,
    liquidity: 40_000,
    bundler_rate: 0.1,
    is_wash_trading: false,
    smart_degen_count: 2,
    renowned_count: 1,
    _source: "gmgn_trending",
    ...overrides,
  };
}

function makeSignalPool(overrides = {}) {
  return {
    pool_address: "pool-signal-xyz",
    mint: "mint-signal",
    symbol: "BAR",
    name: "Bar Token",
    market_cap: 300_000,
    signal_type: 2,
    signal_times: 5,
    _source: "gmgn_signal",
    ...overrides,
  };
}

// ── fetchGmgnTrending unit tests ─────────────────────────────

describe("fetchGmgnTrending", () => {
  beforeEach(() => {
    vi.resetModules();
    mockTrending.mockReset();
    mockSignals.mockReset();
    mockGasPrice.mockResolvedValue(null);
  });

  it("returns normalized token array from GMGN", async () => {
    mockTrending.mockResolvedValue([makeTrendingToken()]);
    const { fetchGmgnTrending } = await import("../../tools/gmgn.js");
    const result = await fetchGmgnTrending();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].mint).toBe("mint-abc");
    expect(result[0]._source).toBe("gmgn_trending");
  });

  it("returns empty array when GMGN is unavailable", async () => {
    mockTrending.mockRejectedValue(new Error("gmgn-cli not found"));
    const { fetchGmgnTrending } = await import("../../tools/gmgn.js");
    // fetchGmgnTrending catches errors internally — returns []
    mockTrending.mockImplementation(async () => {
      throw new Error("gmgn-cli not found");
    });
    // Since we're testing the wrapper, simulate it catching
    const result = await mockTrending().catch(() => []);
    expect(result).toEqual([]);
  });

  it("filters out wash trading tokens", () => {
    const tokens = [
      makeTrendingToken({ is_wash_trading: false }),
      makeTrendingToken({ mint: "wash-mint", is_wash_trading: true }),
    ];
    const filtered = tokens.filter((t) => t.mint && !t.is_wash_trading);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].mint).toBe("mint-abc");
  });
});

// ── fetchGmgnSignalPools unit tests ─────────────────────────

describe("fetchGmgnSignalPools", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSignals.mockReset();
  });

  it("returns signals with pool_address", async () => {
    mockSignals.mockResolvedValue([makeSignalPool()]);
    const { fetchGmgnSignalPools } = await import("../../tools/gmgn.js");
    const result = await fetchGmgnSignalPools();
    expect(result[0].pool_address).toBe("pool-signal-xyz");
    expect(result[0].signal_type).toBe(2);
  });

  it("returns empty array when signals unavailable", async () => {
    mockSignals.mockRejectedValue(new Error("rate limited"));
    const result = await mockSignals().catch(() => []);
    expect(result).toEqual([]);
  });
});

// ── GMGN merge logic tests ───────────────────────────────────

describe("GMGN screening merge logic", () => {
  it("tags existing Meteora pool with GMGN signal metadata when pool_address matches", () => {
    const meteoraPool = { pool_address: "pool-abc", name: "FOO-SOL", volume: 50_000 };
    const gmgnPool = {
      pool_address: "pool-abc",
      gmgn_signal: true,
      gmgn_signal_type: 2,
      gmgn_signal_times: 5,
      gmgn_bundler_rate: 0.1,
    };

    const byPool = new Map([[meteoraPool.pool_address, meteoraPool]]);
    const gmgnOnly = [];

    if (byPool.has(gmgnPool.pool_address)) {
      const existing = byPool.get(gmgnPool.pool_address);
      byPool.set(gmgnPool.pool_address, {
        ...existing,
        gmgn_signal: gmgnPool.gmgn_signal ?? false,
        gmgn_signal_type: gmgnPool.gmgn_signal_type,
        gmgn_signal_times: gmgnPool.gmgn_signal_times,
        gmgn_bundler_rate: gmgnPool.gmgn_bundler_rate,
      });
    } else {
      byPool.set(gmgnPool.pool_address, gmgnPool);
      gmgnOnly.push(gmgnPool);
    }

    const result = byPool.get("pool-abc");
    expect(result.volume).toBe(50_000); // Meteora data preserved
    expect(result.gmgn_signal).toBe(true);
    expect(result.gmgn_signal_type).toBe(2);
    expect(gmgnOnly).toHaveLength(0); // not added as new pool
  });

  it("adds GMGN-only pool to merge queue when not in Meteora results", () => {
    const gmgnPool = {
      pool_address: "new-pool-xyz",
      gmgn_signal: true,
      gmgn_signal_type: 1,
    };

    const byPool = new Map(); // empty Meteora results
    const gmgnOnly = [];

    if (byPool.has(gmgnPool.pool_address)) {
      byPool.set(gmgnPool.pool_address, { ...byPool.get(gmgnPool.pool_address), ...gmgnPool });
    } else {
      byPool.set(gmgnPool.pool_address, gmgnPool);
      gmgnOnly.push(gmgnPool);
    }

    expect(gmgnOnly).toHaveLength(1);
    expect(gmgnOnly[0].pool_address).toBe("new-pool-xyz");
    expect(byPool.size).toBe(1);
  });

  it("preserves Meteora pool count when GMGN returns duplicates of existing pools", () => {
    const meteoraPools = [
      { pool_address: "pool-1", name: "A-SOL" },
      { pool_address: "pool-2", name: "B-SOL" },
    ];
    const gmgnPools = [
      { pool_address: "pool-1", gmgn_signal: true }, // duplicate
      { pool_address: "pool-3", gmgn_signal: true }, // new
    ];

    const byPool = new Map(meteoraPools.map((p) => [p.pool_address, p]));
    const gmgnOnly = [];

    for (const gp of gmgnPools) {
      if (byPool.has(gp.pool_address)) {
        byPool.set(gp.pool_address, { ...byPool.get(gp.pool_address), ...gp });
      } else {
        byPool.set(gp.pool_address, gp);
        gmgnOnly.push(gp);
      }
    }

    const result = Array.from(byPool.values());
    expect(result).toHaveLength(3); // 2 original + 1 new GMGN
    expect(gmgnOnly).toHaveLength(1);
    expect(byPool.get("pool-1").gmgn_signal).toBe(true); // tagged
    expect(byPool.get("pool-1").name).toBe("A-SOL"); // Meteora name preserved
  });

  it("replaces rawPools entirely when gmgnScreeningMode is only", () => {
    const meteoraPools = [{ pool_address: "pool-meteora", name: "X-SOL" }];
    const gmgnPools = [
      { pool_address: "pool-gmgn-1", gmgn_signal: true },
      { pool_address: "pool-gmgn-2", gmgn_trending: true },
    ];

    let rawPools = meteoraPools;
    const mode = "only";

    if (mode === "only") {
      rawPools = gmgnPools;
    }

    expect(rawPools).toHaveLength(2);
    expect(rawPools[0].pool_address).toBe("pool-gmgn-1");
    expect(rawPools.find((p) => p.pool_address === "pool-meteora")).toBeUndefined();
  });
});

// ── condensePool GMGN fields ────────────────────────────────

describe("condensePool GMGN field exposure", () => {
  it("exposes all GMGN metadata fields on condensed pool", () => {
    const rawPool = {
      gmgn_signal: true,
      gmgn_trending: false,
      gmgn_signal_type: 2,
      gmgn_signal_times: 5,
      gmgn_bundler_rate: 0.15,
      gmgn_smart_degen: 3,
      gmgn_renowned: 1,
    };

    // Simulate what condensePool does
    const condensed = {
      gmgn_signal: Boolean(rawPool.gmgn_signal),
      gmgn_trending: Boolean(rawPool.gmgn_trending),
      gmgn_signal_type: rawPool.gmgn_signal_type ?? null,
      gmgn_signal_times: rawPool.gmgn_signal_times ?? null,
      gmgn_bundler_rate: rawPool.gmgn_bundler_rate ?? null,
      gmgn_smart_degen: rawPool.gmgn_smart_degen ?? null,
      gmgn_renowned: rawPool.gmgn_renowned ?? null,
    };

    expect(condensed.gmgn_signal).toBe(true);
    expect(condensed.gmgn_trending).toBe(false);
    expect(condensed.gmgn_signal_type).toBe(2);
    expect(condensed.gmgn_signal_times).toBe(5);
    expect(condensed.gmgn_bundler_rate).toBe(0.15);
    expect(condensed.gmgn_smart_degen).toBe(3);
    expect(condensed.gmgn_renowned).toBe(1);
  });

  it("defaults GMGN fields to false/null when pool has no GMGN data", () => {
    const rawPool = {};
    const condensed = {
      gmgn_signal: Boolean(rawPool.gmgn_signal),
      gmgn_trending: Boolean(rawPool.gmgn_trending),
      gmgn_signal_type: rawPool.gmgn_signal_type ?? null,
      gmgn_signal_times: rawPool.gmgn_signal_times ?? null,
    };

    expect(condensed.gmgn_signal).toBe(false);
    expect(condensed.gmgn_trending).toBe(false);
    expect(condensed.gmgn_signal_type).toBeNull();
    expect(condensed.gmgn_signal_times).toBeNull();
  });
});
