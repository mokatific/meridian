import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({ log: vi.fn() }));
vi.mock("../../tools/gmgn.js", () => ({ fetchGmgnGasPrice: async () => null }));

// Shared mock state — reset per test
const mockState = vi.hoisted(() => ({
  callCount: 0,
  failuresRemaining: 0,
  confirmationPolls: 0,
  sentRawTxCount: 0,
  txError: null,
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
    async getSignatureStatuses() {
      mockState.confirmationPolls++;
      if (mockState.txError) {
        return { value: [{ confirmationStatus: "confirmed", err: mockState.txError }] };
      }
      return {
        value: [
          mockState.confirmationPolls >= 3 ? { confirmationStatus: "confirmed", err: null } : null,
        ],
      };
    }
    async getBlockHeight() {
      return 100;
    }
    async sendRawTransaction(rawTx) {
      mockState.sentRawTxCount++;
      return "mock-signature-abc123";
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
  mockState.confirmationPolls = 0;
  mockState.sentRawTxCount = 0;
  mockState.txError = null;
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

  it("polls signature status instead of relying on websocket confirmation", async () => {
    const { createCachedConnection } = await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");

    const result = await conn.confirmTransaction(
      {
        signature: "test-signature",
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 200,
      },
      "confirmed",
    );

    expect(result.value[0].confirmationStatus).toBe("confirmed");
    expect(mockState.confirmationPolls).toBe(3);
  }, 10000);
});

describe("sendAndConfirmPolling", () => {
  function makeLegacyTx() {
    // Minimal object that mimics a legacy Transaction
    return {
      instructions: [],
      recentBlockhash: null,
      lastValidBlockHeight: null,
      feePayer: null,
      sign: vi.fn(),
      serialize: vi.fn(() => Buffer.from("fake-tx")),
    };
  }

  it("sends via sendRawTransaction and polls — never uses signatureSubscribe", async () => {
    const { createCachedConnection, sendAndConfirmPolling } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");
    const tx = makeLegacyTx();
    const wallet = { publicKey: "wallet-pubkey" };

    const sig = await sendAndConfirmPolling(conn, tx, [wallet]);

    expect(sig).toBe("mock-signature-abc123");
    expect(mockState.sentRawTxCount).toBe(1);
    expect(mockState.confirmationPolls).toBe(3); // polls until confirmed
    expect(tx.sign).toHaveBeenCalledWith(wallet);
  }, 10000);

  it("returns the transaction signature on success", async () => {
    const { createCachedConnection, sendAndConfirmPolling } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");
    const tx = makeLegacyTx();

    const sig = await sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }]);

    expect(typeof sig).toBe("string");
    expect(sig.length).toBeGreaterThan(0);
  }, 10000);

  it("throws when the transaction lands on-chain with an error", async () => {
    mockState.txError = { InstructionError: [0, "InvalidAccountData"] };
    const { createCachedConnection, sendAndConfirmPolling } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");
    const tx = makeLegacyTx();

    await expect(sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }])).rejects.toThrow(/failed/i);
    // tx was sent — it landed, just with an error
    expect(mockState.sentRawTxCount).toBe(1);
  }, 10000);

  it("sets recentBlockhash and feePayer on the transaction before signing", async () => {
    const { createCachedConnection, sendAndConfirmPolling } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234", "confirmed");
    const tx = makeLegacyTx();
    const wallet = { publicKey: "my-wallet" };

    await sendAndConfirmPolling(conn, tx, [wallet]);

    expect(tx.recentBlockhash).toBe("11111111111111111111111111111111");
    expect(tx.feePayer).toBe("my-wallet");
  }, 10000);
});
