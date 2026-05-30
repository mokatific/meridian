import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockFs, resetFs, seedFs, readFile } from "../helpers/mock-fs.js";

mockFs();

vi.mock("../../logger.js", () => ({
  log: vi.fn(),
}));

let runCausalAnalysis;

beforeEach(async () => {
  resetFs();
  seedFs({
    "./lessons.json": JSON.stringify({ lessons: [], performance: [] }),
    "./causal-analysis.json": JSON.stringify({ runs: [], last_run: null }),
  });
  vi.resetModules();
  ({ runCausalAnalysis } = await import("../../causal-analysis.js"));
});

function record(tokenAgeHours, win, idx) {
  return {
    recorded_at: `2026-05-01T00:${String(idx).padStart(2, "0")}:00.000Z`,
    pnl_usd: win ? 10 : -10,
    pnl_pct: win ? 10 : -10,
    fees_earned_usd: 0,
    token_age_hours: tokenAgeHours,
    signal_snapshot: {
      token_age_hours: tokenAgeHours,
    },
  };
}

describe("runCausalAnalysis token age", () => {
  it("recommends surfacing the 12-48h sweet spot", () => {
    const perfData = [
      record(2, false, 0),
      record(3, false, 1),
      record(4, false, 2),
      record(5, false, 3),
      record(6, false, 4),
      record(18, true, 5),
      record(24, true, 6),
      record(30, true, 7),
      record(36, true, 8),
      record(42, true, 9),
      record(72, false, 10),
      record(84, false, 11),
      record(96, false, 12),
      record(108, false, 13),
      record(120, false, 14),
    ];

    const result = runCausalAnalysis(perfData);

    expect(result.recommendations.some((r) => r.insight.includes("sweet (12-48h)"))).toBe(true);
    expect(result.recommendations.some((r) => r.action.includes("12-48h tokens"))).toBe(true);

    const lessons = JSON.parse(readFile("./lessons.json")).lessons;
    expect(lessons).toHaveLength(1);
    expect(lessons[0].config_suggestion).toEqual({
      surfaceTokenAge: true,
      tokenAgeSweetMinHours: 12,
      tokenAgeSweetMaxHours: 48,
    });
  });
});
