import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockFs, resetFs, seedFs } from "../helpers/mock-fs.js";

mockFs();

// USER_CONFIG_PATH is computed inside config.js as path.join(__dirname, "user-config.json")
// where __dirname is resolved from import.meta.url — i.e. the real on-disk path of config.js.
// Compute the same here so we can seed memfs at the matching absolute path.
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const USER_CONFIG_PATH = path.join(REPO_ROOT, "user-config.json");

const originalEnv = { ...process.env };

async function loadConfig(userConfig) {
  resetFs();
  if (userConfig !== undefined) {
    seedFs({ [USER_CONFIG_PATH]: JSON.stringify(userConfig) });
  }
  // clear env keys the module assigns lazily so each test sees a clean slate
  delete process.env.RPC_URL;
  delete process.env.WALLET_PRIVATE_KEY;
  delete process.env.LLM_MODEL;
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_API_KEY;
  delete process.env.DRY_RUN;
  delete process.env.PUBLIC_API_KEY;
  delete process.env.AGENT_MERIDIAN_API_URL;
  vi.resetModules();
  return await import("../../config.js");
}

beforeEach(() => {
  resetFs();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("config defaults (no user-config.json)", () => {
  it("loads sensible defaults when user-config.json is absent", async () => {
    const { config } = await loadConfig(undefined);
    expect(config.dryRun.initialVirtualBalance).toBe(0.65);
    expect(config.risk.maxPositions).toBe(3);
    expect(config.risk.maxDeployAmount).toBe(50);
    expect(config.screening.minTvl).toBe(10_000);
    expect(config.screening.maxTvl).toBe(150_000);
    expect(config.management.deployAmountSol).toBe(0.5);
    expect(config.management.gasReserve).toBe(0.2);
    expect(config.strategy.strategy).toBe("bid_ask");
    expect(config.strategy.minBinsBelow).toBe(35);
    expect(config.strategy.maxBinsBelow).toBe(69);
  });

  it("MIN_SAFE_BINS_BELOW floor is 35", async () => {
    const { MIN_SAFE_BINS_BELOW } = await loadConfig(undefined);
    expect(MIN_SAFE_BINS_BELOW).toBe(35);
  });
});

describe("user-config overrides", () => {
  it("applies user values over defaults", async () => {
    const { config } = await loadConfig({
      preset: "main",
      maxPositions: 1,
      deployAmountSol: 0.3,
      maxDeployAmount: 0.55,
      gasReserve: 0.1,
      positionSizePct: 0.8,
      minTvl: 15_000,
      maxTvl: 120_000,
      maxVolatility: 6,
    });
    expect(config.risk.maxPositions).toBe(1);
    expect(config.risk.maxDeployAmount).toBe(0.55);
    expect(config.management.deployAmountSol).toBe(0.3);
    expect(config.management.gasReserve).toBe(0.1);
    expect(config.management.positionSizePct).toBe(0.8);
    expect(config.screening.minTvl).toBe(15_000);
    expect(config.screening.maxTvl).toBe(120_000);
    expect(config.screening.maxVolatility).toBe(6);
    expect(config.screening.tokenAgeSweetMinHours).toBe(12);
    expect(config.screening.tokenAgeSweetMaxHours).toBe(48);
    expect(config.screening.surfaceTokenAge).toBe(true);
  });

  it("keeps surfaceTokenAge disabled unless preset is main", async () => {
    const { config } = await loadConfig({ preset: "evil-panda" });
    expect(config.screening.surfaceTokenAge).toBe(false);
  });

  it("preserves explicit zero values (does not fall through to default)", async () => {
    const { config } = await loadConfig({ minVolume: 0 });
    expect(config.screening.minVolume).toBe(0);
  });

  it("supports legacy emergencyPriceDropPct -> stopLossPct fallback", async () => {
    const { config } = await loadConfig({ emergencyPriceDropPct: -25 });
    expect(config.management.stopLossPct).toBe(-25);
  });

  it("prefers stopLossPct when both legacy and new keys present", async () => {
    const { config } = await loadConfig({
      stopLossPct: -15,
      emergencyPriceDropPct: -99,
    });
    expect(config.management.stopLossPct).toBe(-15);
  });

  it("writes selected user values to process.env when env is unset", async () => {
    const { config: _ } = await loadConfig({
      rpcUrl: "https://my-rpc.example.com",
      llmModel: "deepseek-v4-pro",
      dryRun: true,
    });
    expect(process.env.RPC_URL).toBe("https://my-rpc.example.com");
    expect(process.env.LLM_MODEL).toBe("deepseek-v4-pro");
    expect(process.env.DRY_RUN).toBe("true");
  });

  it("does NOT overwrite already-set env vars", async () => {
    // The loadConfig helper would delete RPC_URL — bypass it so the env var survives.
    resetFs();
    seedFs({
      [USER_CONFIG_PATH]: JSON.stringify({ rpcUrl: "https://from-user.example.com" }),
    });
    delete process.env.WALLET_PRIVATE_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.DRY_RUN;
    delete process.env.PUBLIC_API_KEY;
    delete process.env.AGENT_MERIDIAN_API_URL;
    process.env.RPC_URL = "https://from-env.example.com";
    vi.resetModules();
    await import("../../config.js");
    expect(process.env.RPC_URL).toBe("https://from-env.example.com");
  });
});

describe("strategy bins-below clamping", () => {
  it("clamps minBinsBelow up to MIN_SAFE_BINS_BELOW", async () => {
    const { config } = await loadConfig({ minBinsBelow: 10, maxBinsBelow: 50 });
    expect(config.strategy.minBinsBelow).toBe(35);
    expect(config.strategy.maxBinsBelow).toBe(50);
  });

  it("clamps maxBinsBelow up to minBinsBelow", async () => {
    const { config } = await loadConfig({ minBinsBelow: 60, maxBinsBelow: 40 });
    expect(config.strategy.minBinsBelow).toBe(60);
    expect(config.strategy.maxBinsBelow).toBe(60);
  });

  it("falls back to legacy binsBelow when min/max not provided", async () => {
    const { config } = await loadConfig({ binsBelow: 50 });
    expect(config.strategy.maxBinsBelow).toBe(50);
    expect(config.strategy.defaultBinsBelow).toBe(50);
  });

  it("clamps defaultBinsBelow into the [min,max] range", async () => {
    const { config } = await loadConfig({
      minBinsBelow: 40,
      maxBinsBelow: 60,
      defaultBinsBelow: 200,
    });
    expect(config.strategy.defaultBinsBelow).toBe(60);
  });
});

describe("computeDeployAmount", () => {
  it("returns the floor when wallet is small", async () => {
    const { computeDeployAmount } = await loadConfig({
      gasReserve: 0.2,
      positionSizePct: 0.35,
      deployAmountSol: 0.5,
      maxDeployAmount: 50,
    });
    expect(computeDeployAmount(0.8)).toBe(0.5); // (0.8-0.2)*0.35=0.21 → clamped up to floor
  });

  it("scales linearly between floor and ceiling", async () => {
    const { computeDeployAmount } = await loadConfig({
      gasReserve: 0.2,
      positionSizePct: 0.35,
      deployAmountSol: 0.5,
      maxDeployAmount: 50,
    });
    expect(computeDeployAmount(3.0)).toBe(0.98); // (3.0-0.2)*0.35=0.98
    expect(computeDeployAmount(4.0)).toBe(1.33);
  });

  it("respects the ceiling", async () => {
    const { computeDeployAmount } = await loadConfig({
      gasReserve: 0.2,
      positionSizePct: 0.5,
      deployAmountSol: 0.5,
      maxDeployAmount: 1.0,
    });
    expect(computeDeployAmount(100)).toBe(1.0);
  });

  it("returns the floor when wallet < gasReserve (deployable=0)", async () => {
    const { computeDeployAmount } = await loadConfig({
      gasReserve: 0.5,
      positionSizePct: 0.35,
      deployAmountSol: 0.3,
      maxDeployAmount: 1.0,
    });
    expect(computeDeployAmount(0.1)).toBe(0.3);
  });

  it("uses 0.7 SOL tuned config sensibly", async () => {
    const { computeDeployAmount } = await loadConfig({
      gasReserve: 0.1,
      positionSizePct: 0.8,
      deployAmountSol: 0.3,
      maxDeployAmount: 0.55,
    });
    // (0.7 - 0.1) * 0.8 = 0.48 → in [0.3, 0.55]
    expect(computeDeployAmount(0.7)).toBe(0.48);
  });
});

describe("reloadScreeningThresholds", () => {
  it("applies updated screening keys from disk to the in-memory config", async () => {
    const { config, reloadScreeningThresholds } = await loadConfig({
      minTvl: 10_000,
      maxVolatility: 8,
      minOrganic: 60,
    });
    expect(config.screening.minTvl).toBe(10_000);

    // Rewrite the file with new values
    seedFs({
      [USER_CONFIG_PATH]: JSON.stringify({
        minTvl: 25_000,
        maxVolatility: 4,
        minOrganic: 75,
      }),
    });
    reloadScreeningThresholds();

    expect(config.screening.minTvl).toBe(25_000);
    expect(config.screening.maxVolatility).toBe(4);
    expect(config.screening.minOrganic).toBe(75);
  });

  it("is a no-op when user-config.json is missing", async () => {
    const { config, reloadScreeningThresholds } = await loadConfig({ minTvl: 10_000 });
    const before = config.screening.minTvl;
    resetFs(); // delete the file
    expect(() => reloadScreeningThresholds()).not.toThrow();
    expect(config.screening.minTvl).toBe(before);
  });

  it("evolves strategy.minBinsBelow respecting MIN_SAFE_BINS_BELOW", async () => {
    const { config, reloadScreeningThresholds } = await loadConfig({
      minBinsBelow: 35,
      maxBinsBelow: 60,
    });
    seedFs({
      [USER_CONFIG_PATH]: JSON.stringify({ minBinsBelow: 20, maxBinsBelow: 50 }),
    });
    reloadScreeningThresholds();
    expect(config.strategy.minBinsBelow).toBe(35); // clamped up
    expect(config.strategy.maxBinsBelow).toBe(50);
  });
});

describe("hiveMind defaults", () => {
  it("falls back to built-in defaults when keys are empty", async () => {
    const { config } = await loadConfig({});
    expect(config.hiveMind.url).toBe("https://api.agentmeridian.xyz");
    expect(typeof config.hiveMind.apiKey).toBe("string");
    expect(config.hiveMind.apiKey.length).toBeGreaterThan(0);
  });

  it("uses user-supplied URL when non-empty", async () => {
    const { config } = await loadConfig({ hiveMindUrl: "https://custom.example.com" });
    expect(config.hiveMind.url).toBe("https://custom.example.com");
  });
});
