import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../logger.js", () => ({ log: vi.fn() }));

// ── mock state ────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
  gasMicroLamports: 5_000,
  gasShouldFail: false,
  confirmationPolls: 0,
  sentRawTxCount: 0,
  injectedInstructions: [],
}));

// ── mock gmgn gas ─────────────────────────────────────────────

vi.mock("../../tools/gmgn.js", () => ({
  fetchGmgnGasPrice: async () => {
    if (mockState.gasShouldFail) return null;
    return mockState.gasMicroLamports;
  },
}));

// ── mock @solana/web3.js ─────────────────────────────────────

vi.mock("@solana/web3.js", () => {
  class ComputeBudgetProgram {
    static setComputeUnitPrice({ microLamports }) {
      const ix = { type: "ComputeBudgetSetUnitPrice", microLamports };
      mockState.injectedInstructions.push(ix);
      return ix;
    }
  }

  class Connection {
    constructor(url) {
      this.url = url;
    }
    async getLatestBlockhash() {
      return { blockhash: "testblockhash111", lastValidBlockHeight: 999 };
    }
    async getSignatureStatuses() {
      mockState.confirmationPolls++;
      if (mockState.confirmationPolls >= 2) {
        return { value: [{ confirmationStatus: "confirmed", err: null }] };
      }
      return { value: [null] };
    }
    async getBlockHeight() {
      return 100;
    }
    async sendRawTransaction() {
      mockState.sentRawTxCount++;
      return "mock-sig-gas-test";
    }
  }

  class Transaction {
    constructor() {
      this.instructions = [];
    }
  }

  class VersionedTransaction {
    constructor() {
      this.message = { recentBlockhash: null };
      // no .instructions — distinguishes it from legacy
    }
    sign() {}
    serialize() {
      return Buffer.from("versioned-tx");
    }
  }

  return { Connection, ComputeBudgetProgram, Transaction, VersionedTransaction };
});

// ── helpers ──────────────────────────────────────────────────

function makeLegacyTx() {
  return {
    instructions: [],
    recentBlockhash: null,
    lastValidBlockHeight: null,
    feePayer: null,
    sign: vi.fn(),
    serialize: vi.fn(() => Buffer.from("legacy-tx")),
  };
}

function makeVersionedTx() {
  return {
    message: { recentBlockhash: null },
    // no .instructions field — triggers VersionedTransaction branch
    sign: vi.fn(),
    serialize: vi.fn(() => Buffer.from("versioned-tx")),
  };
}

beforeEach(() => {
  vi.resetModules();
  mockState.gasMicroLamports = 5_000;
  mockState.gasShouldFail = false;
  mockState.confirmationPolls = 0;
  mockState.sentRawTxCount = 0;
  mockState.injectedInstructions = [];
  process.env.RPC_MAX_RETRIES = "3";
  process.env.RPC_RETRY_BASE_MS = "10";
});

// ── tests ────────────────────────────────────────────────────

describe("sendAndConfirmPolling — priority fee injection", () => {
  it("prepends ComputeBudgetSetUnitPrice instruction for legacy transactions", async () => {
    const { sendAndConfirmPolling, createCachedConnection } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234");
    const tx = makeLegacyTx();

    await sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }]);

    expect(mockState.injectedInstructions).toHaveLength(1);
    expect(mockState.injectedInstructions[0].type).toBe("ComputeBudgetSetUnitPrice");
    expect(mockState.injectedInstructions[0].microLamports).toBe(5_000);
    // instruction prepended at index 0
    expect(tx.instructions[0]).toMatchObject({ type: "ComputeBudgetSetUnitPrice" });
  }, 10000);

  it("does NOT inject priority fee for VersionedTransaction (pre-signed by SDK)", async () => {
    const { sendAndConfirmPolling, createCachedConnection } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234");
    const tx = makeVersionedTx();

    await sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }]);

    expect(mockState.injectedInstructions).toHaveLength(0);
  }, 10000);

  it("skips priority fee injection when fetchGmgnGasPrice returns null (fail-open)", async () => {
    mockState.gasShouldFail = true;
    const { sendAndConfirmPolling, createCachedConnection } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234");
    const tx = makeLegacyTx();

    // should not throw — transaction still sent without priority fee
    const sig = await sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }]);

    expect(sig).toBe("mock-sig-gas-test");
    expect(mockState.injectedInstructions).toHaveLength(0);
    expect(tx.instructions).toHaveLength(0);
  }, 10000);

  it("skips injection when opts.skipPriorityFee is true", async () => {
    const { sendAndConfirmPolling, createCachedConnection } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234");
    const tx = makeLegacyTx();

    await sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }], { skipPriorityFee: true });

    expect(mockState.injectedInstructions).toHaveLength(0);
  }, 10000);

  it("still sends the transaction and returns a signature even with priority fee", async () => {
    const { sendAndConfirmPolling, createCachedConnection } =
      await import("../../utils/rpc-cache.js");
    const conn = createCachedConnection("http://127.0.0.1:1234");
    const tx = makeLegacyTx();

    const sig = await sendAndConfirmPolling(conn, tx, [{ publicKey: "pk" }]);

    expect(sig).toBe("mock-sig-gas-test");
    expect(mockState.sentRawTxCount).toBe(1);
  }, 10000);
});
