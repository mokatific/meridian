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
  overview?: { name?: string; tvl?: number; binStep?: number; feePct?: number; poolPrice?: number; tokenXSymbol?: string; tokenYSymbol?: string }
  topLpers: TopLper[]
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
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface ChartResponse {
  mint: string
  interval: string
  candles: Candle[]
}

export interface OkxRisk {
  is_rugpull: boolean
  is_wash: boolean
  risk_level: number | string
  source?: string
}

export interface OkxEnrichResponse {
  mint: string
  chainIndex: string
  price: number | null
  risk: OkxRisk
  clusters: unknown[]
  advanced: unknown
  meta?: { stale?: boolean; cached?: boolean; partial?: boolean }
}
