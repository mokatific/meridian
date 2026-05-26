import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockFs, resetFs, seedFs, readFile, fileExists } from "../helpers/mock-fs.js";

mockFs();

vi.mock("../../logger.js", () => ({
  log: vi.fn(),
}));

let appendDecision;
let getRecentDecisions;
let getDecisionSummary;

beforeEach(async () => {
  resetFs();
  seedFs({ "./logs/.keep": "" });
  vi.resetModules();
  ({ appendDecision, getRecentDecisions, getDecisionSummary } =
    await import("../../decision-log.js"));
});

describe("appendDecision", () => {
  it("creates the file on first append with default metadata", () => {
    const entry = appendDecision({
      type: "deploy",
      actor: "SCREENER",
      pool: "POOL_X",
      pool_name: "FOO-SOL",
      summary: "deployed 0.5 SOL",
    });

    expect(fileExists("./decision-log.json")).toBe(true);
    expect(entry.id).toMatch(/^dec_\d+_[a-z0-9]{6}$/);
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.type).toBe("deploy");
    expect(entry.actor).toBe("SCREENER");
    expect(entry.pool_name).toBe("FOO-SOL");
    expect(entry.summary).toBe("deployed 0.5 SOL");
    expect(entry.risks).toEqual([]);
    expect(entry.rejected).toEqual([]);
  });

  it("defaults type to 'note' and actor to 'GENERAL'", () => {
    const entry = appendDecision({ summary: "ad-hoc note" });
    expect(entry.type).toBe("note");
    expect(entry.actor).toBe("GENERAL");
  });

  it("falls back pool_name to pool when missing", () => {
    const entry = appendDecision({ pool: "POOL_ADDR_VERY_LONG" });
    expect(entry.pool_name).toBe("POOL_ADDR_VERY_LONG");
  });

  it("sanitizes whitespace and trims excessive length", () => {
    const longSummary = "x".repeat(500);
    const entry = appendDecision({
      summary: "  line1\nline2\t  line3  ",
      reason: longSummary,
    });
    expect(entry.summary).toBe("line1 line2 line3");
    expect(entry.reason.length).toBe(500); // reason max is 500
  });

  it("truncates risks to 6 entries and sanitizes each", () => {
    const entry = appendDecision({
      risks: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
    });
    expect(entry.risks).toHaveLength(6);
    expect(entry.risks[0]).toBe("r1");
  });

  it("truncates rejected to 8 entries", () => {
    const entry = appendDecision({
      rejected: Array.from({ length: 12 }, (_, i) => `rej${i}`),
    });
    expect(entry.rejected).toHaveLength(8);
  });

  it("filters out null/empty risks", () => {
    const entry = appendDecision({
      risks: ["ok", "", "  ", null, "also ok"],
    });
    expect(entry.risks).toEqual(["ok", "also ok"]);
  });

  it("prepends new decisions (most recent first)", () => {
    appendDecision({ summary: "first" });
    appendDecision({ summary: "second" });
    appendDecision({ summary: "third" });
    const recent = getRecentDecisions(10);
    expect(recent.map((d) => d.summary)).toEqual(["third", "second", "first"]);
  });

  it("caps the file at MAX_DECISIONS=100", () => {
    for (let i = 0; i < 105; i++) {
      appendDecision({ summary: `dec${i}` });
    }
    const data = JSON.parse(readFile("./decision-log.json"));
    expect(data.decisions).toHaveLength(100);
    // oldest pruned
    expect(data.decisions.find((d) => d.summary === "dec0")).toBeUndefined();
    // newest kept
    expect(data.decisions[0].summary).toBe("dec104");
  });
});

describe("getRecentDecisions", () => {
  it("returns empty array when file missing", () => {
    expect(getRecentDecisions()).toEqual([]);
  });

  it("respects the limit", () => {
    for (let i = 0; i < 5; i++) appendDecision({ summary: `d${i}` });
    expect(getRecentDecisions(2)).toHaveLength(2);
  });

  it("handles corrupted JSON gracefully", () => {
    seedFs({ "./decision-log.json": "not valid json {{" });
    expect(getRecentDecisions()).toEqual([]);
  });
});

describe("getDecisionSummary", () => {
  it("returns the fallback string when log is empty", () => {
    expect(getDecisionSummary()).toBe("No recent structured decisions yet.");
  });

  it("formats summaries as numbered, pipe-delimited lines", () => {
    appendDecision({
      type: "deploy",
      actor: "SCREENER",
      pool_name: "BONK-SOL",
      summary: "deployed",
      reason: "high organic score",
      risks: ["high volatility"],
      rejected: ["pool A: low TVL"],
    });

    const out = getDecisionSummary(5);
    expect(out).toContain("[SCREENER] DEPLOY BONK-SOL");
    expect(out).toContain("summary: deployed");
    expect(out).toContain("reason: high organic score");
    expect(out).toContain("risks: high volatility");
    expect(out).toContain("rejected: pool A: low TVL");
  });

  it("falls back to 'unknown pool' when pool_name and pool are absent", () => {
    appendDecision({ type: "note", summary: "musing" });
    expect(getDecisionSummary()).toContain("unknown pool");
  });
});
