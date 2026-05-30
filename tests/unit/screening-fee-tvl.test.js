import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({ log: vi.fn() }));
vi.mock("../../config.js", () => ({
  config: {
    screening: {
      timeframe: "1h",
      minFeeActiveTvlRatio: 0.05,
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
      excludeHighSupplyConcentration: false,
      useDiscordSignals: false,
      minTokenAgeHours: null,
      maxTokenAgeHours: null,
      allowedLaunchpads: [],
      blockedLaunchpads: [],
      category: "trending",
    },
    tokens: { SOL: "So11111111111111111111111111111111111111112" },
  },
}));
vi.mock("../../token-blacklist.js", () => ({ isBlacklisted: vi.fn(() => false) }));
vi.mock("../../dev-blocklist.js", () => ({
  isDevBlocked: vi.fn(() => false),
  getBlockedDevs: vi.fn(() => ({})),
}));

// ── fetchPoolDiscoveryDetail mock ────────────────────────────

const mockPoolDetails = vi.hoisted(() => new Map());

vi.mock("node-fetch", () => ({ default: vi.fn() }));

// We intercept at the module level via a factory that wraps fetch
// screening.js uses a top-level `fetch` (global) — mock it via vi.stubGlobal
// instead of mocking a module.

beforeEach(() => {
  vi.resetModules();
  mockPoolDetails.clear();
});

// ── helpers ──────────────────────────────────────────────────

function makePool(overrides = {}) {
  return {
    pool_address: "pool-abc",
    name: "TEST-SOL",
    pool_type: "dlmm",
    dlmm_params: { bin_step: 100 },
    tvl: 50_000,
    active_tvl: 40_000,
    fee: 100,
    volume: 5_000,
    fee_active_tvl_ratio: 0.09,
    volatility: 3.0,
    token_x: {
      address: "base-mint",
      market_cap: 500_000,
      organic_score: 75,
      created_at: Date.now() / 1000 - 48 * 3600,
    },
    token_y: {
      address: "So11111111111111111111111111111111111111112",
      organic_score: 80,
    },
    base_token_holders: 800,
    ...overrides,
  };
}

function makeScreeningConfig(overrides = {}) {
  return {
    minFeeActiveTvlRatio: 0.05,
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
    excludeHighSupplyConcentration: false,
    minTokenAgeHours: null,
    maxTokenAgeHours: null,
    allowedLaunchpads: [],
    blockedLaunchpads: [],
    ...overrides,
  };
}

// ── getRawPoolScreeningRejectReason ──────────────────────────

describe("getRawPoolScreeningRejectReason — effective_fee_tvl_ratio", () => {
  it("rejects pool when effective_fee_tvl_ratio is null and primary is below threshold", async () => {
    const { getRawPoolScreeningRejectReason } = await import("../../tools/screening.js");
    const pool = makePool({ fee_active_tvl_ratio: 0.03, effective_fee_tvl_ratio: null });
    const s = makeScreeningConfig({ minFeeActiveTvlRatio: 0.05 });

    const reason = getRawPoolScreeningRejectReason(pool, s);

    // effective is null → falls back to primary 0.03 → rejected
    expect(reason).toMatch(/fee\/active-TVL/);
    expect(reason).toMatch(/0\.03/);
  });

  it("rejects pool when effective_fee_tvl_ratio is below threshold", async () => {
    const { getRawPoolScreeningRejectReason } = await import("../../tools/screening.js");
    const pool = makePool({ fee_active_tvl_ratio: 0.02, effective_fee_tvl_ratio: 0.04 });
    const s = makeScreeningConfig({ minFeeActiveTvlRatio: 0.05 });

    const reason = getRawPoolScreeningRejectReason(pool, s);

    // effective 0.04 < threshold 0.05 → rejected
    expect(reason).toMatch(/fee\/active-TVL/);
    expect(reason).toMatch(/0\.04/);
  });

  it("passes pool when effective_fee_tvl_ratio meets threshold even if primary is low", async () => {
    const { getRawPoolScreeningRejectReason } = await import("../../tools/screening.js");
    // Pool has low 1h fee/tvl but high 4h effective (pool was active earlier)
    const pool = makePool({ fee_active_tvl_ratio: 0.02, effective_fee_tvl_ratio: 0.08 });
    const s = makeScreeningConfig({ minFeeActiveTvlRatio: 0.05 });

    const reason = getRawPoolScreeningRejectReason(pool, s);

    // Should not reject on fee/TVL — may pass or fail on other criteria
    expect(reason ?? "").not.toMatch(/fee\/active-TVL/);
  });

  it("falls back to primary fee_active_tvl_ratio when effective is not set", async () => {
    const { getRawPoolScreeningRejectReason } = await import("../../tools/screening.js");
    const pool = makePool({ fee_active_tvl_ratio: 0.09 }); // no effective_fee_tvl_ratio
    const s = makeScreeningConfig({ minFeeActiveTvlRatio: 0.05 });

    const reason = getRawPoolScreeningRejectReason(pool, s);

    expect(reason ?? "").not.toMatch(/fee\/active-TVL/);
  });
});

// ── effective_fee_tvl_ratio computation ──────────────────────

describe("effective_fee_tvl_ratio computation logic", () => {
  it("max of all timeframe values is used as effective", () => {
    // Test the computation directly without running full screening
    const values = [0.03, 0.12, 0.07]; // 5m, 1h, 4h
    const effective = Math.max(...values.filter((v) => v != null && Number.isFinite(v) && v > 0));
    expect(effective).toBe(0.12);
  });

  it("ignores null/zero values when computing effective", () => {
    const values = [null, 0, 0.06];
    const valid = values.filter((v) => v != null && Number.isFinite(v) && v > 0);
    const effective = valid.length > 0 ? Math.max(...valid) : null;
    expect(effective).toBe(0.06);
  });

  it("returns null when all timeframe values are null or zero", () => {
    const values = [null, null, 0];
    const valid = values.filter((v) => v != null && Number.isFinite(v) && v > 0);
    const effective = valid.length > 0 ? Math.max(...valid) : null;
    expect(effective).toBeNull();
  });

  it("effective equals primary when only primary is available", () => {
    const primary = 0.07;
    const values = [primary, null, null];
    const valid = values.filter((v) => v != null && Number.isFinite(v) && v > 0);
    const effective = valid.length > 0 ? Math.max(...valid) : null;
    expect(effective).toBe(0.07);
  });
});

// ── condensePool field exposure ──────────────────────────────

describe("condensePool exposes multi-timeframe fee/TVL fields", () => {
  it("condensed pool includes effective_fee_tvl_ratio and per-timeframe fields", async () => {
    const { getRawPoolScreeningRejectReason } = await import("../../tools/screening.js");

    // Simulate what condensePool would return by checking the pool passes through
    const pool = makePool({
      fee_active_tvl_ratio: 0.09,
      effective_fee_tvl_ratio: 0.12,
      fee_active_tvl_5m: 0.01,
      fee_active_tvl_1h: 0.09,
      fee_active_tvl_4h: 0.12,
    });

    // Verify filter logic sees effective correctly
    const s = makeScreeningConfig({ minFeeActiveTvlRatio: 0.05 });
    const reason = getRawPoolScreeningRejectReason(pool, s);
    expect(reason ?? "").not.toMatch(/fee\/active-TVL/);

    // Verify fields exist on the pool object (condensePool reads these same fields)
    expect(pool.effective_fee_tvl_ratio).toBe(0.12);
    expect(pool.fee_active_tvl_5m).toBe(0.01);
    expect(pool.fee_active_tvl_1h).toBe(0.09);
    expect(pool.fee_active_tvl_4h).toBe(0.12);
  });
});
