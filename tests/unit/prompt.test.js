import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config.js", () => ({
  config: {
    screening: {
      timeframe: "5m",
      minTokenFeesSol: 30,
      maxTop10Pct: 60,
      maxInsidersPct: 10,
      maxPhishingPct: 30,
      minBluechipPct: 0.5,
      maxFreshWalletsPct: 40,
      maxBundlersPct: 60,
      minTokenAgeHours: null,
      minMcap: 150000,
      minBinStep: 80,
      maxBinStep: 125,
    },
    management: {
      stopLossPct: -50,
      positionSizePct: 0.35,
      deployAmountSol: 0.5,
      maxDeployAmount: 50,
    },
    risk: { maxPositions: 3 },
    strategy: {
      strategy: "bid_ask",
      minBinsBelow: 35,
      maxBinsBelow: 69,
    },
    schedule: {},
  },
}));

const { buildSystemPrompt } = await import("../../prompt.js");

const portfolio = { sol: 1.2, tokens: [] };
const positions = [];

describe("buildSystemPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });

  describe("MANAGER role", () => {
    it("returns the lean MANAGER prompt with portfolio JSON inline", () => {
      const out = buildSystemPrompt("MANAGER", portfolio, positions);
      expect(out).toContain("Role: MANAGER");
      expect(out).toContain('Portfolio: {"sol":1.2,"tokens":[]}');
      expect(out).toContain("PATIENCE IS PROFIT");
      expect(out).toContain("Timestamp: 2026-01-15T12:00:00.000Z");
    });

    it("omits LESSONS LEARNED block when lessons is null/empty", () => {
      const out = buildSystemPrompt("MANAGER", portfolio, positions, null, null);
      expect(out).not.toContain("LESSONS LEARNED");
    });

    it("includes LESSONS LEARNED block when lessons string provided", () => {
      const out = buildSystemPrompt("MANAGER", portfolio, positions, null, "lesson #1: hold");
      expect(out).toContain("LESSONS LEARNED:\nlesson #1: hold");
    });
  });

  describe("SCREENER role", () => {
    it("renders Evil Panda screening prompt with thresholds from config", () => {
      const out = buildSystemPrompt("SCREENER", portfolio, positions);
      expect(out).toContain("Role: SCREENER");
      expect(out).toContain("EVIL PANDA STRATEGY");
      // Threshold interpolation
      expect(out).toContain("fees_sol < 30");
      expect(out).toContain("top10 > 60%");
      expect(out).toContain("MC < 150000");
      expect(out).toContain('Strategy: Always use "bid_ask"');
      expect(out).toContain("Bin steps must be [80-125]");
    });

    it("uses default '24h' when minTokenAgeHours is null", () => {
      const out = buildSystemPrompt("SCREENER", portfolio, positions);
      expect(out).toContain("coin age < 24h");
    });

    it("includes weightsSummary when provided", () => {
      const out = buildSystemPrompt(
        "SCREENER",
        portfolio,
        positions,
        null,
        null,
        null,
        "Signal weights: organic=1.2",
      );
      expect(out).toContain("Signal weights: organic=1.2");
    });
  });

  describe("GENERAL role", () => {
    it("renders the base prompt + GENERAL override section", () => {
      const out = buildSystemPrompt("GENERAL", portfolio, positions);
      expect(out).toContain("Role: GENERAL");
      expect(out).toContain("OVERRIDE RULE");
      expect(out).toContain("SWAP AFTER CLOSE");
      expect(out).toContain("Timestamp: 2026-01-15T12:00:00.000Z");
    });

    it("always includes Performance section with appropriate fallback content", () => {
      const withPerf = buildSystemPrompt("GENERAL", portfolio, positions, null, null, {
        win_rate: 0.6,
      });
      expect(withPerf).toContain("Performance:");
      expect(withPerf).toContain('"win_rate": 0.6');

      const noPerf = buildSystemPrompt("GENERAL", portfolio, positions, null, null, {});
      expect(noPerf).toContain("Performance:");
      expect(noPerf).toContain("Performance: {}");

      const emptyArr = buildSystemPrompt("GENERAL", portfolio, positions, null, null, []);
      expect(emptyArr).toContain("Performance:");
      expect(emptyArr).toContain("Performance: []");

      const nullPerf = buildSystemPrompt("GENERAL", portfolio, positions, null, null, null);
      expect(nullPerf).toContain("Performance: No closed positions yet");
    });

    it("includes RECENT DECISIONS section only when decisionSummary provided", () => {
      const withDec = buildSystemPrompt(
        "GENERAL",
        portfolio,
        positions,
        null,
        null,
        null,
        null,
        "1. closed pool A",
      );
      expect(withDec).toContain("RECENT DECISIONS");
      expect(withDec).toContain("1. closed pool A");

      const noDec = buildSystemPrompt("GENERAL", portfolio, positions);
      expect(noDec).not.toContain("RECENT DECISIONS");
    });
  });

  it("defaults to GENERAL when agentType is falsy", () => {
    const out = buildSystemPrompt(null, portfolio, positions);
    expect(out).toContain("Role: GENERAL");
  });

  describe("prompt size sanity", () => {
    it("SCREENER prompt stays under a reasonable size budget", () => {
      const out = buildSystemPrompt(
        "SCREENER",
        { sol: 0.00194 },
        { total_positions: 0, positions: [] },
        null,
        null,
        null,
        null,
        null,
      );
      // ~prompt budget: must fit inside provider token windows alongside tool defs
      expect(out.length).toBeGreaterThan(100);
      expect(out.length).toBeLessThan(20_000);
    });

    it("MANAGER prompt stays under a reasonable size budget", () => {
      const out = buildSystemPrompt("MANAGER", portfolio, positions);
      expect(out.length).toBeGreaterThan(100);
      expect(out.length).toBeLessThan(20_000);
    });
  });
});
