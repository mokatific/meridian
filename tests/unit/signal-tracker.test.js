import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../logger.js", () => ({
  log: vi.fn(),
}));

let stageSignals;
let getAndClearStagedSignals;
let getStagedPools;

beforeEach(async () => {
  vi.resetModules();
  ({ stageSignals, getAndClearStagedSignals, getStagedPools } =
    await import("../../signal-tracker.js"));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-15T08:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stageSignals + getAndClearStagedSignals", () => {
  it("stages and retrieves signals by pool address", () => {
    stageSignals("pool-1", { organic_score: 80, fee_tvl_ratio: 0.5 });
    const out = getAndClearStagedSignals("pool-1");
    expect(out).toMatchObject({
      organic_score: 80,
      fee_tvl_ratio: 0.5,
      base_mint: null,
    });
    expect(out.staged_at).toBeUndefined();
  });

  it("clears the entry after retrieval (one-shot)", () => {
    stageSignals("pool-1", { organic_score: 80 });
    expect(getAndClearStagedSignals("pool-1")).not.toBeNull();
    expect(getAndClearStagedSignals("pool-1")).toBeNull();
  });

  it("falls back to base_mint lookup when pool address misses", () => {
    stageSignals("pool-1", { organic_score: 80, base_mint: "MINT_ABC" });
    const out = getAndClearStagedSignals("wrong-pool", "MINT_ABC");
    expect(out?.organic_score).toBe(80);
  });

  it("base_mint lookup also clears entry", () => {
    stageSignals("pool-1", { organic_score: 80, base_mint: "MINT_ABC" });
    getAndClearStagedSignals("wrong-pool", "MINT_ABC");
    expect(getAndClearStagedSignals("pool-1")).toBeNull();
  });

  it("returns null for unknown pool", () => {
    expect(getAndClearStagedSignals("nonexistent")).toBeNull();
  });

  it("normalizes empty/null pool address to null without throwing", () => {
    stageSignals("", { organic_score: 80 });
    expect(getStagedPools()).toEqual([]);
  });

  it("supports both base_mint and baseMint signal keys", () => {
    stageSignals("pool-1", { organic_score: 80, baseMint: "MINT_X" });
    const out = getAndClearStagedSignals(null, "MINT_X");
    expect(out?.organic_score).toBe(80);
  });
});

describe("TTL cleanup", () => {
  it("evicts entries older than 10 minutes", () => {
    stageSignals("pool-1", { organic_score: 80, base_mint: "MINT" });
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(getStagedPools()).not.toContain("pool-1");
    expect(getAndClearStagedSignals("pool-1")).toBeNull();
    expect(getAndClearStagedSignals(null, "MINT")).toBeNull();
  });

  it("keeps entries under the TTL", () => {
    stageSignals("pool-1", { organic_score: 80 });
    vi.advanceTimersByTime(9 * 60 * 1000);
    expect(getStagedPools()).toContain("pool-1");
  });
});

describe("getStagedPools", () => {
  it("lists all currently-staged pool keys", () => {
    stageSignals("pool-a", { organic_score: 1 });
    stageSignals("pool-b", { organic_score: 2 });
    expect(getStagedPools().sort()).toEqual(["pool-a", "pool-b"]);
  });
});
