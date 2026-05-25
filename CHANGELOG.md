# Changelog

All notable changes to the Meridian project are documented in this file.

## [1.6.3] - 2026-05-17

### Fixed

- `dry-run-simulator.js`: Major fix to PnL simulation - now uses real prices from Meteora API:
  1. Primary: compute price change from `initial_price` (at deploy) to `current price` from the API
  2. Fallback to `price_change_pct` from the API (5m period)
  3. Fallback to `stats_1h.price_change` if available
  4. Only use simulation as a last resort
  5. Debug logging: `priceSource` is now logged (real_from_api, api_5m, api_1h, simulation)
  6. Clamp price change to [-95%, 200%] for realistic bounds

- `tools/token.js`: Fallback to OKX API for `global_fees_sol` when datapi fails:
  - In `getTokenInfo()` - now try OKX `total_fee_sol` if datapi fees are null
  - In `getTokenHolders()` - same fallback
  - Fallback also in `searchToken()` (Jupiter official API)

### Technical

- Additional return fields: `price_change_pct` and `price_source` in `_evaluatePosition()` output

---

## [1.6.2] - 2026-05-17

### Fixed

- `dry-run-simulator.js`: PnL simulation was inaccurate due to two bugs:
  1. `estimated_fee_pct` was computed from `fee_tvl_ratio * hours * 0.5` - too conservative. Now correctly converted: `fee_tvl_ratio * 12 periods/hour * hours * 0.7` (12 = number of 5m periods per hour, 0.7 = LP capture rate)
  2. `_simulatePriceChange` used mean reversion to 0, causing negative bias. Now uses an unbiased random walk with a seed that changes per management cycle (12-minute bucket) so results vary
  3. PnL now uses real pool prices (`price_change_pct` or `stats_1h.price_change`) if available, with simulation as fallback
  4. PnL model fixed: `fees - IL + upside_capture` instead of `price_change + fees`
- `user-config.json`: `minFeePerTvl24h` lowered from 8 to 4 based on virtual close data

---

## [1.6.1] - 2026-05-17

### Fixed

- `agent.js`: XML-style tool calls from SwiftRouter/Claude that leaked into message content are now parsed and executed correctly. Previously tool calls in the format `<tool_call><function=deploy_position>...` were ignored and appeared as raw text in Telegram notifications, causing deploys not to happen.

---

## [1.6.0] - 2026-05-17

### Added

- **causal-analysis.js**: Causal analysis engine that identifies WHY positions profit or loss
  - Analyzes 9 factors: smart wallet presence, narrative quality, token age, volatility, fee_tvl_ratio, range efficiency, close reason patterns, hold duration, organic score
  - Compares win rate across groups (with/without smart wallets, various range volatility, etc.)
  - Produces actionable lessons with specific config recommendations (e.g. "raise minOrganic to 75")
  - Automatic deduplication - does not add a lesson that already exists
  - Saves run history to `causal-analysis.json`
  - `getCausalAnalysisSummary()` - summary for Telegram
- **Telegram command `/analysis`** - show the latest causal analysis result

### Changed

- `lessons.js`: `runCausalAnalysis()` is called automatically every 5 closes, together with `evolveThresholds()` and Darwin weight recalculation
- `index.js`: import and expose `/analysis` command

### Technical

- Causal lessons are tagged `['causal_analysis', type, confidence]` and role-aware (SCREENER/MANAGER)
- Minimum 5 samples for analysis, minimum 2 per bucket for conclusions
- Effect threshold 0.25 (25% win rate difference) to be considered significant

---

## [1.5.4] - 2026-05-17

### Fixed

- `tools/dlmm.js`: dry run `deploy_position` result now includes `success: true` and `position` field so the LLM does not try to redeploy thinking it failed. Also added explicit instructions in `message` not to retry.

---

## [1.5.3] - 2026-05-17

### Fixed

- `state.js`: `syncOpenPositions()` crash with `TypeError: Cannot read properties of undefined (reading 'push')` because a virtual position had no `notes` field. Fix: defensive `if (!Array.isArray(pos.notes)) pos.notes = []` before push
- `state.js`: virtual positions are now skipped by `syncOpenPositions()` - they are never on-chain so they must not be auto-closed by sync
- `dry-run-simulator.js`: virtual positions now created with `notes: []` for consistency with normal position structure

---

## [1.5.2] - 2026-05-17

### Fixed

- `smart-wallets.js`: `saveWallets()` is now wrapped in try-catch - EACCES permission error no longer crashes wallet evolution, only logs a warning
- `smart-wallets.js`: add `initSmartWalletsFile()` and call it on startup to ensure `smart-wallets.json` exists before wallet evolution writes
- `index.js`: call `initSmartWalletsFile()` in the startup block so the file always exists on VPS even if it is not in git (gitignored)

---

## [1.5.1] - 2026-05-17

### Fixed

- `tools/token.js`: `global_fees_sol` was always `null` when the official Jupiter API succeeded because the field is not available in the official API. Now enriched from `datapi.jup.ag` in parallel after the official API call, so `fees_sol` no longer shows `?` in the screening report and the hard gate `fees_sol >= 35` can be evaluated correctly.

---

## [1.5.0] - 2026-05-17

### Added

- **dry-run-simulator.js**: Demo account mode for dry run
  - `registerVirtualPosition()` - store a virtual position in `state.json` after dry-run deploy
  - `evaluateVirtualPositions()` - runs every management cycle, fetches real pool data, simulates PnL via seeded mean-reverting random walk based on real volatility
  - Applies the same exit rules as live: stop loss, take profit, trailing TP, OOR, low yield
  - On virtual close: feeds into the full learning pipeline (lessons, threshold evolution, pool memory, Darwin weights, decision log)
  - Auto-blacklist token + deployer on fast stop loss (suspected rug)
  - Config optimizer: every 5 virtual closes, analyze performance and add suggestions to lessons calibrated to current wallet balance
  - `getVirtualSummary()` - win rate, avg PnL, summary of open/closed positions
- **wallet-evolution.js**: Auto-discovery and pruning of smart wallets
  - Discover top LPers from study data every screening cycle
  - Auto-add wallets with win rate >= 70%, minimum 2 positions, avg PnL >= 20%
  - Update stats for tracked wallets with a rolling weighted average
  - Auto-remove wallets with win rate < 40% after >= 5 positions, or not seen for > 30 days
  - Wallet `source: "manual"` is never removed automatically
  - Max 30 wallets to keep RPC checks fast
- **Telegram command `/sim`** - show virtual trading summary (dry run stats)
- **Telegram command `/smart_wallets`** - list tracked smart wallets with stats
- **`.kiro/steering/changelog-rules.md`** - changelog and README update rules auto-included each session

### Changed

- `smart-wallets.js`: `addSmartWallet()` now accepts fields `source` and `stats` to distinguish manual vs auto wallets
- `index.js`: integrate dry-run simulator into screening cycle (register virtual position) and management cycle (evaluate virtual positions)
- `index.js`: integrate wallet evolution at the end of each screening cycle (background async)
- `agent.js`: SCREENER is no longer blocked by `mustUseRealTool` - LLM can answer "no deploy" without a tool call
- `agent.js`: `tool_choice=required` excluded for SCREENER at step 0
- `utils/datapi-limiter.js`: replace time-gate with a promise queue so parallel `Promise.allSettled` is truly serialized; add `x-api-key` header to all `datapi.jup.ag` requests

### Fixed

- Screening cycle no longer returns error "I couldn't complete that reliably because no tool call was made" when the LLM decides no candidate is viable
- `datapi.jup.ag` 403 error on `get_token_holders` and `get_token_narrative` due to concurrent burst rate limits

### Technical

- Virtual positions are stored in `state.json` with flag `{ virtual: true }` - not visible to the real position tracker
- Virtual close history is archived in `virtual-positions.json`
- Promise queue in datapi-limiter ensures max 1 request/1.1 seconds globally across all callers
- `smart-wallets.json` and `virtual-positions.json` are gitignored

---

## [1.4.0] - 2026-05-17

### Added

- **README.md**: Fully updated with upstream content - architecture, agent harness, decision log, Discord listener, HiveMind, config reference, PM2, disclaimer, smart wallet evolution, `/smart_wallets` command

---

## [1.3.0] - 2026-05-17

### Added

- **`.kiro/`**: Migration from `.claude/` to Kiro IDE
  - `steering/project.md` - project context always included (from CLAUDE.md)
  - `steering/agent-manager.md` - manager agent guide (manual inclusion)
  - `steering/agent-screener.md` - screener agent guide (manual inclusion)
  - `steering/commands.md` - all CLI quick commands (manual inclusion)
  - `hooks/no-background-exec.kiro.hook` - block background shell execution
  - `hooks/protect-env.kiro.hook` - block writes to `.env` files

---

## [1.2.0] - 2026-05-15

### Added

- **utils/lessonManager.js**: Lesson Scoring + Auto-Pruning system for HiveMind
  - Automatic scoring based on next performance outcome
  - Auto-prune lessons with low score or that are too old
  - Feedback loop so swarm learning gets smarter (Darwinian)
  - Functions `applyPerformanceFeedback`, `pruneLessons`, `runMaintenance`

### Changed

- `lessons.js`: Basic integration with lessonManager (score initialization + periodic prune + feedback)
- Version bump to 1.2.0

### Technical

- Backward compatible: old lessons automatically receive default scores
- Safe pruning: pinned + high-score + recent lessons are protected

See `utils/lessonManager.js` for scoring and pruning details.
