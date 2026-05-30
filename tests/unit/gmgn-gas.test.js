import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock exec ────────────────────────────────────────────────

const mockExec = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({ exec: mockExec }));
vi.mock("util", () => ({
  promisify: (fn) => {
    // only promisify is called on exec
    return async (...args) => mockExec(...args);
  },
}));

// gmgn.js also imports fs for cache — let it use the real fs (no writes in gas tests)
vi.mock("../../logger.js", () => ({ log: vi.fn() }));

// ── helpers ─────────────────────────────────────────────────

function makeGasResponse(auto = "0.002639036") {
  return {
    stdout: JSON.stringify({
      chain: "sol",
      auto,
      auto_mev: "0.001",
      high: "0.01",
      average: "0.005",
      low: "0.001",
      native_token_usd_price: 81.98,
    }),
    stderr: "",
  };
}

// ── tests ────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  mockExec.mockReset();
});

describe("fetchGmgnGasPrice", () => {
  it("returns microLamports converted from GMGN auto SOL value", async () => {
    mockExec.mockResolvedValue(makeGasResponse("0.002639036"));
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    // 0.002639036 × 1e6 = 2639 microLamports/CU
    expect(result).toBe(2_639);
  });

  it("clamps small values to floor of 1000 microLamports", async () => {
    mockExec.mockResolvedValue(makeGasResponse("0.0000001")); // 0.1 microLamports → floor
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    expect(result).toBe(1_000);
  });

  it("returns a value within [1000, 5_000_000] for normal GMGN responses", async () => {
    mockExec.mockResolvedValue(makeGasResponse("0.005")); // 5000 microLamports/CU
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    expect(result).toBeGreaterThanOrEqual(1_000);
    expect(result).toBeLessThanOrEqual(5_000_000);
    expect(result).toBe(5_000);
  });

  it("returns null when gmgn-cli throws", async () => {
    mockExec.mockRejectedValue(new Error("gmgn-cli not found"));
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    expect(result).toBeNull();
  });

  it("returns null when auto field is missing", async () => {
    mockExec.mockResolvedValue({ stdout: JSON.stringify({ chain: "sol" }), stderr: "" });
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    expect(result).toBeNull();
  });

  it("returns null when stdout is not valid JSON", async () => {
    mockExec.mockResolvedValue({ stdout: "not json", stderr: "" });
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    expect(result).toBeNull();
  });

  it("returns null when auto is zero", async () => {
    mockExec.mockResolvedValue(makeGasResponse("0"));
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const result = await fetchGmgnGasPrice();

    expect(result).toBeNull();
  });

  it("caches result for 30s — does not call exec twice", async () => {
    mockExec.mockResolvedValue(makeGasResponse("0.000005"));
    const { fetchGmgnGasPrice } = await import("../../tools/gmgn.js");

    const first = await fetchGmgnGasPrice();
    const second = await fetchGmgnGasPrice();

    expect(first).toBe(second);
    expect(mockExec).toHaveBeenCalledTimes(1); // cache hit on second call
  });
});
