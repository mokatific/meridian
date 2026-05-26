import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockFs, resetFs, seedFs, readFile, fileExists } from "../helpers/mock-fs.js";

mockFs();

vi.mock("../../logger.js", () => ({ log: vi.fn() }));
vi.mock("../../hivemind.js", () => ({
  getSharedLessonsForPrompt: vi.fn(() => []),
  pushHiveLesson: vi.fn().mockResolvedValue(undefined),
  pushHivePerformanceEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../utils/lessonManager.js", () => ({
  initializeLessonScore: vi.fn((lesson) => lesson),
  applyPerformanceFeedback: vi.fn(),
  pruneLessons: vi.fn(),
  runMaintenance: vi.fn(),
}));

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const USER_CONFIG_PATH = path.join(REPO_ROOT, "user-config.json");

let evolveThresholds;
let addLesson;
let listLessons;
let pinLesson;
let unpinLesson;
let getPerformanceSummary;

beforeEach(async () => {
  resetFs();
  seedFs({ "./lessons.json": JSON.stringify({ lessons: [], performance: [] }) });
  vi.resetModules();
  ({ evolveThresholds, addLesson, listLessons, pinLesson, unpinLesson, getPerformanceSummary } =
    await import("../../lessons.js"));
});

function makeConfig(overrides = {}) {
  return {
    screening: {
      maxVolatility: 10,
      minFeeActiveTvlRatio: 0.06,
      minOrganic: 60,
      ...overrides,
    },
  };
}

function perf(over) {
  return {
    pool: "POOL",
    pool_name: "X-SOL",
    pnl_pct: 0,
    volatility: 5,
    fee_tvl_ratio: 0.5,
    organic_score: 70,
    ...over,
  };
}

describe("evolveThresholds — guards", () => {
  it("returns null when perfData is below MIN_EVOLVE_POSITIONS (5)", () => {
    const out = evolveThresholds([perf({ pnl_pct: 10 }), perf({ pnl_pct: 12 })], makeConfig());
    expect(out).toBeNull();
  });

  it("returns null when no win/loss signal (all flat)", () => {
    const data = Array.from({ length: 6 }, () => perf({ pnl_pct: 0 }));
    expect(evolveThresholds(data, makeConfig())).toBeNull();
  });

  it("returns empty changes object when signal present but no threshold moves", () => {
    // 5 winners that all match current thresholds — nothing to tighten or loosen
    const data = Array.from({ length: 5 }, () =>
      perf({ pnl_pct: 5, volatility: 5, fee_tvl_ratio: 0.06, organic_score: 70 }),
    );
    const out = evolveThresholds(data, makeConfig());
    expect(out).toEqual({ changes: {}, rationale: {} });
  });
});

describe("evolveThresholds — maxVolatility tightening", () => {
  it("tightens maxVolatility when losers cluster at lower vol than the cap", () => {
    const losers = Array.from({ length: 4 }, () => perf({ pnl_pct: -20, volatility: 4 }));
    const winners = [perf({ pnl_pct: 10, volatility: 3 })];
    const config = makeConfig({ maxVolatility: 10 });
    const out = evolveThresholds([...losers, ...winners], config);

    expect(out.changes.maxVolatility).toBeDefined();
    expect(out.changes.maxVolatility).toBeLessThan(10);
    expect(config.screening.maxVolatility).toBe(out.changes.maxVolatility);
    expect(out.rationale.maxVolatility).toMatch(/tightened/);
  });

  it("loosens maxVolatility when all winners, no losers, high winner vols", () => {
    const winners = Array.from({ length: 5 }, () => perf({ pnl_pct: 10, volatility: 8 }));
    const config = makeConfig({ maxVolatility: 5 });
    const out = evolveThresholds(winners, config);
    expect(out.changes.maxVolatility).toBeGreaterThan(5);
    expect(out.rationale.maxVolatility).toMatch(/loosened/);
  });

  it("respects MAX_CHANGE_PER_STEP (20% max move per call)", () => {
    const losers = Array.from({ length: 5 }, () => perf({ pnl_pct: -20, volatility: 0.5 }));
    const config = makeConfig({ maxVolatility: 10 });
    evolveThresholds(losers, config);
    // Most we can move is 20% down = from 10 to 8
    expect(config.screening.maxVolatility).toBeGreaterThanOrEqual(8);
  });
});

describe("evolveThresholds — minFeeActiveTvlRatio", () => {
  it("raises floor when winners' min fee_tvl is comfortably above current", () => {
    const winners = Array.from({ length: 5 }, () => perf({ pnl_pct: 10, fee_tvl_ratio: 0.5 }));
    const config = makeConfig({ minFeeActiveTvlRatio: 0.06 });
    const out = evolveThresholds(winners, config);
    expect(out.changes.minFeeActiveTvlRatio).toBeGreaterThan(0.06);
  });

  it("does not lower the floor", () => {
    const winners = [perf({ pnl_pct: 10, fee_tvl_ratio: 0.5 })];
    const losers = Array.from({ length: 4 }, () => perf({ pnl_pct: -20, fee_tvl_ratio: 0.5 }));
    const config = makeConfig({ minFeeActiveTvlRatio: 1.0 });
    const out = evolveThresholds([...winners, ...losers], config);
    if (out.changes.minFeeActiveTvlRatio != null) {
      expect(out.changes.minFeeActiveTvlRatio).toBeGreaterThanOrEqual(1.0);
    }
  });
});

describe("evolveThresholds — minOrganic", () => {
  it("raises minOrganic when winners are clearly more organic than losers", () => {
    const winners = Array.from({ length: 3 }, () => perf({ pnl_pct: 10, organic_score: 85 }));
    const losers = Array.from({ length: 3 }, () => perf({ pnl_pct: -20, organic_score: 60 }));
    const config = makeConfig({ minOrganic: 60 });
    const out = evolveThresholds([...winners, ...losers], config);
    expect(out.changes.minOrganic).toBeGreaterThan(60);
  });

  it("clamps minOrganic at 90 (upper bound)", () => {
    const winners = Array.from({ length: 5 }, () => perf({ pnl_pct: 50, organic_score: 99 }));
    const losers = Array.from({ length: 3 }, () => perf({ pnl_pct: -30, organic_score: 50 }));
    const config = makeConfig({ minOrganic: 88 });
    evolveThresholds([...winners, ...losers], config);
    expect(config.screening.minOrganic).toBeLessThanOrEqual(90);
  });
});

describe("evolveThresholds — persistence", () => {
  it("writes changes to user-config.json", () => {
    seedFs({ [USER_CONFIG_PATH]: JSON.stringify({ minTvl: 10_000 }) });
    const losers = Array.from({ length: 4 }, () => perf({ pnl_pct: -20, volatility: 3 }));
    const winners = [perf({ pnl_pct: 10, volatility: 2 })];
    const config = makeConfig({ maxVolatility: 10 });
    const out = evolveThresholds([...losers, ...winners], config);

    expect(fileExists(USER_CONFIG_PATH)).toBe(true);
    const written = JSON.parse(readFile(USER_CONFIG_PATH));
    expect(written.minTvl).toBe(10_000); // preserved
    expect(written.maxVolatility).toBe(out.changes.maxVolatility); // merged
    expect(written._lastEvolved).toBeDefined();
    expect(written._positionsAtEvolution).toBe(5);
  });

  it("creates user-config.json when it does not exist", () => {
    const losers = Array.from({ length: 4 }, () => perf({ pnl_pct: -20, volatility: 3 }));
    const winners = [perf({ pnl_pct: 10, volatility: 2 })];
    const config = makeConfig({ maxVolatility: 10 });
    evolveThresholds([...losers, ...winners], config);
    expect(fileExists(USER_CONFIG_PATH)).toBe(true);
  });

  it("appends an [AUTO-EVOLVED] lesson", () => {
    const losers = Array.from({ length: 4 }, () => perf({ pnl_pct: -20, volatility: 3 }));
    const winners = [perf({ pnl_pct: 10, volatility: 2 })];
    const config = makeConfig({ maxVolatility: 10 });
    evolveThresholds([...losers, ...winners], config);

    const lessons = JSON.parse(readFile("./lessons.json")).lessons;
    expect(lessons.some((l) => l.rule.includes("AUTO-EVOLVED"))).toBe(true);
    expect(lessons.some((l) => l.tags?.includes("evolution"))).toBe(true);
  });
});

describe("addLesson + pinLesson + unpinLesson", () => {
  it("appends a manual lesson with sanitized rule text", () => {
    addLesson("  hold on  out-of-range  ", ["heuristic"]);
    const data = JSON.parse(readFile("./lessons.json"));
    expect(data.lessons).toHaveLength(1);
    expect(data.lessons[0].rule).toBe("hold on out-of-range");
    expect(data.lessons[0].outcome).toBe("manual");
  });

  it("skips empty/null rule text", () => {
    addLesson("", []);
    addLesson(null, []);
    const data = JSON.parse(readFile("./lessons.json"));
    expect(data.lessons).toHaveLength(0);
  });

  it("respects pinned and role options", () => {
    addLesson("be patient", ["heuristic"], { pinned: true, role: "MANAGER" });
    const data = JSON.parse(readFile("./lessons.json"));
    expect(data.lessons[0].pinned).toBe(true);
    expect(data.lessons[0].role).toBe("MANAGER");
  });

  it("pinLesson flips a lesson's pinned flag", () => {
    addLesson("rule A", []);
    const data = JSON.parse(readFile("./lessons.json"));
    const id = data.lessons[0].id;

    const result = pinLesson(id);
    expect(result).toMatchObject({ found: true, pinned: true, id });
    expect(JSON.parse(readFile("./lessons.json")).lessons[0].pinned).toBe(true);

    const unpinned = unpinLesson(id);
    expect(unpinned).toMatchObject({ found: true, pinned: false, id });
  });

  it("pinLesson returns found:false for unknown id", () => {
    expect(pinLesson(999999)).toEqual({ found: false });
  });
});

describe("listLessons", () => {
  it("filters by pinned and role", () => {
    addLesson("global", ["x"]);
    addLesson("screener-only", ["x"], { role: "SCREENER" });
    addLesson("pinned one", ["x"], { pinned: true });

    const screener = listLessons({ role: "SCREENER" });
    // SCREENER role: lessons with role=null (any) OR role=SCREENER
    expect(screener.lessons.some((l) => l.rule === "screener-only")).toBe(true);

    const pinned = listLessons({ pinned: true });
    expect(pinned.total).toBe(1);
    expect(pinned.lessons[0].rule).toBe("pinned one");
  });
});

describe("getPerformanceSummary", () => {
  it("returns null when no data", () => {
    expect(getPerformanceSummary()).toBeNull();
  });

  it("computes win-rate and totals over recent positions", () => {
    seedFs({
      "./lessons.json": JSON.stringify({
        lessons: [],
        performance: [
          { pnl_usd: 5, pnl_pct: 10, fees_earned_usd: 5, range_efficiency: 80 },
          { pnl_usd: -2, pnl_pct: -8, fees_earned_usd: 2, range_efficiency: 60 },
          { pnl_usd: 12, pnl_pct: 20, fees_earned_usd: 12, range_efficiency: 90 },
        ],
      }),
    });
    const summary = getPerformanceSummary({ mode: "all" });
    expect(summary).toBeDefined();
    expect(summary.total_positions_closed).toBe(3);
    expect(summary.win_rate_pct).toBeGreaterThan(0);
    expect(summary.win_rate_pct).toBeLessThanOrEqual(100);
  });
});
