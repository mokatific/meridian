import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockFs, resetFs, seedFs, readFile } from "../helpers/mock-fs.js";

mockFs();

vi.mock("../../logger.js", () => ({
  log: vi.fn(),
}));

let classifyTokenAgeBucket;
let recalculateWeights;
let getWeightsSummary;

beforeEach(async () => {
  resetFs();
  seedFs({ "./logs/.keep": "" });
  vi.resetModules();
  ({ classifyTokenAgeBucket, recalculateWeights, getWeightsSummary } =
    await import("../../signal-weights.js"));
});

function perfRecord(bucket, win, idx) {
  return {
    recorded_at: `2026-05-01T00:${String(idx).padStart(2, "0")}:00.000Z`,
    pnl_usd: win ? 1.0 : -1.0,
    fees_earned_usd: 0,
    signal_snapshot: {
      token_age_bucket: bucket,
    },
  };
}

describe("classifyTokenAgeBucket", () => {
  it("maps age hours into young, sweet, and mature buckets", () => {
    const cfg = { screening: { tokenAgeSweetMinHours: 12, tokenAgeSweetMaxHours: 48 } };
    expect(classifyTokenAgeBucket(2, cfg)).toBe("young");
    expect(classifyTokenAgeBucket(12, cfg)).toBe("sweet");
    expect(classifyTokenAgeBucket(48, cfg)).toBe("sweet");
    expect(classifyTokenAgeBucket(49, cfg)).toBe("mature");
  });
});

describe("recalculateWeights token_age_bucket", () => {
  it("learns different per-bucket weights from outcomes", () => {
    const perfData = [
      perfRecord("young", true, 0),
      perfRecord("young", false, 1),
      perfRecord("young", false, 2),
      perfRecord("young", false, 3),
      perfRecord("young", false, 4),
      perfRecord("sweet", true, 5),
      perfRecord("sweet", true, 6),
      perfRecord("sweet", true, 7),
      perfRecord("sweet", true, 8),
      perfRecord("sweet", false, 9),
      perfRecord("mature", true, 10),
      perfRecord("mature", true, 11),
      perfRecord("mature", false, 12),
      perfRecord("mature", false, 13),
      perfRecord("mature", false, 14),
    ];

    const result = recalculateWeights(perfData, {
      darwin: {
        windowDays: 60,
        minSamples: 5,
        boostFactor: 1.05,
        decayFactor: 0.95,
        weightFloor: 0.3,
        weightCeiling: 2.5,
      },
    });

    expect(result.changes.some((c) => c.signal === "token_age_bucket")).toBe(true);

    const data = JSON.parse(readFile("./signal-weights.json"));
    expect(data.weights.token_age_bucket.young).toBeLessThan(data.weights.token_age_bucket.mature);
    expect(data.weights.token_age_bucket.mature).toBeLessThan(data.weights.token_age_bucket.sweet);
    expect(data.weights.token_age_bucket.sweet).toBeGreaterThan(1);

    const summary = getWeightsSummary();
    expect(summary).toContain("token_age_bucket (categorical)");
    expect(summary).toContain("young");
    expect(summary).toContain("sweet");
    expect(summary).toContain("mature");
  });
});
