---
description: List all paper LP positions with current PnL, fees, IL, in-range %
---

Inspect the live paper-position tracker (`paper-positions.json`). Paper positions are forward-running simulated LPs that accrue real fees and recompute IL from live 5m OHLCV — no on-chain transactions. A `*/5 * * * *` cron ticks every open paper position.

```
!`node -e "import('./paper-positions.js').then(m => console.log(JSON.stringify(m.listPaperPositions({}), null, 2)))"`
```

For each entry summarise:

- `id`, pool name / strategy, opened_at
- `initial_value_usd` vs `current_value_usd`
- `fees_earned_usd`, `il_pct`, `net_pnl_usd`
- `in_range_pct` (how much of the position's life was spent in range)
- Recommend: keep tracking, close, or use this configuration for a real deploy.
