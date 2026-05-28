# Changelog

All notable changes to the Meridian project are documented in this file.

## Unreleased

### Added

- `causal-analysis.js`: Causal analysis engine that identifies WHY a position was profitable or losing
  - Analyzes 9 factors: smart wallet presence, narrative quality, token age, volatility, fee_tvl_ratio, range efficiency, close reason patterns, hold duration, organic score
  - Compares win rates across cohorts (with/without smart wallets, different volatility buckets, etc.)
  - Produces actionable lessons with concrete config recommendations (e.g. "raise minOrganic to 75")
  - Automatic deduplication to avoid adding duplicate lessons
  - Stores run history in `causal-analysis.json`
  - `getCausalAnalysisSummary()` for Telegram summaries

- `dry-run-simulator.js`: Demo-account dry-run mode
  - `registerVirtualPosition()` — persist virtual positions to `state.json` after dry-run deploys
  - `evaluateVirtualPositions()` — run each management cycle, fetch real pool data, simulate PnL using a seeded random walk based on real volatility
  - Applies the same exit rules as live: stop loss, take profit, trailing TP, OOR, and low-yield exits
  - On virtual close: feed results into the full learning pipeline (lessons, threshold evolution, pool memory, Darwin weights, decision log)
  - Auto-blacklist token + deployer on fast stop-loss (suspected rug)
  - Config optimizer: every 5 virtual closes analyze performance and add suggested lessons calibrated to the current wallet balance
  - `getVirtualSummary()` — win rate, avg PnL, open/closed summary
  - Real-time RPC price polling (30s interval) for accurate virtual PnL tracking

- `wallet-evolution.js`: Auto-discovery and pruning of smart wallets
  - Discover top LPers from study data each screening cycle
  - Auto-add wallets with win rate ≥70%, at least 2 positions, and avg PnL ≥20%
  - Update tracked wallet stats using a rolling weighted average
  - Auto-remove wallets with win rate <40% after ≥5 positions, or wallets not seen for >30 days
  - Manually added wallets (`source: "manual"`) are never auto-removed
  - Max 30 wallets to keep RPC checks fast

- `signal-weights.js`: Darwinian signal-weight learning
  - Boosts weights for signals that correlate with winning positions
  - Decays weights for signals that correlate with losing positions
  - Configurable via `darwin*` keys in user-config.json

- `skipped-tracker.js`: Missed-opportunity tracker — evaluates skipped pools after the fact to improve future screening decisions

- `position-logger.js`: Append-only SQLite audit trail (`position-journal.db`) for all position opens/closes

- Evil Panda strategy selection system for small wallets
  - `bins_multiplier` config key scales bin range based on wallet size
  - Automatically selects conservative strategy when wallet is below threshold

- Deploy mutex: prevents parallel deploy calls from racing on the same pool

- Hard `maxPositions` guard in `deploy_position` executor — blocks deploy if open position count already at cap

- `rpcUrlFallback` config key: secondary RPC endpoint written to `RPC_URL_FALLBACK` env var for automatic failover

- `lowYieldCooldownHours` config key: hours to cool down a pool after a low-yield close

- Daily token limit error handling in agent loop — gracefully handles provider daily-token-cap errors

- Minimum interval enforcement for PnL polling to prevent excessive RPC calls

- Narrative forwarded through deploy notifications and executor tool result

- `twitter-wallet-cron.sh` / `wallet-maintenance-cron.sh`: Hermes cron scripts for KOL wallet discovery and maintenance

- PM2 ecosystem config now includes `meridian-discord` process alongside main agent

- `yarn pm2:restart:discord` and `yarn pm2:logs:discord` scripts

- Telegram commands: `/sim` (virtual trading summary), `/smart_wallets` (tracked wallet stats)

- `.kiro/steering/changelog-rules.md`: Rules for updating CHANGELOG and README during sessions

### Fixed

- `deploy_position`: throw on blocked result instead of returning `undefined` position to Telegram handler

- `dry-run-simulator.js`: Major PnL simulation fixes — now prefer real prices from the Meteora API
  1. Primary source: compute price change from `initial_price` (deploy) to API `current price`
  2. Fallback to `price_change_pct` from API (5m period)
  3. Fallback to `stats_1h.price_change` if available
  4. Use simulation only as a last resort
  5. Debug logging: `priceSource` now logs (real_from_api, api_5m, api_1h, simulation)
  6. Clamp price change to [-95%, 200%] for realistic bounds

- `dry-run-simulator.js`: Simulated PnL inaccuracies fixed
  1. `estimated_fee_pct` conversion fixed to: `fee_tvl_ratio * 12 periods/hour * hours * 0.7`
  2. `_simulatePriceChange` replaced mean reversion with an unbiased seeded random walk
  3. PnL model fixed to `fees - IL + upside_capture`

- `tools/token.js`: Fallback to OKX API for `global_fees_sol` when datapi fails; enrichment from `datapi.jup.ag` to avoid null fees

- `tools/dlmm.js`: dry-run `deploy_position` results now include `success: true` and a `position` field so the LLM does not retry erroneously

- `state.js`: fixed crash in `syncOpenPositions()` where virtual positions lacked `notes`; added defensive initialization and skip virtual positions in real sync

- `smart-wallets.js`: `saveWallets()` wrapped in try-catch to avoid EACCES crashes; added `initSmartWalletsFile()` and ensure it's called on startup

- `agent.js`: XML-style tool calls from some LLM providers are parsed and executed correctly now

- Screening cycle: no longer errors when LLM decides there are no deployable candidates

- `utils/datapi-limiter.js`: replaced time-gate with a promise queue and added `x-api-key` header so parallel requests are serialized and rate-limited

- `lessons.js evolveThresholds()`: correctly references `minFeeActiveTvlRatio` (was `minFeeTvlRatio`) and `maxVolatility`

- `tools/dlmm.js`: replaced `sendAndConfirmTransaction` with HTTP polling to fix `signatureSubscribe` errors

- OKX enrichment wired through relay; dead `gmgn_*` references removed

- `lowYieldCooldownHours` config key wired into pool cooldown logic

- Evil Panda `bins_multiplier` wired into actual deploy logic

- Telegram: convert markdown to HTML so LLM output renders cleanly

- `agent.js`: guard against undefined response after exhausted retries

- `agent.js`: handle LLM call failures by capturing and rethrowing errors

- `agent.js`: handle DeepSeek thinking mode `tool_choice` rejection

- Telegram: suppress 'message is not modified' edit errors

- `notifyClose`: include reason for closure in Telegram notification

- Yield-check age bug corrected; near-cap volatility advisory added

### Changed

- `lessons.js`: `runCausalAnalysis()` is invoked automatically every 5 closes alongside `evolveThresholds()` and Darwin weight recalculation

- `index.js`: integrated dry-run simulator into screening and management cycles; integrated wallet evolution after screening

- `agent.js`: SCREENER is no longer blocked by `mustUseRealTool`; tool_choice requirements are relaxed for step 0

- Virtual positions are stored with `{ virtual: true }` and archived to `virtual-positions.json`

- Promise queue in `datapi-limiter` enforces a max global rate (1 request / 1.1s)

- `discoverPools` enhanced to improve handling of Discord signal pools; `refreshDiscordOnlyPools` merges token data and parameters

- `maxVolatilityProximityPct` removed from config and setup wizard

- Lesson caps adjusted for automated cycles; performance summary display improved

- Auto LP strategy selection based on pool data

## Notes

This changelog captures development updates focused on dry-run simulation correctness, causal analysis, smart-wallet automation, Evil Panda strategy system, RPC reliability, and robustness improvements. For release notes and versioned entries, move finalized items under a release heading (e.g. `## 1.3.0 - 2026-06-xx`).
