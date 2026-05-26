import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({ log: vi.fn() }));

// Shared mock state — reset per test
const mockState = vi.hoisted(() => ({
  callCount: 0,
  failuresRemaining: 0,
}));

vi.mock("@solana/web3.js", () => {
  class Connection {
    constructor(url) {
      this.url = url;
    }
    async getLatestBlockhash() {
      mockState.callCount++;
      if (mockState.failuresRemaining > 0) {
        mockState.failuresRemaining--;
        throw new Error("429 Too Many Requests (retry-after: 0)");
      }
      return {
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 123,
      };
    }
  }
  return { Connection };
});

beforeEach(() => {
  process.env.RPC_MAX_RETRIES = "3";
  process.env.RPC_RETRY_BASE_MS = "20";
  process.env.RPC_RETRY_CAP_MS = "200";
  delete process.env.RPC_URL_FALLBACK;
  mockState.callCount = 0;
  mockState.failuresRemaining = 0;
  vi.resetModules();
});

describe("createCachedConnection — retry on 429", () => {
  it("retries the request after a 429 Too Many Requests until it succeeds", async () => {
    mockState.failuresRemaining = 2;
    const { createCachedConnection } = await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");

    const result = await conn.getLatestBlockhash();

    expect(result.blockhash).toBe("11111111111111111111111111111111");
    expect(result.lastValidBlockHeight).toBe(123);
    expect(mockState.callCount).toBe(3); // 2 failures + 1 success
  }, 15000);

  it("throws after exceeding RPC_MAX_RETRIES on persistent 429s", async () => {
    mockState.failuresRemaining = 100;
    const { createCachedConnection } = await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");

    await expect(conn.getLatestBlockhash()).rejects.toThrow();
    expect(mockState.callCount).toBeGreaterThanOrEqual(4); // initial + 3 retries
  }, 15000);

  it("reports failover stats via getRpcCacheStats", async () => {
    mockState.failuresRemaining = 0;
    const { createCachedConnection, getRpcCacheStats } = await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");
    await conn.getLatestBlockhash();

    const stats = getRpcCacheStats();
    expect(stats).toHaveProperty("hits");
    expect(stats).toHaveProperty("misses");
    expect(stats).toHaveProperty("usingFallback");
    expect(stats.usingFallback).toBe(false);
  }, 10000);
});
