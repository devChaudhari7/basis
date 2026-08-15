/**
 * Server-side data access with two honest modes:
 *
 *  - "live": Supabase is configured; read the worker-maintained tables through
 *    the anon key (RLS read policies). Paper trades come from the database.
 *  - "snapshot": no Supabase environment; serve lib/snapshot/desk.json, which
 *    the worker computed from real Yahoo EOD settlement data. There are no
 *    trades in snapshot mode — a track record starts only when the operator
 *    logs real entries against a live database.
 *
 * Nothing in this module invents a number. Import only from server code.
 */

import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import snapshotJson from "@/lib/snapshot/desk.json";
import { pairMeta } from "@/lib/pair-meta";
import type {
  DataSourceMode,
  DeskData,
  EventMark,
  EventSource,
  InstrumentLeg,
  Pair,
  PairCorrelation,
  PairLatest,
  PaperTrade,
  SeriesPoint,
  SignalDiagnostic,
  SignalMark,
  Stability,
  StructuralBreak,
  TradeDirection,
  TradeExitReason,
  TradesData,
  UpcomingEvent
} from "@/lib/types";

const SERIES_SESSIONS = 480;
const MAX_SIGNALS = 12;
/** Sessions of the estimation window; a break inside it invalidates the mean. */
const ESTIMATION_WINDOW_DAYS = 90;

interface EventRow {
  d: string;
  label: string;
  affects: readonly string[];
  source?: string | null;
}

/** Past events that fall within the charted series window. */
function eventMarksFor(
  slug: string,
  events: readonly EventRow[],
  series: readonly SeriesPoint[]
): EventMark[] {
  if (series.length === 0) return [];
  const first = series[0].d;
  const last = series[series.length - 1].d;
  return events
    .filter((event) => event.affects.includes(slug) && event.d >= first && event.d <= last)
    .map((event) => ({
      d: event.d,
      label: event.label,
      source: (event.source as EventSource) ?? null
    }))
    .sort((a, b) => a.d.localeCompare(b.d));
}

/** Does a detected break sit inside the window the current z-score uses? */
function breakInsideWindow(
  breaks: readonly StructuralBreak[],
  series: readonly SeriesPoint[]
): boolean {
  if (series.length === 0 || breaks.length === 0) return false;
  const cutoffIndex = Math.max(0, series.length - ESTIMATION_WINDOW_DAYS);
  const cutoff = series[cutoffIndex].d;
  const latest = series[series.length - 1].d;
  return breaks.some((item) => item.d >= cutoff && item.d <= latest);
}

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

function supabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

export function dataMode(): DataSourceMode {
  return supabaseUrl() && supabaseAnonKey() ? "live" : "snapshot";
}

function anonClient(): SupabaseClient {
  return createClient(supabaseUrl() ?? "", supabaseAnonKey() ?? "", {
    auth: { persistSession: false }
  });
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function nextEventFor(slug: string, events: readonly EventRow[]): UpcomingEvent | null {
  const today = todayIso();
  const upcoming = events
    .filter((event) => event.affects.includes(slug) && event.d >= today)
    .sort((a, b) => a.d.localeCompare(b.d));
  if (upcoming.length === 0) return null;
  return {
    d: upcoming[0].d,
    label: upcoming[0].label,
    daysAway: daysBetween(today, upcoming[0].d),
    source: (upcoming[0].source as EventSource) ?? null
  };
}

/* ── snapshot mode ─────────────────────────────────────────────────── */

interface SnapshotShape {
  generatedAt: string;
  asOf: string;
  events: readonly EventRow[];
  correlations?: readonly Record<string, unknown>[];
  pairs: readonly {
    slug: string;
    displayName: string;
    method: string;
    unit: string;
    lookback: number;
    entryZ: number;
    stopZ: number;
    rationale: string;
    legs: readonly InstrumentLeg[];
    latest: Record<string, unknown>;
    series: readonly Record<string, unknown>[];
    signals: readonly Record<string, unknown>[];
    diagnostics?: readonly Record<string, unknown>[];
    breaks?: readonly Record<string, unknown>[];
  }[];
}

function snapshotLatest(raw: Record<string, unknown>): PairLatest {
  return {
    d: String(raw.d ?? ""),
    value: toNumber(raw.value) ?? 0,
    prevValue: toNumber(raw.prevValue),
    mean60: toNumber(raw.mean60),
    std60: toNumber(raw.std60),
    z: toNumber(raw.z),
    z30: toNumber(raw.z30),
    z90: toNumber(raw.z90),
    stability: (raw.stability as Stability) ?? "insufficient_data",
    pctRank: toNumber(raw.pctRank),
    halfLife: toNumber(raw.halfLife),
    adfP: toNumber(raw.adfP),
    beta: toNumber(raw.beta),
    rollSuspect: Boolean(raw.rollSuspect)
  };
}

function snapshotDesk(): DeskData {
  const snapshot = snapshotJson as unknown as SnapshotShape;
  const pairs: Pair[] = snapshot.pairs.map((pair) => {
    const series = pair.series.map(
      (point): SeriesPoint => ({
        d: String(point.d),
        v: toNumber(point.v) ?? 0,
        m: toNumber(point.m),
        s: toNumber(point.s),
        z: toNumber(point.z),
        roll: Boolean(point.roll)
      })
    );
    const breaks = (pair.breaks ?? []).map(
      (item): StructuralBreak => ({
        d: String(item.d),
        shift: toNumber(item.shift) ?? 0,
        tStat: toNumber(item.tStat) ?? 0
      })
    );

    return {
      id: null,
      slug: pair.slug,
      displayName: pair.displayName,
      method: pair.method as Pair["method"],
      unit: pair.unit,
      lookback: pair.lookback,
      entryZ: pair.entryZ,
      stopZ: pair.stopZ,
      rationale: pair.rationale,
      legs: [pair.legs[0], pair.legs[1]] as const,
      latest: snapshotLatest(pair.latest),
      series,
      signals: pair.signals.map(
        (signal): SignalMark => ({
          d: String(signal.d),
          z: toNumber(signal.z) ?? 0,
          direction: signal.direction as TradeDirection,
          fwd5: toNumber(signal.fwd5),
          fwd10: toNumber(signal.fwd10),
          fwd20: toNumber(signal.fwd20),
          mae20: toNumber(signal.mae20)
        })
      ),
      nextEvent: nextEventFor(pair.slug, snapshot.events),
      diagnostics: (pair.diagnostics ?? []).map(
        (row): SignalDiagnostic => ({
          horizon: toNumber(row.horizon) ?? 0,
          n: toNumber(row.n) ?? 0,
          hitRate: toNumber(row.hit_rate) ?? 0,
          medianMove: toNumber(row.median_move) ?? 0,
          p25: toNumber(row.p25) ?? 0,
          p75: toNumber(row.p75) ?? 0,
          medianMae: toNumber(row.median_mae) ?? 0,
          worst: toNumber(row.worst) ?? 0
        })
      ),
      breaks,
      events: eventMarksFor(pair.slug, snapshot.events, series),
      breakInWindow: breakInsideWindow(breaks, series)
    };
  });

  return {
    mode: "snapshot",
    asOf: snapshot.asOf,
    generatedAt: snapshot.generatedAt,
    pairs,
    correlations: (snapshot.correlations ?? []).map(
      (row): PairCorrelation => ({
        pairA: String(row.pair_a),
        pairB: String(row.pair_b),
        corr: toNumber(row.corr) ?? 0,
        n: toNumber(row.n) ?? 0,
        windowSessions: toNumber(row.window_sessions) ?? 0
      })
    )
  };
}

/* ── live mode ─────────────────────────────────────────────────────── */

interface PairRow {
  id: number;
  slug: string;
  leg_a: number;
  leg_b: number;
  method: string;
  lookback: number;
  entry_z: unknown;
  stop_z: unknown;
  rationale: string;
}

interface SpreadDailyRow {
  d: string;
  value: unknown;
  mean_60: unknown;
  std_60: unknown;
  z: unknown;
  pct_rank_252: unknown;
  half_life: unknown;
  beta: unknown;
  roll_suspect: boolean;
  adf_p: unknown;
  z_30: unknown;
  z_90: unknown;
  stability: string | null;
}

function liveSeriesPoint(row: SpreadDailyRow): SeriesPoint {
  return {
    d: row.d,
    v: toNumber(row.value) ?? 0,
    m: toNumber(row.mean_60),
    s: toNumber(row.std_60),
    z: toNumber(row.z),
    roll: Boolean(row.roll_suspect)
  };
}

function liveLatest(rows: readonly SpreadDailyRow[]): PairLatest | null {
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  return {
    d: latest.d,
    value: toNumber(latest.value) ?? 0,
    prevValue: previous ? toNumber(previous.value) : null,
    mean60: toNumber(latest.mean_60),
    std60: toNumber(latest.std_60),
    z: toNumber(latest.z),
    z30: toNumber(latest.z_30),
    z90: toNumber(latest.z_90),
    stability: (latest.stability as Stability) ?? "insufficient_data",
    pctRank: toNumber(latest.pct_rank_252),
    halfLife: toNumber(latest.half_life),
    adfP: toNumber(latest.adf_p),
    beta: toNumber(latest.beta),
    rollSuspect: Boolean(latest.roll_suspect)
  };
}

async function liveDesk(): Promise<DeskData> {
  const client = anonClient();

  const [pairsResult, eventsResult, correlationsResult] = await Promise.all([
    client.from("pairs").select("*").order("id"),
    client.from("events").select("d,label,affects,source"),
    client.from("spread_correlations").select("pair_a,pair_b,corr,n,window_sessions")
  ]);
  if (pairsResult.error) throw new Error(`pairs query failed: ${pairsResult.error.message}`);
  const pairRows = (pairsResult.data ?? []) as PairRow[];
  const events = ((eventsResult.data ?? []) as EventRow[]).map((event) => ({
    ...event,
    affects: event.affects ?? []
  }));

  const legIds = [...new Set(pairRows.flatMap((row) => [row.leg_a, row.leg_b]))];
  const instrumentsResult = await client
    .from("instruments")
    .select("id,symbol,name,venue")
    .in("id", legIds);
  if (instrumentsResult.error) {
    throw new Error(`instruments query failed: ${instrumentsResult.error.message}`);
  }
  const instrumentById = new Map<number, InstrumentLeg>(
    (instrumentsResult.data ?? []).map((row) => [
      Number(row.id),
      { symbol: String(row.symbol), name: String(row.name), venue: String(row.venue ?? "") }
    ])
  );

  const pairs = await Promise.all(
    pairRows.map(async (row): Promise<Pair | null> => {
      const [seriesResult, signalsResult, diagnosticsResult, breaksResult] = await Promise.all([
        client
          .from("spread_daily")
          .select("d,value,mean_60,std_60,z,pct_rank_252,half_life,beta,roll_suspect,adf_p,z_30,z_90,stability")
          .eq("pair_id", row.id)
          .order("d", { ascending: false })
          .limit(SERIES_SESSIONS),
        client
          .from("signals")
          .select("d,z,direction,fwd_5,fwd_10,fwd_20,mae_20")
          .eq("pair_id", row.id)
          .order("d", { ascending: false })
          .limit(MAX_SIGNALS),
        client
          .from("signal_diagnostics")
          .select("horizon,n,hit_rate,median_move,p25,p75,median_mae,worst")
          .eq("pair_id", row.id)
          .order("horizon"),
        client.from("structural_breaks").select("d,shift,t_stat").eq("pair_id", row.id).order("d")
      ]);
      if (seriesResult.error) {
        throw new Error(`spread_daily query failed: ${seriesResult.error.message}`);
      }
      const seriesRows = ((seriesResult.data ?? []) as SpreadDailyRow[]).reverse();
      const latest = liveLatest(seriesRows);
      if (!latest) return null;

      const meta = pairMeta(row.slug);
      const legA = instrumentById.get(row.leg_a);
      const legB = instrumentById.get(row.leg_b);
      if (!legA || !legB) return null;

      const series = seriesRows.map(liveSeriesPoint);
      const breaks = ((breaksResult.data ?? []) as { d: string; shift: unknown; t_stat: unknown }[]).map(
        (item): StructuralBreak => ({
          d: item.d,
          shift: toNumber(item.shift) ?? 0,
          tStat: toNumber(item.t_stat) ?? 0
        })
      );

      return {
        id: row.id,
        slug: row.slug,
        displayName: meta.displayName ?? row.slug.toUpperCase(),
        method: row.method as Pair["method"],
        unit: unitForPair(row.method as Pair["method"], legA, legB),
        lookback: Number(row.lookback ?? 60),
        entryZ: toNumber(row.entry_z) ?? 2,
        stopZ: toNumber(row.stop_z) ?? 3,
        rationale: row.rationale,
        legs: [legA, legB] as const,
        latest,
        series,
        signals: (
          (signalsResult.data ?? []) as {
            d: string;
            z: unknown;
            direction: string;
            fwd_5: unknown;
            fwd_10: unknown;
            fwd_20: unknown;
            mae_20: unknown;
          }[]
        )
          .reverse()
          .map((signal) => ({
            d: signal.d,
            z: toNumber(signal.z) ?? 0,
            direction: signal.direction as TradeDirection,
            fwd5: toNumber(signal.fwd_5),
            fwd10: toNumber(signal.fwd_10),
            fwd20: toNumber(signal.fwd_20),
            mae20: toNumber(signal.mae_20)
          })),
        nextEvent: nextEventFor(row.slug, events),
        diagnostics: (
          (diagnosticsResult.data ?? []) as Record<string, unknown>[]
        ).map((item) => ({
          horizon: toNumber(item.horizon) ?? 0,
          n: toNumber(item.n) ?? 0,
          hitRate: toNumber(item.hit_rate) ?? 0,
          medianMove: toNumber(item.median_move) ?? 0,
          p25: toNumber(item.p25) ?? 0,
          p75: toNumber(item.p75) ?? 0,
          medianMae: toNumber(item.median_mae) ?? 0,
          worst: toNumber(item.worst) ?? 0
        })),
        breaks,
        events: eventMarksFor(row.slug, events, series),
        breakInWindow: breakInsideWindow(breaks, series)
      };
    })
  );

  const usable = pairs.filter((pair): pair is Pair => pair !== null);
  const asOf = usable.reduce((latest, pair) => (pair.latest.d > latest ? pair.latest.d : latest), "");
  const slugById = new Map(pairRows.map((row) => [row.id, row.slug]));
  const correlations = (
    (correlationsResult.data ?? []) as Record<string, unknown>[]
  ).flatMap((item): PairCorrelation[] => {
    const slugA = slugById.get(Number(item.pair_a));
    const slugB = slugById.get(Number(item.pair_b));
    if (!slugA || !slugB) return [];
    return [
      {
        pairA: slugA,
        pairB: slugB,
        corr: toNumber(item.corr) ?? 0,
        n: toNumber(item.n) ?? 0,
        windowSessions: toNumber(item.window_sessions) ?? 0
      }
    ];
  });

  return {
    mode: "live",
    asOf: asOf || todayIso(),
    generatedAt: null,
    pairs: usable,
    correlations
  };
}

/** Units live on instruments in the DB; for a ratio/beta pair the spread unit
 *  is derived rather than stored. */
function unitForPair(method: Pair["method"], legA: InstrumentLeg, legB: InstrumentLeg): string {
  if (method === "ratio") return "x";
  if (method === "beta") return "resid pts";
  void legB;
  // Difference spreads share the unit of their legs (e.g. USD/bbl).
  return legA.symbol === "BZ=F" ? "USD/bbl" : "points";
}

/* ── public API ────────────────────────────────────────────────────── */

export const getDesk = cache(async (): Promise<DeskData> => {
  if (dataMode() === "live") {
    try {
      const desk = await liveDesk();
      if (desk.pairs.length > 0) return desk;
      // A configured but never-populated database falls back to the snapshot
      // rather than rendering an empty desk that looks like an outage.
      return snapshotDesk();
    } catch (error) {
      console.error("Live desk unavailable, serving snapshot:", error);
      return snapshotDesk();
    }
  }
  return snapshotDesk();
});

export async function getPair(slug: string): Promise<Pair | null> {
  const desk = await getDesk();
  return desk.pairs.find((pair) => pair.slug === slug) ?? null;
}

/** Entry-day risk in spread points: (stop_z − |entry_z|) × σ₆₀ at entry. */
export function riskPoints(entryZ: number, stopZ: number, sigmaAtEntry: number | null): number | null {
  if (sigmaAtEntry === null || !Number.isFinite(sigmaAtEntry)) return null;
  const distance = (stopZ - Math.abs(entryZ)) * sigmaAtEntry;
  return distance > 0 ? distance : null;
}

interface TradeRow {
  id: number;
  pair_id: number;
  opened_on: string;
  entry_value: unknown;
  entry_z: unknown;
  direction: string;
  stop_z: unknown;
  hypothesis: string;
  closed_on: string | null;
  exit_value: unknown;
  exit_z: unknown;
  exit_reason: string | null;
  pnl_points: unknown;
  r_multiple: unknown;
  post_mortem: string | null;
}

export const getTrades = cache(async (): Promise<TradesData> => {
  if (dataMode() !== "live") {
    return { mode: "snapshot", trades: [] };
  }
  const client = anonClient();
  const desk = await getDesk();
  if (desk.mode !== "live") return { mode: "snapshot", trades: [] };

  const result = await client.from("paper_trades").select("*").order("opened_on", { ascending: false });
  if (result.error) {
    console.error("paper_trades query failed:", result.error.message);
    return { mode: "live", trades: [] };
  }

  const pairById = new Map(desk.pairs.map((pair) => [pair.id ?? -1, pair]));
  const trades = await Promise.all(
    ((result.data ?? []) as TradeRow[]).map(async (row): Promise<PaperTrade> => {
      const pair = pairById.get(row.pair_id);
      const entryZ = toNumber(row.entry_z) ?? 0;
      const stopZ = toNumber(row.stop_z) ?? 0;
      const entryValue = toNumber(row.entry_value) ?? 0;

      let liveR: number | null = null;
      if (!row.closed_on && pair) {
        const sigmaResult = await client
          .from("spread_daily")
          .select("std_60")
          .eq("pair_id", row.pair_id)
          .lte("d", row.opened_on)
          .order("d", { ascending: false })
          .limit(1);
        const sigma = toNumber(sigmaResult.data?.[0]?.std_60);
        const risk = riskPoints(entryZ, stopZ, sigma);
        if (risk !== null) {
          const sign = row.direction === "short_spread" ? -1 : 1;
          liveR = (sign * (pair.latest.value - entryValue)) / risk;
        }
      }

      return {
        id: row.id,
        pairSlug: pair?.slug ?? String(row.pair_id),
        openedOn: row.opened_on,
        entryValue,
        entryZ,
        direction: row.direction as TradeDirection,
        stopZ,
        hypothesis: row.hypothesis,
        closedOn: row.closed_on,
        exitValue: toNumber(row.exit_value),
        exitZ: toNumber(row.exit_z),
        exitReason: (row.exit_reason as TradeExitReason) ?? null,
        pnlPoints: toNumber(row.pnl_points),
        rMultiple: toNumber(row.r_multiple),
        postMortem: row.post_mortem,
        liveR
      };
    })
  );
  return { mode: "live", trades };
});
