import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockFs, resetFs, seedFs, readFile, fileExists } from "../helpers/mock-fs.js";

mockFs();

let consoleSpy;
let log;
let logAction;

beforeEach(async () => {
  resetFs();
  seedFs({ "./logs/.keep": "" });
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-15T08:30:00.000Z"));

  // Reset module state so the LOG_DIR mkdir at import time runs against fresh memfs
  vi.resetModules();
  process.env.LOG_LEVEL = "info";
  ({ log, logAction } = await import("../../logger.js"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("log()", () => {
  it("writes a timestamped line to the daily log file", () => {
    log("agent", "hello world");
    const path = "./logs/agent-2026-03-15.log";
    expect(fileExists(path)).toBe(true);
    const content = readFile(path);
    expect(content).toBe("[2026-03-15T08:30:00.000Z] [AGENT] hello world\n");
  });

  it("writes to console without the ISO timestamp", () => {
    log("rpc-retry", "backing off");
    expect(consoleSpy).toHaveBeenCalledWith("[RPC-RETRY] backing off");
  });

  it("infers level=error from category containing 'error'", async () => {
    process.env.LOG_LEVEL = "error";
    vi.resetModules();
    const { log: logErr } = await import("../../logger.js");

    logErr("agent_error", "boom");
    expect(consoleSpy).toHaveBeenCalledWith("[AGENT_ERROR] boom");

    consoleSpy.mockClear();
    logErr("info", "nope"); // below threshold
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("infers level=warn from category containing 'warn' and respects LOG_LEVEL", async () => {
    process.env.LOG_LEVEL = "warn";
    vi.resetModules();
    const { log: logWarn } = await import("../../logger.js");

    logWarn("config_warn", "drift");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockClear();
    logWarn("agent", "infomsg"); // info < warn → suppressed
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("rotates the file path by UTC date", () => {
    log("a", "day 1");
    vi.setSystemTime(new Date("2026-03-16T00:00:01.000Z"));
    log("a", "day 2");
    expect(fileExists("./logs/agent-2026-03-15.log")).toBe(true);
    expect(fileExists("./logs/agent-2026-03-16.log")).toBe(true);
  });
});

describe("logAction()", () => {
  it("writes JSONL audit entry and a compact console line", () => {
    logAction({
      tool: "deploy_position",
      success: true,
      duration_ms: 412,
      args: { pool_name: "BONK-SOL", amount_sol: 0.5 },
      result: {},
    });

    const path = "./logs/actions-2026-03-15.jsonl";
    expect(fileExists(path)).toBe(true);
    const lines = readFile(path).trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.tool).toBe("deploy_position");
    expect(entry.success).toBe(true);
    expect(entry.timestamp).toBe("2026-03-15T08:30:00.000Z");
  });

  it("formats deploy_position hint with pool name + amount", () => {
    logAction({
      tool: "deploy_position",
      success: true,
      args: { pool_name: "FOO-SOL", amount_y: 1.25 },
      result: {},
    });
    expect(consoleSpy).toHaveBeenCalledWith("[deploy_position] ✓ FOO-SOL 1.25 SOL");
  });

  it("formats close_position hint with PnL when present", () => {
    logAction({
      tool: "close_position",
      success: true,
      args: { position_address: "ABCDEFGHIJKL" },
      result: { pnl_usd: 12.34, pnl_pct: 5.6 },
    });
    expect(consoleSpy).toHaveBeenCalledWith("[close_position] ✓ ABCDEFGH | PnL $+12.34 (5.6%)");
  });

  it("uses ✗ for failed actions", () => {
    logAction({ tool: "get_active_bin", success: false, result: {} });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("✗"));
  });

  it("appends duration when duration_ms provided", () => {
    logAction({ tool: "add_lesson", success: true, duration_ms: 87, result: {} });
    expect(consoleSpy).toHaveBeenCalledWith("[add_lesson] ✓ saved (87ms)");
  });

  it("appends multiple JSONL lines on repeated calls", () => {
    logAction({ tool: "claim_fees", success: true, args: {}, result: {} });
    logAction({ tool: "claim_fees", success: true, args: {}, result: {} });
    const lines = readFile("./logs/actions-2026-03-15.jsonl").trim().split("\n");
    expect(lines).toHaveLength(2);
  });
});
