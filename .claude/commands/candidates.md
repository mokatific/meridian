---
description: Fetch and analyse top pool candidates with OKX smart money signals
---

Fetch top 5 enriched pool candidates and cross-reference with OKX signals:

1. Get pool candidates:

```
!`node cli.js candidates --limit 5`
```

2. Get OKX smart money signals on Solana:

```
!`onchainos signal list --chain solana --wallet-type 1`
```

3. Get OKX trending tokens:

```
!`onchainos token trending --chains solana`
```

Cross-reference: if a candidate token appears in OKX smart money signals with low soldRatioPercent (<20%), that's a strong conviction signal. If smart money has already sold (soldRatioPercent >80%), skip it.

Analyse each candidate and give a deploy recommendation (yes/no) with reasoning. Consider:

- fee/TVL ratio (higher is better, aim for >0.08; reject if <0.08)
- organic score (min 70, prefer 75+; causal: 75-85 = 100% win rate)
- bot % (reject if >25%)
- top10 holder concentration (reject if >40%)
- bundle % (reject if >20%)
- volatility (prefer 3-5; reject if >7)
- token age (reject if <6h)
- token global fees SOL (reject if <30)
- price trend (prefer stable or uptrending)
- smart money conviction (OKX signal soldRatioPercent)
- narrative strength

Rank them and suggest which (if any) to deploy into.
