---
inclusion: always
---

# Meridian — Project Context

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
dry-run-simulator.js  DRY_RUN-mode virtual position tracker + 30s RPC price poller
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
twitter-wallet.js     Twitter/X KOL tweet scraper for wallet discovery

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
  okx.js              OKX advanced-info, cluster list, price info via relay or direct API

utils/
  rpc-cache.js        RPC Connection proxy: TTL cache + failover + sendAndConfirmPolling
  datapi-limiter.js   Rate-limited fetch wrapper for datapi.jup.ag
  lessonManager.js    Lesson scoring, feedback loop, auto-pruning
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

All cron tasks are pushed into the module-level `_cronTasks` array and torn down by `stopCronJobs()`. `_managementBusy` / `_screeningBusy` / `_paperTickBusy` flags guard against overlapping runs. Interval crons restart automatically when `update_config` changes their values (`registerCronRestarter()` in executor.js).

---

## Paper Positions (paper-positions.js)

Forward-running simulated LP positions that accrue real fees and IL using GeckoTerminal 5m OHLCV. No on-chain calls. Persisted to `paper-positions.json` so positions survive restarts.

Four tools are exposed to the agent: `open_paper_position`, `get_paper_position`, `close_paper_position`, `list_paper_positions`. All four are in MANAGER_TOOLS and SCREENER_TOOLS, and also reachable from the GENERAL chat.

**Math**

- **Sqrt-price geometry** computes the initial X/Y split. Single-side SOL (active == upper) starts as all Y.
- **Price scale normalization** at open: ratio between datapi's `current_price` and one GeckoTerminal candle close is stored as `price_scale`. All stored bounds live in OHLCV scale so ticks compare directly. Without this, ~1000× token-decimal mismatches silently broke IL.
- **Fee accrual**: when `[candle.low, candle.high]` intersects `[lower, upper]`, fees += `volume × (fee_pct/100) × tvl_share × in_range_fraction`.
- **IL formula**: `IL_ratio = (2√r/(1+r) − 1) × √(upper/lower)`, where `r = effective_price / entry_price`, `effective_price` clamped to `[lower, upper]`. Multiply by `initial_value_usd` for USD.

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
- Fallback on 502/503/529: `gemini-2.5-pro` (2nd attempt), then retry
- Per-role models: `managementModel`, `screeningModel`, `generalModel` in user-config.json
- LM Studio: set `LLM_BASE_URL=http://localhost:1234/v1` and `LLM_API_KEY=lm-studio`
- `maxOutputTokens` minimum: 2048 (free models may have lower limits causing empty responses)

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

| Var                  | Required | Purpose                                 |
| -------------------- | -------- | --------------------------------------- |
| `WALLET_PRIVATE_KEY` | Yes      | Base58 or JSON array private key        |
| `RPC_URL`            | Yes      | Solana RPC endpoint                     |
| `OPENROUTER_API_KEY` | Yes      | LLM API key                             |
| `TELEGRAM_BOT_TOKEN` | No       | Telegram notifications                  |
| `TELEGRAM_CHAT_ID`   | No       | Telegram chat target                    |
| `LLM_BASE_URL`       | No       | Override for local LLM (e.g. LM Studio) |
| `LLM_MODEL`          | No       | Override default model                  |
| `DRY_RUN`            | No       | Skip all on-chain transactions          |
| `HIVE_MIND_URL`      | No       | Collective intelligence server          |
| `HIVE_MIND_API_KEY`  | No       | Hive mind auth token                    |
| `HELIUS_API_KEY`     | No       | Enhanced wallet balance data            |

---

## Known Issues / Tech Debt

- `get_wallet_positions` tool (dlmm.js) is in definitions.js but not in MANAGER_TOOLS or SCREENER_TOOLS — only available in GENERAL role.
- `discover_wallets_from_twitter` is GENERAL-only; screener cannot call it autonomously.

---

## Deploy Safety

Two guards prevent over-deploying:

1. **`maxPositions` hard cap** — live position count checked in executor.js before `addLiquidity`; returns `{ blocked: true }` if at cap.
2. **Deploy mutex** — `_deployInProgress` flag prevents concurrent parallel deploy calls from racing.

Both return `blocked: true` — callers must check `result?.blocked` before reading `result.position`.

---

## Lesson Scoring & Auto-Pruning (v1.2.0+)

`utils/lessonManager.js`:

- `initializeLessonScore(lesson, outcome)` - assign the initial score
- `applyPerformanceFeedback(perf)` - update lesson score based on the next position outcome
- `pruneLessons()` - automatically remove low/old lesson scores
- `runMaintenance()` - run periodically (every ~8 closes)

Integration already exists in `lessons.js` (`recordPerformance`). Lessons now have a feedback loop - they get "smarter" over time.

---

## DRY_RUN Mode

`DRY_RUN=true` in `.env` or via `yarn dev` (set automatically).

**Principle:** All on-chain operations that send real transactions are blocked. Instead they return `{ dry_run: true, would_..., message: "DRY RUN - no transaction sent" }`.

### Operations blocked during DRY_RUN

| Location          | Function          | Skipped behavior                                                      |
| ----------------- | ----------------- | --------------------------------------------------------------------- |
| `tools/dlmm.js`   | `addLiquidity()`  | Does not send TX, returns the position details that would be deployed |
| `tools/dlmm.js`   | `claimFees()`     | Does not claim fees                                                   |
| `tools/dlmm.js`   | `closePosition()` | Does not close positions                                              |
| `tools/wallet.js` | `swapToken()`     | Does not swap tokens                                                  |

### Still running during DRY_RUN

- **Screening** - pool discovery remains active
- **Balance check** in executor is skipped - no SOL required
- **Analysis & decision-making** - the agent can still evaluate pools, calculate ranges, etc.
- **HiveMind** - reports `dryRun: true` status to central

---

## CLI Commands Reference

```bash
node cli.js positions                          # all open positions
node cli.js pnl <position_address>             # PnL, unclaimed fees, range info
node cli.js balance                            # wallet SOL and token balances
node cli.js claim --position <addr>            # claim accumulated fees
node cli.js close --position <addr>            # close position (auto-swaps to SOL)
node cli.js pool-detail --pool <addr>          # current pool metrics
node cli.js active-bin --pool <addr>           # current active bin and price
node cli.js swap --from <mint> --to <mint> --amount <n>   # swap via Jupiter
node cli.js lessons                            # show all learned lessons
node cli.js lessons add <text>                 # record a new lesson
node cli.js pool-memory --pool <addr>          # deploy history and win rate
node cli.js performance                        # full closed position history
node cli.js evolve                             # run threshold evolution
node cli.js blacklist add --mint <addr> --reason <text>
node cli.js blacklist list
node cli.js candidates --limit 5              # top pool candidates
node cli.js token-info --query <mint>
node cli.js token-holders --mint <addr>
node cli.js token-narrative --mint <addr>
node cli.js study --pool <addr>               # top LPer behaviour
node cli.js search-pools --query <name>
node cli.js discord-signals                   # check discord signal queue
node cli.js deploy --pool <addr> --amount <sol> --bins-below <N> --strategy bid_ask
node cli.js withdraw-liquidity --position <addr> --pool <addr> --bps 5000
node cli.js add-liquidity --position <addr> --pool <addr> --amount-x <n> --amount-y <n>
```
