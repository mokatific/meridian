# TODO

All items below are tracked here for visibility. Completed items are moved to CHANGELOG.md.

## Done (recently shipped)

- [x] Virtual wallet tracking (dry-run-simulator.js) — real-time RPC price polling, virtual balance ledger
- [x] Evil Panda strategy selection for small wallets (`bins_multiplier`)
- [x] Deploy mutex to prevent parallel-call race conditions
- [x] Hard `maxPositions` guard in executor
- [x] `rpcUrlFallback` config key → `RPC_URL_FALLBACK` env
- [x] `lowYieldCooldownHours` config key wired into pool cooldown
- [x] Daily token limit error handling in agent loop
- [x] Narrative forwarded through deploy notifications
- [x] PM2 ecosystem includes `meridian-discord`; `pm2:restart:discord` / `pm2:logs:discord` scripts
- [x] Hermes cron scripts for wallet maintenance
- [x] `position-logger.js` SQLite audit trail
- [x] `skipped-tracker.js` missed-opportunity tracker
- [x] `signal-weights.js` Darwinian weight learning
- [x] Blocked deploy now throws instead of returning undefined position

## Backlog

- [ ] Telegram `/causal` command — show latest causal analysis summary inline
- [ ] Expose `skipped-tracker` results in daily briefing
- [ ] `discover_wallets_from_twitter` tool available in SCREENER_TOOLS (currently GENERAL only)
- [ ] Paper position A/B test report — compare Spot vs Bid-Ask outcomes on same pool
