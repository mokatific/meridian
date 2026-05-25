/**
 * Jupiter Token API — Official endpoint with API key.
 * Replaces datapi.jup.ag where possible to avoid 403 rate limits.
 *
 * Mapping:
 *   datapi.jup.ag/v1/assets/search    → api.jup.ag/tokens/v2/tag?query=...
 *   datapi.jup.ag/v1/holders/{mint}   → api.jup.ag/tokens/v2/tag?query={mint} (holderCount only)
 *   datapi.jup.ag/v1/chaininsight     → No official alternative (kept as-is with rate limiter)
 */

import { fetchWithJupiterKey } from "../utils/jupiter-keys.js";

const JUPITER_TOKENS_V2 = "https://api.jup.ag/tokens/v2";

/**
 * Search token by mint address or symbol using official Jupiter Tokens API.
 * Returns data compatible with existing screening pipeline.
 */
export async function searchTokenOfficial({ query }) {
  const url = `${JUPITER_TOKENS_V2}/tag?query=${encodeURIComponent(query)}`;
  const res = await fetchWithJupiterKey(url);
  if (!res.ok) throw new Error(`Jupiter Tokens v2 error: ${res.status}`);
  const data = await res.json();
  const tokens = Array.isArray(data) ? data : [data];
  return tokens;
}

/**
 * Convert official Jupiter token response to screening-compatible format.
 */
export function mapOfficialToScreening(t) {
  return {
    mint: t.id,
    name: t.name,
    symbol: t.symbol,
    mcap: t.mcap,
    price: t.usdPrice,
    liquidity: t.liquidity,
    holders: t.holderCount,
    organic_score: t.organicScore,
    organic_label: t.organicScoreLabel,
    launchpad: t.launchpad,
    graduated: !!t.graduatedPool,
    dev: t.dev || null,
    global_fees_sol: null, // not available in official API
    audit: t.audit
      ? {
          mint_disabled: t.audit.mintAuthorityDisabled,
          freeze_disabled: t.audit.freezeAuthorityDisabled,
          top_holders_pct: t.audit.topHoldersPercentage?.toFixed(2),
          bot_holders_pct: null, // not available in official API
          dev_migrations: t.audit.devMigrations,
        }
      : null,
    stats_1h: t.stats1h
      ? {
          price_change: t.stats1h.priceChange?.toFixed(2),
          buy_vol: t.stats1h.buyVolume?.toFixed(0),
          sell_vol: t.stats1h.sellVolume?.toFixed(0),
          buyers: t.stats1h.numOrganicBuyers,
          net_buyers: t.stats1h.numNetBuyers,
        }
      : null,
    stats_24h_net_buyers: t.stats24h ? t.stats24h.numNetBuyers : null,
  };
}
