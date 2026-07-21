import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import type {
  PaperTrade,
  PerformanceMetrics,
  SpreadMethod,
  SpreadPair,
  SpreadState,
  TradeDirection,
  TradeExitReason
} from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (!isFiniteNumber(value)) return "—";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

export function formatSigned(value: number | null | undefined, decimals = 2): string {
  if (!isFiniteNumber(value)) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value, decimals)}`;
}

export function formatZScore(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${formatSigned(value, 2)}σ` : "—";
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  return isFiniteNumber(value) ? `${formatNumber(value, decimals)}%` : "—";
}

export function formatPValue(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `p = ${value.toFixed(2)}` : "—";
}

export function formatR(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${formatSigned(value, 2)}R` : "—";
}

export function formatOrdinal(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  const rounded = Math.round(value);
  const remainder = rounded % 100;
  const suffix =
    remainder >= 11 && remainder <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[rounded % 10] ?? "th");
  return `${rounded}${suffix}`;
}

export function formatDate(
  isoDate: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
): string {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(date);
}

export function formatSpreadValue(pair: Pick<SpreadPair, "decimals" | "unit">, value: number): string {
  return `${formatNumber(value, pair.decimals)} ${pair.unit}`;
}

export function getSpreadState(zScore: number): SpreadState {
  if (Math.abs(zScore) >= 2) return "stretched";
  if (Math.abs(zScore) >= 1) return "reverting";
  return "normal";
}

export const spreadStateLabel: Record<SpreadState, string> = {
  stretched: "STRETCHED",
  normal: "NORMAL",
  reverting: "REVERTING"
};

export const spreadStateClass: Record<SpreadState, string> = {
  stretched: "text-red border-red/30 bg-red/[0.08]",
  normal: "text-green border-green/30 bg-green/[0.08]",
  reverting: "text-amber border-amber/30 bg-amber/[0.08]"
};

export const methodLabel: Record<SpreadMethod, string> = {
  difference: "Difference",
  ratio: "Ratio",
  "beta-adjusted": "Beta-adjusted"
};

export const directionLabel: Record<TradeDirection, string> = {
  long_spread: "Long spread",
  short_spread: "Short spread"
};

export const exitReasonLabel: Record<TradeExitReason, string> = {
  target: "Target",
  stop: "Stop",
  time: "Time",
  manual: "Manual"
};

export function getWindowStability(
  values: Pick<SpreadPair["windowZScores"], "days30" | "days60" | "days90">
): boolean {
  const windowValues = [values.days30, values.days60, values.days90];
  return Math.max(...windowValues) - Math.min(...windowValues) <= 0.75;
}

export function calculatePerformance(trades: readonly PaperTrade[]): PerformanceMetrics {
  const openTrades = trades.filter((trade) => trade.status === "open");
  const settledTrades = [...trades]
    .filter(
      (trade): trade is PaperTrade & { rMultiple: number; closedOn: string } =>
        trade.status === "closed" && isFiniteNumber(trade.rMultiple) && Boolean(trade.closedOn)
    )
    .sort((left, right) => left.closedOn.localeCompare(right.closedOn));

  const wins = settledTrades.filter((trade) => trade.rMultiple > 0);
  const losses = settledTrades.filter((trade) => trade.rMultiple < 0);
  const breakeven = settledTrades.filter((trade) => trade.rMultiple === 0);
  const hitRate = settledTrades.length > 0 ? (wins.length / settledTrades.length) * 100 : null;
  const averageWinR =
    wins.length > 0
      ? wins.reduce((total, trade) => total + trade.rMultiple, 0) / wins.length
      : null;
  const averageLossR =
    losses.length > 0
      ? Math.abs(losses.reduce((total, trade) => total + trade.rMultiple, 0) / losses.length)
      : null;
  const winRate = hitRate === null ? null : hitRate / 100;
  const expectancyR =
    winRate === null || averageWinR === null || averageLossR === null
      ? null
      : winRate * averageWinR - (1 - winRate) * averageLossR;

  let cumulativeR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  let currentLosingStreak = 0;
  let longestLosingStreak = 0;

  const equityCurve = settledTrades.map((trade, index) => {
    cumulativeR += trade.rMultiple;
    peakR = Math.max(peakR, cumulativeR);
    maxDrawdownR = Math.max(maxDrawdownR, peakR - cumulativeR);

    if (trade.rMultiple < 0) {
      currentLosingStreak += 1;
      longestLosingStreak = Math.max(longestLosingStreak, currentLosingStreak);
    } else {
      currentLosingStreak = 0;
    }

    return {
      index: index + 1,
      tradeId: trade.id,
      date: trade.closedOn,
      rMultiple: trade.rMultiple,
      cumulativeR
    };
  });

  return {
    settledTrades: settledTrades.length,
    openTrades: openTrades.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    hitRate,
    averageWinR,
    averageLossR,
    expectancyR,
    maxDrawdownR,
    longestLosingStreak,
    equityCurve
  };
}
