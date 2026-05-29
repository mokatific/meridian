// ─── HiveMind Public Summary ──────────────────────────────────────────────────

export interface NetworkOverview {
  activeAgents: number
  registeredAgents: number
  totalLessons: number
  sampleCount: number
  adjustedSampleCount: number
  totalPnlUsd: number
  totalFeesUsd: number
  avgPnlPct: number
  avgHoldMinutes: number
  winRatePct: number
  adjustedWinRatePct: number
  rawEventFeesUsd: number
  syncedWalletFeesUsd: number
  syncedWalletFeesSol: number
  feeSource: string
  feeSyncedAgents: number
  feeUnsyncedAgents: number
}

export interface PoolStat {
  pool: string
  sampleCount: number
  adjustedSampleCount: number
  totalPnlUsd: number
  totalFeesUsd: number
  avgPnlPct: number
  avgHoldMinutes: number
  winRatePct: number
  adjustedWinRatePct: number
}

export interface StrategyStat {
  strategy: string
  sampleCount: number
  adjustedSampleCount: number
  totalPnlUsd: number
  totalFeesUsd: number
  avgPnlPct: number
  avgHoldMinutes: number
  winRatePct: number
  adjustedWinRatePct: number
}

export interface DayTrend {
  date: string
  pnlUsd: number
  feesUsd: number
  closes: number
}

export interface SummaryLesson {
  id: string
  consensusKey: string
  rule: string
  role: string | null
  tags: string[]
  score: number
  consensus: 'strong' | 'emerging' | 'disputed'
  distinctAgents: number
  sampleCount: number
  confidence: number
  created_at?: string
  outcome?: string
  sourceType?: string
  agentIds?: string[]   // present in graph.lessons only
  label?: string
}

export interface GraphAgent {
  id: string
  label: string
  winRatePct: number
}

export interface GraphEdge {
  from: string   // agent-XXXXXX
  to: string     // lesson id
  tooltip: string
}

export interface TerminalEvent {
  at: string
  line: string
  type: 'performance' | 'lesson' | string
}

export interface PublicSummary {
  updatedAt: string
  overview: NetworkOverview
  topPools: PoolStat[]
  topStrategies: StrategyStat[]
  recentTrend: DayTrend[]
  consensus: {
    strong: SummaryLesson[]
    emerging: SummaryLesson[]
    disputed: SummaryLesson[]
  }
  graph: {
    agents: GraphAgent[]
    lessons: SummaryLesson[]
    edges: GraphEdge[]
  }
  terminalFeed: TerminalEvent[]
}

// ─── HiveMind ─────────────────────────────────────────────────────────────────

export interface Lesson {
  id: string
  consensusKey: string
  rule: string
  role: string | null
  tags: string[]
  score: number
  consensus: 'strong' | 'weak' | 'contradictory'
  distinctAgents: number
  sampleCount: number
  confidence: number
  created_at: string
  outcome: 'good' | 'bad' | 'neutral' | string
  sourceType: string
  contradictory: boolean
}

// ─── Meridian LP ──────────────────────────────────────────────────────────────

export interface HistoricalPosition {
  position: string
  pool: string
  strategy: string
  strategyType?: string
  rangeStyle?: string
  lowerBinId: number
  upperBinId: number
  widthBins: number
  inputValue: number
  inputNative: number
  feeUsd: number
  feeNative: number
  feePercent: number
  pnlUsd: number
  pnlNative: number
  pnlPct: number
  pnlNativePct: number
  inRange: boolean
  createdAt: string
  closedAt: string | null
  ageHours: number
}

export interface HistoricalOwner {
  owner: string
  preferredStrategy: string
  preferredRangeStyle: string
  avgHoldHours: number
  avgPnlPct: number
  avgFeePercent: number
  avgWidthBins: number
  topPositions: HistoricalPosition[]
}

export interface TopLper {
  owner: string
  ownerShort: string
  totalInflowUsd: number
  totalOutflowUsd: number
  totalFeeUsd: number
  totalPnlUsd: number
  feePercent: number
  roiPct: number
  aprPct: number
  avgAgeHours: number
  totalLp: number
  winRatePct: number
  firstActivity: string
  lastActivity: string
}

export interface TopLpResponse {
  poolAddress: string
  overview?: {
    name?: string; tvl?: number; binStep?: number; feePct?: number
    poolPrice?: number; tokenXSymbol?: string; tokenYSymbol?: string
  }
  topLpers: TopLper[]
  historicalOwners?: HistoricalOwner[]
  meta?: { snapshotAt?: string; source?: string; stale?: boolean }
}

export interface StudyEntry {
  owner: string
  pnlPct: number
  pnlUsd: number
  feePercent: number
  winRatePct: number
  avgAgeHours: number
}

export interface StudyTopLpResponse {
  poolAddress: string
  binStep: number
  activePositionCount: number
  ownerCount: number
  topWinnersByPct: StudyEntry[]
  topWinnersByUsd: StudyEntry[]
  topLosersByPct: StudyEntry[]
  topLosersByUsd?: StudyEntry[]
  topHistoricalOwners?: HistoricalOwner[]
  suggestedStyle?: { strategy: string; rangeStyle: string }
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ChartIndicatorState {
  priceAboveUpperBand?: boolean
  priceBelowLowerBand?: boolean
  supertrendBreakUp?: boolean
  supertrendBreakDown?: boolean
  rsiZone?: string
}

export interface ChartResponse {
  mint: string
  interval: string
  candles: Candle[]
  indicators?: {
    rsi?: { time: number; value: number }[]
    bollinger?: { time: number; middle: number; upper: number; lower: number }[]
    supertrend?: { time: number; value: number; direction: 'bullish' | 'bearish' }[]
    fibonacci?: { high: number; low: number; levels: Record<string, number> }
  }
  latest?: {
    rsi?: number
    bollinger?: { middle: number; upper: number; lower: number }
    supertrend?: { value: number; direction: string }
    states?: ChartIndicatorState
  }
}

// ─── Meteora Pool Discovery ───────────────────────────────────────────────────

export interface MeteoraTokenInfo {
  address: string
  name: string
  symbol: string
  decimals: number
  icon?: string
  is_verified?: boolean
  holders?: number
  has_freeze_authority?: boolean
  has_mint_authority?: boolean
  total_supply?: number
  price?: number
  market_cap?: number
  fdv?: number
  organic_score?: number
  organic_score_label?: string
  top_holders_pct?: number
  warnings?: { type: string; message: string; severity: string }[]
  tags?: string[]
}

export interface MeteoraPool {
  pool_address: string
  name: string
  pool_type?: string
  fee_pct: number
  pool_created_at?: number
  is_blacklisted?: boolean
  dlmm_params?: { bin_step: number; collect_fee_mode?: string }
  token_x: MeteoraTokenInfo
  token_y: MeteoraTokenInfo
  tvl: number
  tvl_change_pct?: number
  active_tvl?: number
  active_tvl_change_pct?: number
  fee_active_tvl_ratio?: number
  volume?: number
  volume_change_pct?: number
  fee?: number
  volatility?: number
  correlation?: number
  price_trend?: number[]
  pool_price?: number
  pool_price_change_pct?: number
  open_positions?: number
  active_positions?: number
  unique_lps?: number
  unique_traders?: number
  has_farm?: boolean
  dynamic_fee_pct?: number
  launchpad?: string | null
  organic_score?: number
}

export interface MeteoraTrendingResponse {
  total: number
  page_size: number
  data: MeteoraPool[]
  has_more: boolean
}

// ─── Meteora Position PnL ────────────────────────────────────────────────────

export interface MeteoraPositionPnl {
  positionAddress: string
  minPrice: number
  maxPrice: number
  lowerBinId: number
  upperBinId: number
  poolActiveBinId?: number
  isOutOfRange?: boolean
  poolActivePrice?: number
  feePerTvl24h?: number
  isClosed: boolean
  createdAt: number
  closedAt?: number | null
  pnlUsd: number
  pnlSol?: number
  pnlPctChange: number
  allTimeDeposits?: { tokenX?: { amount: number; usd: number }; tokenY?: { amount: number; usd: number }; total?: { usd: number; sol: number } }
  allTimeWithdrawals?: { tokenX?: { amount: number; usd: number }; tokenY?: { amount: number; usd: number }; total?: { usd: number; sol: number } }
  allTimeFees?: { tokenX?: { amount: number; usd: number }; tokenY?: { amount: number; usd: number }; total?: { usd: number; sol: number } }
}

export interface MeteoraPositionsResponse {
  tokenX?: string
  tokenY?: string
  totalCount: number
  page: number
  pageSize: number
  hasNext: boolean
  positions: MeteoraPositionPnl[]
}

// ─── GeckoTerminal ───────────────────────────────────────────────────────────

export interface GeckoPoolAttributes {
  base_token_price_usd: string
  quote_token_price_usd: string
  address: string
  name: string
  pool_created_at: string | null
  fdv_usd: string | null
  market_cap_usd: string | null
  price_change_percentage: Record<string, string>
  transactions: Record<string, { buys: number; sells: number; buyers: number; sellers: number }>
  volume_usd: Record<string, string>
  reserve_in_usd: string
  locked_liquidity_percentage: number | null
}

export interface GeckoTrade {
  block_number: number
  tx_hash: string
  tx_from_address: string
  from_token_amount: string
  to_token_amount: string
  price_from_in_usd: string
  price_to_in_usd: string
  block_timestamp: string
  kind: 'buy' | 'sell'
  volume_in_usd: string
  from_token_address: string
  to_token_address: string
}

// ─── DexScreener ─────────────────────────────────────────────────────────────

export interface DexScreenerPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  labels?: string[]
  baseToken: { address: string; name: string; symbol: string }
  quoteToken: { address: string; name: string; symbol: string }
  priceNative: string
  priceUsd: string
  txns: Record<string, { buys: number; sells: number }>
  volume: Record<string, number>
  priceChange: Record<string, number>
  liquidity: { usd: number; base: number; quote: number }
  pairCreatedAt?: number
  info?: {
    imageUrl?: string
    websites?: { url: string; label: string }[]
    socials?: { url: string; type: string }[]
  }
}

// ─── Jupiter datapi ──────────────────────────────────────────────────────────

export interface JupiterTokenStats {
  priceChange?: number
  liquidityChange?: number
  volumeChange?: number
  buyVolume?: number
  sellVolume?: number
  buyOrganicVolume?: number
  sellOrganicVolume?: number
  numBuys?: number
  numSells?: number
  numTraders?: number
  numOrganicBuyers?: number
  numNetBuyers?: number
}

export interface JupiterAsset {
  id: string
  name: string
  symbol: string
  icon?: string
  decimals: number
  organicScore?: number
  organicScoreLabel?: string
  ctLikes?: number
  smartCtLikes?: number
  isVerified?: boolean
  tags?: string[]
  holderCount?: number
  usdPrice?: number
  liquidity?: number
  mcap?: number
  fdv?: number
  fees?: number
  audit?: {
    mintAuthorityDisabled?: boolean
    freezeAuthorityDisabled?: boolean
    topHoldersPercentage?: number
    devMints?: string[]
  }
  stats5m?: JupiterTokenStats
  stats1h?: JupiterTokenStats
  stats6h?: JupiterTokenStats
  stats24h?: JupiterTokenStats
  stats7d?: JupiterTokenStats
  createdAt?: string
  updatedAt?: string
}

// ─── Solana RPC ───────────────────────────────────────────────────────────────

export interface SolanaSignature {
  signature: string
  slot: number
  blockTime: number | null
  confirmationStatus: string
  err: unknown
  memo: string | null
}

export interface SolanaWalletResponse {
  wallet: string
  solBalance: number
  lamports: number
  recentSignatures: SolanaSignature[]
  lastActivity: number | null
}

