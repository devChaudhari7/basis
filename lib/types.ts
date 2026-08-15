/** Where the numbers on screen come from. Shown honestly in the UI chrome. */
export type DataSourceMode = "live" | "snapshot";

/** Matches worker/stats.py + database/schema.sql exactly. */
export type SpreadMethod = "diff" | "ratio" | "beta";

export type Stability = "stable" | "unstable" | "insufficient_data";

export type SpreadState = "stretched" | "reverting" | "normal" | "na";

export type TradeDirection = "long_spread" | "short_spread";

export type TradeExitReason = "target" | "stop" | "time" | "manual";

export interface InstrumentLeg {
  symbol: string;
  name: string;
  venue: string;
}

/** One session of a spread series. Nullable stats are warm-up or roll gaps. */
export interface SeriesPoint {
  d: string;
  v: number;
  m: number | null;
  s: number | null;
  z: number | null;
  roll: boolean;
}

export interface PairLatest {
  d: string;
  value: number;
  prevValue: number | null;
  mean60: number | null;
  std60: number | null;
  z: number | null;
  z30: number | null;
  z90: number | null;
  stability: Stability;
  pctRank: number | null;
  halfLife: number | null;
  adfP: number | null;
  beta: number | null;
  rollSuspect: boolean;
}

export interface SignalMark {
  d: string;
  z: number;
  direction: TradeDirection;
  /** Realised move at each horizon, in entry-day sigma, signed so positive
   *  means the dislocation closed in the signal's favour. Null when the
   *  history after the signal is shorter than the horizon. */
  fwd5: number | null;
  fwd10: number | null;
  fwd20: number | null;
  /** Worst adverse excursion along the way, in the same units. */
  mae20: number | null;
}

/** Descriptive summary of what followed past signals. Never a forecast. */
export interface SignalDiagnostic {
  horizon: number;
  n: number;
  hitRate: number;
  medianMove: number;
  p25: number;
  p75: number;
  medianMae: number;
  worst: number;
}

/** A retrospectively detected level shift. Context only — never an input. */
export interface StructuralBreak {
  d: string;
  shift: number;
  tStat: number;
}

export type EventSource = "published" | "rule-derived";

export interface UpcomingEvent {
  d: string;
  label: string;
  daysAway: number;
  source: EventSource | null;
}

/** A past event plotted on the spread chart. */
export interface EventMark {
  d: string;
  label: string;
  source: EventSource | null;
}

export interface PairCorrelation {
  pairA: string;
  pairB: string;
  corr: number;
  n: number;
  windowSessions: number;
}

export interface Pair {
  /** Database id in live mode; null when serving the static snapshot. */
  id: number | null;
  slug: string;
  displayName: string;
  method: SpreadMethod;
  unit: string;
  lookback: number;
  entryZ: number;
  stopZ: number;
  rationale: string;
  legs: readonly [InstrumentLeg, InstrumentLeg];
  latest: PairLatest;
  series: readonly SeriesPoint[];
  signals: readonly SignalMark[];
  nextEvent: UpcomingEvent | null;
  diagnostics: readonly SignalDiagnostic[];
  breaks: readonly StructuralBreak[];
  /** Past events falling inside the charted window. */
  events: readonly EventMark[];
  /** True when a structural break sits inside the current estimation window,
   *  which makes the 60-day mean — and therefore the z-score — unreliable. */
  breakInWindow: boolean;
}

export interface DeskData {
  mode: DataSourceMode;
  /** Latest settlement session across pairs. */
  asOf: string;
  generatedAt: string | null;
  pairs: readonly Pair[];
  correlations: readonly PairCorrelation[];
}

export interface PaperTrade {
  id: number;
  pairSlug: string;
  openedOn: string;
  entryValue: number;
  entryZ: number;
  direction: TradeDirection;
  stopZ: number;
  hypothesis: string;
  closedOn: string | null;
  exitValue: number | null;
  exitZ: number | null;
  exitReason: TradeExitReason | null;
  pnlPoints: number | null;
  rMultiple: number | null;
  postMortem: string | null;
  /** Marked-to-latest R for open trades; computed server-side in live mode. */
  liveR: number | null;
}

export interface TradesData {
  mode: DataSourceMode;
  trades: readonly PaperTrade[];
}

export interface EquityPoint {
  index: number;
  tradeId: number;
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

/** Minimal payload the top tape and cold open need. */
export interface TapeItem {
  slug: string;
  displayName: string;
  z: number | null;
  value: number;
  decimals: number;
}
