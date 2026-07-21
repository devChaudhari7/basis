import type {
  DeskMetadata,
  PaperTrade,
  SpreadHistoryPoint,
  SpreadPair,
  SpreadSignal,
  SpreadState
} from "@/lib/types";

const AS_OF = "2026-07-17";

type DemoSeriesConfig = {
  base: number;
  standardDeviation: number;
  latest: number;
  latestZ: number;
  drift: number;
  amplitude: number;
  phase: number;
  decimals: number;
  rollDays?: readonly number[];
};

const round = (value: number, decimals: number) =>
  Number(value.toFixed(decimals));

function tradingDatesEndingOn(endDate: string, count: number): string[] {
  const date = new Date(`${endDate}T12:00:00Z`);
  const dates: string[] = [];

  while (dates.length < count) {
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.unshift(date.toISOString().slice(0, 10));
    }
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return dates;
}

function createDemoHistory(config: DemoSeriesConfig): readonly SpreadHistoryPoint[] {
  const dates = tradingDatesEndingOn(AS_OF, 96);
  const lastIndex = dates.length - 1;
  const rollDays = new Set(config.rollDays ?? []);

  return dates.map((date, index) => {
    const progress = index / lastIndex;
    const mean60 = config.base + config.drift * (progress - 0.5);
    const std60 = config.standardDeviation * (0.93 + 0.08 * Math.cos(index / 13));
    const cyclicMove =
      Math.sin(index / 7 + config.phase) * config.amplitude +
      Math.cos(index / 17 + config.phase) * config.amplitude * 0.42;
    const rollJump = rollDays.has(index) ? config.standardDeviation * 4.45 : 0;
    const value =
      index === lastIndex
        ? config.latest
        : mean60 + cyclicMove + rollJump + (progress - 0.5) * config.drift * 0.35;
    const resolvedMean =
      index === lastIndex
        ? config.latest - config.latestZ * config.standardDeviation
        : mean60;
    const resolvedStd = index === lastIndex ? config.standardDeviation : std60;

    return {
      date,
      value: round(value, config.decimals),
      mean60: round(resolvedMean, config.decimals),
      std60: round(resolvedStd, config.decimals),
      zScore: round((value - resolvedMean) / resolvedStd, 2),
      upper1: round(resolvedMean + resolvedStd, config.decimals),
      lower1: round(resolvedMean - resolvedStd, config.decimals),
      upper2: round(resolvedMean + resolvedStd * 2, config.decimals),
      lower2: round(resolvedMean - resolvedStd * 2, config.decimals),
      rollSuspect: rollDays.has(index)
    };
  });
}

const brentWtiHistory = createDemoHistory({
  base: 4.72,
  standardDeviation: 0.49,
  latest: 5.84,
  latestZ: 2.28,
  drift: 0.24,
  amplitude: 0.33,
  phase: 0.25,
  decimals: 2,
  rollDays: [31]
});

const goldSilverHistory = createDemoHistory({
  base: 88.18,
  standardDeviation: 1.02,
  latest: 87.42,
  latestZ: -0.74,
  drift: -0.36,
  amplitude: 0.82,
  phase: 1.18,
  decimals: 2
});

const niftyBankHistory = createDemoHistory({
  base: 0.456,
  standardDeviation: 0.003,
  latest: 0.452,
  latestZ: -1.44,
  drift: -0.001,
  amplitude: 0.0024,
  phase: 2.1,
  decimals: 4,
  rollDays: [57]
});

const usdinrDxyHistory = createDemoHistory({
  base: 0.34,
  standardDeviation: 0.19,
  latest: 0.73,
  latestZ: 2.06,
  drift: 0.08,
  amplitude: 0.13,
  phase: 2.65,
  decimals: 2
});

const signalsByPair: Record<string, readonly SpreadSignal[]> = {
  "brent-wti": [
    {
      id: "demo-signal-bw-01",
      date: "2026-06-22",
      zScore: -2.12,
      direction: "long_spread",
      qualified: true
    },
    {
      id: "demo-signal-bw-02",
      date: "2026-07-17",
      zScore: 2.28,
      direction: "short_spread",
      qualified: true
    }
  ],
  "gold-silver": [
    {
      id: "demo-signal-gs-01",
      date: "2026-05-28",
      zScore: 2.05,
      direction: "short_spread",
      qualified: true
    }
  ],
  "nifty-banknifty": [
    {
      id: "demo-signal-nb-01",
      date: "2026-06-30",
      zScore: -2.18,
      direction: "long_spread",
      qualified: false
    }
  ],
  "usdinr-dxy": [
    {
      id: "demo-signal-ud-01",
      date: "2026-07-17",
      zScore: 2.06,
      direction: "short_spread",
      qualified: true
    }
  ]
};

/**
 * UI seed data only. It is deliberately labelled throughout the app so the
 * interface never presents hypothetical research figures as a live desk.
 */
export const spreadPairs: readonly SpreadPair[] = [
  {
    id: 1,
    slug: "brent-wti",
    name: "BRENT — WTI",
    shortName: "BRENT-WTI",
    category: "Energy",
    method: "difference",
    unit: "USD/bbl",
    decimals: 2,
    legs: [
      { symbol: "BZ=F", name: "Brent Crude", venue: "ICE" },
      { symbol: "CL=F", name: "WTI Crude", venue: "NYMEX" }
    ],
    rationale:
      "Brent reflects seaborne crude while WTI is priced around landlocked Cushing. Transport constraints, quality differentials, and regional supply shocks can widen or compress the gap.",
    latestValue: 5.84,
    previousValue: 5.61,
    zScore: 2.28,
    percentileRank: 95,
    halfLifeDays: 7.1,
    adfPValue: 0.04,
    lookback: 60,
    entryZ: 2,
    stopZ: 3,
    windowZScores: { days30: 2.11, days60: 2.28, days90: 2.21, stable: true },
    state: "stretched",
    nextEvent: {
      date: "2026-07-22",
      label: "EIA crude inventories",
      daysAway: 1,
      detail: "US weekly crude inventory release"
    },
    asOf: AS_OF,
    history: brentWtiHistory,
    signals: signalsByPair["brent-wti"],
    dataMode: "seeded-demo"
  },
  {
    id: 2,
    slug: "gold-silver",
    name: "GOLD / SILVER",
    shortName: "GOLD/SILVER",
    category: "Metals",
    method: "ratio",
    unit: "x",
    decimals: 2,
    legs: [
      { symbol: "GC=F", name: "Gold", venue: "COMEX" },
      { symbol: "SI=F", name: "Silver", venue: "COMEX" }
    ],
    rationale:
      "The gold/silver ratio is a classic precious-metals risk gauge. Silver carries more industrial demand and generally higher beta, so risk appetite and growth expectations can drive divergence.",
    latestValue: 87.42,
    previousValue: 87.61,
    zScore: -0.74,
    percentileRank: 37,
    halfLifeDays: 12.8,
    adfPValue: 0.08,
    lookback: 60,
    entryZ: 2,
    stopZ: 3,
    windowZScores: { days30: -0.66, days60: -0.74, days90: -0.79, stable: true },
    state: "normal",
    nextEvent: {
      date: "2026-07-24",
      label: "US PMI",
      daysAway: 3,
      detail: "Manufacturing and services survey release"
    },
    asOf: AS_OF,
    history: goldSilverHistory,
    signals: signalsByPair["gold-silver"],
    dataMode: "seeded-demo"
  },
  {
    id: 3,
    slug: "nifty-banknifty",
    name: "NIFTY / BANKNIFTY",
    shortName: "NIFTY/BANKNIFTY",
    category: "India equities",
    method: "ratio",
    unit: "x",
    decimals: 4,
    legs: [
      { symbol: "^NSEI", name: "NIFTY 50", venue: "NSE" },
      { symbol: "^NSEBANK", name: "NIFTY Bank", venue: "NSE" }
    ],
    rationale:
      "The ratio isolates financials' weight against the broad Indian market. Credit conditions, rate expectations, and bank earnings can create persistent-looking moves that demand extra caution.",
    latestValue: 0.452,
    previousValue: 0.4517,
    zScore: -1.44,
    percentileRank: 18,
    halfLifeDays: 9.4,
    adfPValue: 0.07,
    lookback: 60,
    entryZ: 2,
    stopZ: 3,
    windowZScores: { days30: -1.2, days60: -1.44, days90: -1.6, stable: true },
    state: "reverting",
    nextEvent: {
      date: "2026-07-29",
      label: "RBI MPC minutes",
      daysAway: 8,
      detail: "Reserve Bank of India policy communication"
    },
    asOf: AS_OF,
    history: niftyBankHistory,
    signals: signalsByPair["nifty-banknifty"],
    dataMode: "seeded-demo"
  },
  {
    id: 4,
    slug: "usdinr-dxy",
    name: "USDINR vs DXY",
    shortName: "USDINR-DXY",
    category: "FX",
    method: "beta-adjusted",
    unit: "INR residual",
    decimals: 2,
    legs: [
      { symbol: "USDINR=X", name: "USD / INR", venue: "FX" },
      { symbol: "DX-Y.NYB", name: "US Dollar Index", venue: "ICE" }
    ],
    rationale:
      "A rolling hedge ratio asks whether rupee weakness is idiosyncratic or simply broad dollar strength. RBI policy, local flows, and oil import demand are common sources of residual risk.",
    latestValue: 0.73,
    previousValue: 0.64,
    zScore: 2.06,
    percentileRank: 93,
    halfLifeDays: 6.6,
    adfPValue: 0.09,
    beta: 0.418,
    lookback: 60,
    entryZ: 2,
    stopZ: 3,
    windowZScores: { days30: 1.84, days60: 2.06, days90: 2.19, stable: true },
    state: "stretched",
    nextEvent: {
      date: "2026-07-23",
      label: "US initial jobless claims",
      daysAway: 2,
      detail: "Dollar-sensitive US labour-market release"
    },
    asOf: AS_OF,
    history: usdinrDxyHistory,
    signals: signalsByPair["usdinr-dxy"],
    dataMode: "seeded-demo"
  }
];

/** Seeded journal examples for layout and interaction testing; not performance claims. */
export const paperTrades: readonly PaperTrade[] = [
  {
    id: "DEMO-001",
    pairSlug: "brent-wti",
    openedOn: "2026-06-22",
    entryValue: 3.69,
    entryZ: -2.12,
    direction: "long_spread",
    stopZ: 3,
    hypothesis:
      "The dislocation looks inventory-led rather than a lasting change in the Brent-WTI transport and quality relationship.",
    status: "closed",
    closedOn: "2026-06-30",
    exitValue: 4.31,
    exitZ: -0.51,
    exitReason: "target",
    pnlPoints: 0.62,
    rMultiple: 1.18,
    postMortem:
      "The move normalised after inventory data; the example is retained only to demonstrate the review workflow.",
    dataMode: "seeded-demo"
  },
  {
    id: "DEMO-002",
    pairSlug: "gold-silver",
    openedOn: "2026-05-28",
    entryValue: 90.24,
    entryZ: 2.05,
    direction: "short_spread",
    stopZ: 3,
    hypothesis:
      "The ratio extension may fade if silver's industrial beta catches up after the macro risk event passes.",
    status: "closed",
    closedOn: "2026-06-06",
    exitValue: 91.23,
    exitZ: 3.01,
    exitReason: "stop",
    pnlPoints: -0.99,
    rMultiple: -1,
    postMortem:
      "Risk-off demand persisted longer than the one-sentence hypothesis allowed for.",
    dataMode: "seeded-demo"
  },
  {
    id: "DEMO-003",
    pairSlug: "nifty-banknifty",
    openedOn: "2026-07-15",
    entryValue: 0.4504,
    entryZ: -2.01,
    direction: "long_spread",
    stopZ: 3,
    hypothesis:
      "The bank-sector discount may be a short-lived reaction to rates rather than a change in credit-cycle expectations.",
    status: "open",
    dataMode: "seeded-demo"
  },
  {
    id: "DEMO-004",
    pairSlug: "usdinr-dxy",
    openedOn: "2026-07-17",
    entryValue: 0.73,
    entryZ: 2.06,
    direction: "short_spread",
    stopZ: 3,
    hypothesis:
      "The residual move may be local-flow driven and could narrow if broad dollar strength does not accelerate.",
    status: "open",
    dataMode: "seeded-demo"
  },
  {
    id: "DEMO-005",
    pairSlug: "brent-wti",
    openedOn: "2026-05-13",
    entryValue: 5.97,
    entryZ: 2.23,
    direction: "short_spread",
    stopZ: 3,
    hypothesis:
      "The premium appears elevated against recent shipping and inventory conditions, with no new physical catalyst identified.",
    status: "closed",
    closedOn: "2026-05-21",
    exitValue: 5.64,
    exitZ: 1.14,
    exitReason: "time",
    pnlPoints: 0.33,
    rMultiple: 0.61,
    postMortem:
      "The example exit uses a time stop to make the journal treatment explicit.",
    dataMode: "seeded-demo"
  }
];

export const deskMeta: DeskMetadata = {
  name: "basis",
  subtitle: "relative value desk",
  dataMode: "seeded-demo",
  sourceLabel: "Seeded demonstration snapshot",
  asOf: AS_OF,
  disclosure:
    "Seeded interface data for product demonstration. It is not a live feed and is not an operator performance record.",
  footerDisclosure:
    "Seeded demonstration figures — no live market feed is connected. EOD settlement data is delayed when connected. Research use only."
};

export const dataIsDemo = true;

export function getSpreadPair(slug: string): SpreadPair | undefined {
  return spreadPairs.find((pair) => pair.slug === slug);
}

export function getPaperTradesForPair(slug: string): readonly PaperTrade[] {
  return paperTrades.filter((trade) => trade.pairSlug === slug);
}

export function getStateFromZScore(zScore: number): SpreadState {
  if (Math.abs(zScore) >= 2) return "stretched";
  if (Math.abs(zScore) >= 1) return "reverting";
  return "normal";
}
