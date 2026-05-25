# Meridian — CLAUDE.md

Autonomous DLMM liquidity provider agent for Meteora pools on Solana.

---

## Architecture Overview

```
index.js              Main entry: REPL + cron orchestration + Telegram bot polling
agent.js              ReAct loop (OpenRouter/OpenAI-compatible): LLM → tool call → repeat
config.js             Runtime config from user-config.json + .env; exposes config object
prompt.js             Builds system prompt per agent role (SCREENER / MANAGER / GENERAL)
state.js              Position registry (state.json): tracks bin ranges, OOR timestamps, notes
decision-log.js       Structured decision log (deploy, close, skip, no-deploy) — fed back into prompts
lessons.js            Learning engine: records closed-position perf, derives lessons, evolves thresholds
pool-memory.js        Per-pool deploy history + snapshots (pool-memory.json)
strategy-library.js   Saved LP strategies (strategy-library.json)
paper-positions.js    Live forward-running paper LP positions (paper-positions.json) — ticked every 5m
dry-run-simulator.js  DRY_RUN-mode virtual position tracker used by the management cron
wallet-evolution.js   Auto-discovery + pruning of smart wallets
briefing.js           Daily Telegram briefing (HTML)
telegram.js           Telegram bot: polling, notifications (deploy/close/swap/OOR)
hivemind.js           Agent Meridian HiveMind sync
smart-wallets.js      KOL/alpha wallet tracker (smart-wallets.json)
token-blacklist.js    Permanent token blacklist (token-blacklist.json)
dev-blocklist.js      Blocked deployer wallets (deployer-blacklist.json)
causal-analysis.js    Auto-analysis of WHY closed positions won or lost (causal-analysis.json)
signal-weights.js     Darwin signal-weight learning (signal-weights.json)
skipped-tracker.js    Missed-opportunity tracker (skipped-pools.json)
position-logger.js    Append-only audit trail (position-journal.db, SQLite)
logger.js             Daily-rotating log files + action audit trail
cli.js                CLI surface — each tool exposed as a subcommand with JSON output

tools/
  definitions.js      Tool schemas in OpenAI format (what LLM sees)
  executor.js         Tool dispatch: name → fn, safety checks, pre/post hooks
  dlmm.js             Meteora DLMM SDK wrapper (deploy, close, claim, positions, PnL)
  screening.js        Pool discovery from Meteora API
  wallet.js           SOL/token balances (Helius) + Jupiter swap
  token.js            Token info/holders/narrative (Jupiter API)
  study.js            Top LPer study via LPAgent API
  simulator.js        Thin wrappers over paper-positions.js (open/get/close/list)
  chart-indicators.js RSI/Bollinger/Supertrend/Fibonacci preset evaluation
  agent-meridian.js   Helper for the Agent Meridian relay API
```

---

## Agent Roles & Tool Access

Three agent roles filter which tools the LLM can call:

| Role       | Purpose                       | Key Tools                                                                           |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `SCREENER` | Find and deploy new positions | deploy_position, get_top_candidates, get_token_holders, check_smart_wallets_on_pool |
| `MANAGER`  | Manage open positions         | close_position, claim_fees, swap_token, get_position_pnl, set_position_note         |
| `GENERAL`  | Chat / manual commands        | All tools                                                                           |

Sets defined in `agent.js:6-7`. If you add a tool, also add it to the relevant set(s).

---

## Adding a New Tool

1. **`tools/definitions.js`** — Add OpenAI-format schema object to the `tools` array
2. **`tools/executor.js`** — Add `tool_name: functionImpl` to `toolMap`
3. **`agent.js`** — Add tool name to `MANAGER_TOOLS` and/or `SCREENER_TOOLS` if role-restricted
4. If the tool writes on-chain state, add it to `WRITE_TOOLS` in executor.js for safety checks

---

## Config System

`config.js` loads `user-config.json` at startup. Runtime mutations go through `update_config` tool (executor.js) which:

- Updates the live `config` object immediately
- Persists to `user-config.json`
- Restarts cron jobs if intervals changed

**Valid config keys and their sections:**

| Key                                             | Section    | Default                 |
| ----------------------------------------------- | ---------- | ----------------------- |
| minFeeActiveTvlRatio                            | screening  | 0.05                    |
| minTvl / maxTvl                                 | screening  | 10k / 150k              |
| minVolume                                       | screening  | 500                     |
| minOrganic                                      | screening  | 60                      |
| minHolders                                      | screening  | 500                     |
| minMcap / maxMcap                               | screening  | 150k / 10M              |
| minBinStep / maxBinStep                         | screening  | 80 / 125                |
| timeframe                                       | screening  | "5m"                    |
| category                                        | screening  | "trending"              |
| minTokenFeesSol                                 | screening  | 30                      |
| maxBundlersPct                                  | screening  | 30                      |
| maxTop10Pct                                     | screening  | 60                      |
| blockedLaunchpads                               | screening  | []                      |
| deployAmountSol                                 | management | 0.5                     |
| maxDeployAmount                                 | risk       | 50                      |
| maxPositions                                    | risk       | 3                       |
| gasReserve                                      | management | 0.2                     |
| positionSizePct                                 | management | 0.35                    |
| minSolToOpen                                    | management | 0.55                    |
| outOfRangeWaitMinutes                           | management | 30                      |
| managementIntervalMin                           | schedule   | 10                      |
| screeningIntervalMin                            | schedule   | 30                      |
| managementModel / screeningModel / generalModel | llm        | openrouter/healer-alpha |

**`computeDeployAmount(walletSol)`** — scales position size with wallet balance (compounding). Formula: `clamp(deployable × positionSizePct, floor=deployAmountSol, ceil=maxDeployAmount)`.

---

## Position Lifecycle

1. **Deploy**: `deploy_position` → executor safety checks → `trackPosition()` in state.js → Telegram notify
2. **Monitor**: management cron → `getMyPositions()` → `getPositionPnl()` → OOR detection → pool-memory snapshots
3. **Close**: `close_position` → `recordPerformance()` in lessons.js → auto-swap base token to SOL → Telegram notify
4. **Learn**: `evolveThresholds()` runs on performance data → updates config.screening → persists to user-config.json

---

## Screener Safety Checks (executor.js)

Before `deploy_position` executes:

- `bin_step` must be within `[minBinStep, maxBinStep]`
- `volatility` must be a positive finite number when provided; fresh pool detail with volatility 0/null is rejected
- Total range must be at least `max(35, minBinsBelow)` bins; 1-bin/tiny deploys are refused
- Position count must be below `maxPositions` (force-fresh scan, no cache)
- No duplicate pool allowed (same pool_address)
- No duplicate base token allowed (same base_mint in another pool)
- `amount_x > 0` is rejected. Deploys are single-side SOL only (`amount_y` / `amount_sol`)
- SOL balance must cover `amount_y + gasReserve`
- `blockedLaunchpads` enforced in `getTopCandidates()` before LLM sees candidates

---

## bins_below Calculation (SCREENER)

Linear formula based on positive pool volatility (set in screener prompt, `index.js`):

```
bins_below = round(minBinsBelow + (volatility / 5) * (maxBinsBelow - minBinsBelow)), clamped to [minBinsBelow, maxBinsBelow]
```

- Default clamp is `[35, 69]`
- `volatility <= 0`, null, or non-finite → skip/refuse deploy
- High volatility (5+) → maxBinsBelow
- Any value in between is valid (continuous, not tiered)

---

## Telegram Commands

Handled directly in `index.js` (bypass LLM):

| Command           | Action                                |
| ----------------- | ------------------------------------- |
| `/positions`      | List open positions with progress bar |
| `/close <n>`      | Close position by list index          |
| `/set <n> <note>` | Set note on position by list index    |

Progress bar format: `[████████░░░░░░░░░░░░] 40%` (no bin numbers, no arrows)

---

## Race Condition: Double Deploy

`_screeningLastTriggered` in index.js prevents concurrent screener invocations. Management cycle sets this before triggering screener. Also, `deploy_position` safety check uses `force: true` on `getMyPositions()` for a fresh count.

---

## Cron Jobs (index.js → startCronJobs)

| Cron pattern       | Task               | Purpose                                                                                            |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| `*/managementInt`  | `mgmtTask`         | Run a MANAGER cycle: list positions, claim/close/hold decisions                                    |
| `*/screeningInt`   | `screenTask`       | Run a SCREENER cycle: pull candidates, decide whether to deploy                                    |
| `0 * * * *`        | `healthTask`       | Hourly health-check chat                                                                           |
| `0 1 * * *` (UTC)  | `briefingTask`     | Morning briefing (08:00 UTC+7 = 01:00 UTC)                                                         |
| `0 */6 * * *`      | `briefingWatchdog` | Catch up a missed briefing (process restart, crash)                                                |
| `0 */2 * * *`      | `walletEvoTask`    | Auto-discover and prune smart wallets from top trending pools                                      |
| `*/5 * * * *`      | `paperTickTask`    | Tick every open paper position: fetch new candles, accrue fees, recompute IL (no LLM, no on-chain) |
| `setInterval(30s)` | `pnlPollInterval`  | Lightweight PnL poll for trailing-TP / deterministic close triggers between management cycles      |

All cron tasks are pushed into the module-level `_cronTasks` array and torn down by `stopCronJobs()`. `_managementBusy` / `_screeningBusy` / `_paperTickBusy` flags guard against overlapping runs. Interval crons (`managementIntervalMin`, `screeningIntervalMin`) restart automatically when `update_config` changes their values — handled by `registerCronRestarter()` in executor.js.

---

## Paper Positions (paper-positions.js)

Forward-running simulated LP positions that accrue real fees and IL using GeckoTerminal 5m OHLCV. No on-chain calls. Persisted to `paper-positions.json` so positions survive restarts.

**Files involved**

- `paper-positions.js` — core (open, tick, get, close, list, formatSummary)
- `tools/simulator.js` — thin wrappers + re-exports `tickPaperPositions`
- `tools/definitions.js` — 4 tool schemas: `open_paper_position`, `get_paper_position`, `close_paper_position`, `list_paper_positions`
- `tools/executor.js` — registered in `toolMap`
- `agent.js` — included in `MANAGER_TOOLS` and `SCREENER_TOOLS`
- `index.js` — `*/5 * * * *` cron drives `tickPaperPositions()` each cycle

**Math**

- **Sqrt-price geometry** (Uniswap v3 style): given total deposit value, active price, lower/upper price, compute liquidity `L` and the initial X/Y split. Single-side SOL at `active == upper` is the natural degenerate case (all Y).
- **Price scale normalization**: at open time, fetch one candle close from GeckoTerminal and divide by datapi's `current_price`. Token-decimal differences across feeds can cause ~1000× mismatches. The scale is stored on the position; all bounds are derived in the OHLCV scale so subsequent tick prices compare directly.
- **Fee accrual per candle**: when `[candle.low, candle.high]` intersects `[lower_price, upper_price]`, fees += `volume × (fee_pct/100) × tvl_share × in_range_fraction`. `tvl_share` is computed once at open: `initial_value_usd / (pool_tvl + initial_value_usd)`.
- **IL formula**: `IL_ratio = (2√r / (1+r) - 1) × √(upper/lower)` with `r = effective_price / entry_price`, `effective_price` clamped to `[lower, upper]`. This replaces a previous USD-rebalance formula that always summed to the deposit amount for single-side SOL deploys (silently reported 0 IL). Multiply by `initial_value_usd` for USD.

**Public API**

- `openPaperPosition({ pool_address, amount_sol, bins_below, bins_above?, strategy?, sol_price_usd?, note? })` — returns `formatSummary(pos)` including the position `id`.
- `tickPaperPositions()` — pulls new candles since each position's `last_candle_timestamp`, updates state, returns per-position deltas.
- `getPaperPosition({ id })` — adds `annualized_fee_apr_pct` + `age_hours`.
- `closePaperPosition({ id, reason? })` — flips status to `closed`, freezes accrual.
- `listPaperPositions({ status? })` — filter by `'open'` / `'closed'` or omit for all.

---

## Bundler Detection (token.js)

Two signals used in `getTokenHolders()`:

- `common_funder` — multiple wallets funded by same source
- `funded_same_window` — multiple wallets funded in same time window

**Thresholds in config**: `maxBundlersPct` (default 30%), `maxTop10Pct` (default 60%)
Jupiter audit API: `botHoldersPercentage` (5–25% is normal for legitimate tokens)

---

## Base Fee Calculation (dlmm.js)

Read from pool object at deploy time:

```js
const baseFactor = pool.lbPair.parameters?.baseFactor ?? 0;
const actualBaseFee =
  baseFactor > 0
    ? parseFloat((((baseFactor * actualBinStep) / 1e6) * 100).toFixed(4))
    : null;
```

---

## Model Configuration

- Default model: `process.env.LLM_MODEL` or `openrouter/healer-alpha`
- Fallback on 502/503/529: `deepseek-flash-combo` (constant `FALLBACK_MODEL` in agent.js), then retry with exponential backoff
- Optional fallback **endpoint**: set `LLM_FALLBACK_BASE_URL` + `LLM_FALLBACK_API_KEY` and `LLM_ENABLE_FALLBACK_SWITCHING=true`. Useful when running through SwiftRouter and you want to fail over to OpenRouter on outages.
- Per-role models: `managementModel`, `screeningModel`, `generalModel` in user-config.json
- LM Studio: set `LLM_BASE_URL=http://localhost:1234/v1` and `LLM_API_KEY=lm-studio`
- `maxOutputTokens` minimum: 2048 (free models may have lower limits causing empty responses)
- Reasoning models that emit `reasoning_content`: the SDK custom fetch in agent.js strips SDK-style headers (so 9router doesn't redact reasoning) and promotes `reasoning_content` to `content` when content is empty, so tool calls still parse.

---

## Lessons System

`lessons.js` records closed position performance and auto-derives lessons. Key points:

- `getLessonsForPrompt({ agentType })` — injects relevant lessons into system prompt
- `evolveThresholds()` — adjusts screening thresholds based on winners vs losers
- Performance recorded via `recordPerformance()` called from executor.js after `close_position`
- **Known issue**: `evolveThresholds()` references `maxVolatility` and `minFeeTvlRatio` but config.js uses `minFeeActiveTvlRatio` and has no `maxVolatility` key — the evolution of these keys is a no-op

---

## HiveMind

Agent Meridian HiveMind sync is handled by `hivemind.js`. It uses built-in Agent Meridian defaults unless overridden by config or env.

---

## Environment Variables

| Var                             | Required | Purpose                                                                |
| ------------------------------- | -------- | ---------------------------------------------------------------------- |
| `WALLET_PRIVATE_KEY`            | Yes      | Base58 or JSON array private key                                       |
| `RPC_URL`                       | Yes      | Solana RPC endpoint                                                    |
| `OPENROUTER_API_KEY`            | Yes      | LLM API key (or `LLM_API_KEY` for OpenAI-compatible endpoints)         |
| `TELEGRAM_BOT_TOKEN`            | No       | Telegram notifications                                                 |
| `TELEGRAM_CHAT_ID`              | No       | Telegram chat target                                                   |
| `TELEGRAM_ALLOWED_USER_IDS`     | No       | Comma-separated user ids allowed to send commands                      |
| `LLM_BASE_URL`                  | No       | Override for primary LLM endpoint (e.g. LM Studio, SwiftRouter)        |
| `LLM_API_KEY`                   | No       | Override for `OPENROUTER_API_KEY` when using a non-OpenRouter endpoint |
| `LLM_MODEL`                     | No       | Override default model                                                 |
| `LLM_FALLBACK_BASE_URL`         | No       | Secondary endpoint for transient-error fallback                        |
| `LLM_FALLBACK_API_KEY`          | No       | Auth key for the fallback endpoint                                     |
| `LLM_ENABLE_FALLBACK_SWITCHING` | No       | `true` to enable endpoint failover on 5xx / timeouts                   |
| `DRY_RUN`                       | No       | Skip all on-chain transactions                                         |
| `ALLOW_SELF_UPDATE`             | No       | `true` to allow `self_update` tool (requires interactive TTY)          |
| `HIVE_MIND_URL`                 | No       | Collective intelligence server                                         |
| `HIVE_MIND_API_KEY`             | No       | Hive mind auth token                                                   |
| `HELIUS_API_KEY`                | No       | Enhanced wallet balance data                                           |
| `DISCORD_USER_TOKEN`            | No       | Selfbot token for `discord-listener/` signal pipeline                  |
| `DISCORD_GUILD_ID`              | No       | Discord server id for the listener                                     |
| `DISCORD_CHANNEL_IDS`           | No       | Comma-separated channel ids to watch                                   |
| `DISCORD_MIN_FEES_SOL`          | No       | Skip pools with all-time fees below this threshold                     |

---

## Known Issues / Tech Debt

- `lessons.js evolveThresholds()` evolves `maxVolatility` + `minFeeTvlRatio` (wrong key names — should be `minFeeActiveTvlRatio`; `maxVolatility` doesn't exist in config at all). The evolution is a no-op for those keys.
- `get_wallet_positions` tool (dlmm.js) is in definitions.js but not in MANAGER_TOOLS or SCREENER_TOOLS — only available in GENERAL role.

---

## Lesson Scoring & Auto-Pruning (v1.2.0+)

`utils/lessonManager.js`:

- `initializeLessonScore(lesson, outcome)` — initialize lesson score
- `applyPerformanceFeedback(perf)` — update lesson score based on subsequent position outcomes
- `pruneLessons()` — automatically remove low/old scoring lessons
- `runMaintenance()` — run periodically (every ~8 closes)

Integration exists in `lessons.js` (`recordPerformance`). Lessons now have a feedback loop and improve over time (Swarm Intelligence-style).

---

## DRY_RUN Mode

`DRY_RUN=true` in `.env` or via `yarn dev` (recommended for testing).

**Principle:** All on-chain operations that would send real transactions are blocked — instead the tool returns an object like `{ dry_run: true, would_..., message: "DRY RUN — no transaction sent" }`.

### Operations blocked in DRY_RUN

| Location              | Function          | Blocked behavior                                                        |
| --------------------- | ----------------- | ----------------------------------------------------------------------- |
| `tools/dlmm.js:573`   | `addLiquidity()`  | Do not send TX; return details of the position that _would_ be deployed |
| `tools/dlmm.js:1460`  | `claimFees()`     | Do not claim fees                                                       |
| `tools/dlmm.js:1506`  | `closePosition()` | Do not close positions                                                  |
| `tools/wallet.js:153` | `swapToken()`     | Do not perform swaps                                                    |

### What still runs in DRY_RUN

- **Screening** — pool discovery remains active (balance checks skipped)
- **Balance checks** in executor are skipped so a wallet with zero SOL can still run
- **Analysis & decision-making** — the agent can evaluate pools, compute ranges, etc.
- **HiveMind** — reports `dryRun: true` to the central service

### Startup log

```
index.js:45 → log "Mode: DRY RUN" or "Mode: LIVE"
```

**Conclusion:** DRY_RUN mode is safe for testing — the full agent (screening, analysis, decision) runs, but no on-chain transactions are sent.

---

## Tooling / Workflow Notes

### Lefthook + Prettier

`lefthook.yml` runs `yarn prettier --write {staged_files}` on pre-commit with `stage_fixed: true`. Without `stage_fixed`, prettier's reformatted files stay unstaged and the commit captures the un-formatted version — leaving an unstaged diff after every commit. Keep `stage_fixed: true` on any formatter job.

### Git conventions

- Use Conventional Commits where natural (`feat:`, `fix:`, `chore:`, `refactor:`). One-line subject + multi-line body.
- The repo's `git user.email` is the project's own email — don't add additional co-author trailers unless explicitly asked.

### CodeGraph (optional)

`.codegraph/` (if present) is a tree-sitter symbol index. The CodeGraph MCP tools (`codegraph_*`) are faster than grep for structural lookups (where is X defined, what calls Y, etc.). They are not required to run the agent.

### Persistent state files (all .gitignored)

`state.json`, `lessons.json`, `pool-memory.json`, `paper-positions.json`, `smart-wallets.json`, `token-blacklist.json`, `strategy-library.json`, `decision-log.json`, `hivemind-cache.json`, `signal-weights.json`, `skipped-pools.json`, `virtual-positions.json`, `causal-analysis.json`, `position-journal.db*`, `discord-signals.json`, `deployer-blacklist.json`. Treat these as runtime caches — code must tolerate them being missing or corrupted.
