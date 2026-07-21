export type DataMode = "seeded-demo" | "live";

export type SpreadMethod = "difference" | "ratio" | "beta-adjusted";

export type SpreadState = "stretched" | "normal" | "reverting";

export type TradeDirection = "long_spread" | "short_spread";

export type TradeExitReason = "target" | "stop" | "time" | "manual";

export type TradeStatus = "open" | "closed";

export interface InstrumentLeg {
  symbol: string;
  name: string;
  venue: string;
}

export interface ZWindows {
  days30: number;
  days60: number;
  days90: number;
  stable: boolean;
}

export interface UpcomingEvent {
  date: string;
  label: string;
  daysAway: number;
  detail?: string;
}

export interface SpreadHistoryPoint {
  /** ISO calendar date. Values are intentionally seeded demonstration data. */
  date: string;
  value: number;
  mean60: number;
  std60: number;
  zScore: number;
  upper1: number;
  lower1: number;
  upper2: number;
  lower2: number;
  rollSuspect: boolean;
}

export interface SpreadSignal {
  id: string;
  date: string;
  zScore: number;
  direction: TradeDirection;
  qualified: boolean;
}

export interface SpreadPair {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  category: string;
  method: SpreadMethod;
  unit: string;
  decimals: number;
  legs: readonly [InstrumentLeg, InstrumentLeg];
  rationale: string;
  latestValue: number;
  previousValue: number;
  zScore: number;
  percentileRank: number;
  halfLifeDays: number | null;
  adfPValue: number;
  beta?: number;
  lookback: number;
  entryZ: number;
  stopZ: number;
  windowZScores: ZWindows;
  state: SpreadState;
  nextEvent?: UpcomingEvent;
  asOf: string;
  history: readonly SpreadHistoryPoint[];
  signals: readonly SpreadSignal[];
  dataMode: DataMode;
}

export interface PaperTrade {
  id: string;
  pairSlug: string;
  openedOn: string;
  entryValue: number;
  entryZ: number;
  direction: TradeDirection;
  stopZ: number;
  hypothesis: string;
  status: TradeStatus;
  closedOn?: string;
  exitValue?: number;
  exitZ?: number;
  exitReason?: TradeExitReason;
  pnlPoints?: number;
  rMultiple?: number;
  postMortem?: string;
  /** All seeded records are examples, never an operator's realised track record. */
  dataMode: DataMode;
}

export interface EquityPoint {
  index: number;
  tradeId: string;
  date: string;
  rMultiple: number;
  cumulativeR: number;
}

export interface PerformanceMetrics {
  settledTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  hitRate: number | null;
  averageWinR: number | null;
  averageLossR: number | null;
  expectancyR: number | null;
  maxDrawdownR: number;
  longestLosingStreak: number;
  equityCurve: readonly EquityPoint[];
}

export interface DeskMetadata {
  name: string;
  subtitle: string;
  dataMode: DataMode;
  sourceLabel: string;
  asOf: string;
  disclosure: string;
  footerDisclosure: string;
}
