import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockFs, resetFs, seedFs, readFile, fileExists } from "../helpers/mock-fs.js";

mockFs();

vi.mock("../../logger.js", () => ({
  log: vi.fn(),
  logAction: vi.fn(),
}));

vi.mock("../../telegram.js", () => ({
  notifyDeploy: vi.fn(() => Promise.resolve()),
  notifyClose: vi.fn(() => Promise.resolve()),
  notifySwap: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../position-logger.js", () => ({
  initLogger: vi.fn(),
  logPositionOpen: vi.fn(),
  logPositionClose: vi.fn(),
}));

vi.mock("../../config.js", () => ({
  config: {
    screening: {
      timeframe: "1h",
      minTvl: 10_000,
      maxTvl: 150_000,
      minFeeActiveTvlRatio: 0.05,
      minBinStep: 80,
      maxBinStep: 125,
      maxPositiveEntryPriceChangePct: 3,
    },
    risk: { maxPositions: 3 },
    strategy: {
      defaultBinsBelow: 80,
      minBinsBelow: 35,
      maxBinsBelow: 120,
    },
    management: {
      autoSwapAfterClaim: false,
    },
  },
  reloadScreeningThresholds: vi.fn(),
  MIN_SAFE_BINS_BELOW: 35,
}));

vi.mock("../../tools/screening.js", () => ({
  discoverPools: vi.fn(),
  getPoolDetail: vi.fn(),
  getTopCandidates: vi.fn(),
}));

vi.mock("../../tools/dlmm.js", () => ({
  getActiveBin: vi.fn(),
  deployPosition: vi.fn(),
  getMyPositions: vi.fn(async () => ({ total_positions: 0, positions: [] })),
  getWalletPositions: vi.fn(),
  getPositionPnl: vi.fn(),
  claimFees: vi.fn(),
  closePosition: vi.fn(),
  searchPools: vi.fn(),
}));

vi.mock("../../tools/wallet.js", () => ({
  getWalletBalances: vi.fn(),
  swapToken: vi.fn(),
}));

vi.mock("../../tools/study.js", () => ({
  studyTopLPers: vi.fn(),
}));

vi.mock("../../state.js", () => ({
  setPositionInstruction: vi.fn(),
  getTrackedPositions: vi.fn(() => []),
}));

vi.mock("../../pool-memory.js", () => ({
  getPoolMemory: vi.fn(),
  addPoolNote: vi.fn(),
}));

vi.mock("../../strategy-library.js", () => ({
  addStrategy: vi.fn(),
  listStrategies: vi.fn(),
  getStrategy: vi.fn(),
  setActiveStrategy: vi.fn(),
  removeStrategy: vi.fn(),
}));

vi.mock("../../token-blacklist.js", () => ({
  addToBlacklist: vi.fn(),
  removeFromBlacklist: vi.fn(),
  listBlacklist: vi.fn(),
}));

vi.mock("../../dev-blocklist.js", () => ({
  blockDev: vi.fn(),
  unblockDev: vi.fn(),
  listBlockedDevs: vi.fn(),
}));

vi.mock("../../smart-wallets.js", () => ({
  addSmartWallet: vi.fn(),
  removeSmartWallet: vi.fn(),
  listSmartWallets: vi.fn(),
  checkSmartWalletsOnPool: vi.fn(),
}));

vi.mock("../../twitter-wallet.js", () => ({
  discoverWalletsFromKolTweets: vi.fn(),
}));

vi.mock("../../tools/token.js", () => ({
  getTokenInfo: vi.fn(),
  getTokenHolders: vi.fn(),
  getTokenNarrative: vi.fn(),
}));

vi.mock("../../tools/gmgn.js", () => ({
  checkGmgnSignals: vi.fn(),
  checkGmgnExitSignal: vi.fn(),
  screenCycleTokens: vi.fn(),
}));

vi.mock("../../tools/simulator.js", () => ({
  openPaperPositionTool: vi.fn(),
  getPaperPositionTool: vi.fn(),
  closePaperPositionTool: vi.fn(),
  listPaperPositionsTool: vi.fn(),
}));

vi.mock("../../lessons.js", () => ({
  addLesson: vi.fn(),
  clearAllLessons: vi.fn(),
  clearPerformance: vi.fn(),
  removeLessonsByKeyword: vi.fn(),
  getPerformanceHistory: vi.fn(),
  pinLesson: vi.fn(),
  unpinLesson: vi.fn(),
  listLessons: vi.fn(),
  getLessonsForPrompt: vi.fn(() => ""),
  getPerformanceSummary: vi.fn(() => null),
  recordPerformance: vi.fn(),
}));

let executeTool;

beforeEach(async () => {
  resetFs();
  seedFs({ "./logs/.keep": "" });
  process.env.DRY_RUN = "true";
  vi.resetModules();
  ({ executeTool } = await import("../../tools/executor.js"));
});

describe("executeTool deploy_position anti-chase guard", () => {
  it("blocks single-sided SOL deploys when price_change_pct is above threshold and logs a rejection", async () => {
    const result = await executeTool("deploy_position", {
      pool_address: "TEST_POOL_ANTI_CHASE",
      pool_name: "TEST_POOL_ANTI_CHASE",
      amount_y: 0.1,
      bins_below: 80,
      bins_above: 0,
      price_change_pct: 12.5,
    });

    expect(result).toEqual(
      expect.objectContaining({
        blocked: true,
        reason: expect.stringContaining("Recent price change"),
      }),
    );
    expect(fileExists("./decision-log.json")).toBe(true);

    const data = JSON.parse(readFile("./decision-log.json"));
    expect(data.decisions).toHaveLength(1);
    expect(data.decisions[0]).toMatchObject({
      type: "screen_reject",
      actor: "EXECUTOR",
      pool: "TEST_POOL_ANTI_CHASE",
      pool_name: "TEST_POOL_ANTI_CHASE",
      summary: "Anti-chase guard: recent positive price move",
    });
    expect(data.decisions[0].metrics).toMatchObject({
      priceChangePct: 12.5,
      thresholdPct: 3,
    });
  });
});
