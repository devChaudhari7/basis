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
  InstrumentLeg,
  Pair,
  PairLatest,
  PaperTrade,
  SeriesPoint,
  SignalMark,
  Stability,
  TradeDirection,
  TradeExitReason,
  TradesData,
  UpcomingEvent
} from "@/lib/types";

const SERIES_SESSIONS = 480;
const MAX_SIGNALS = 12;

interface EventRow {
  d: string;
  label: string;
  affects: readonly string[];
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
  return { d: upcoming[0].d, label: upcoming[0].label, daysAway: daysBetween(today, upcoming[0].d) };
}

/* ── snapshot mode ─────────────────────────────────────────────────── */

interface SnapshotShape {
  generatedAt: string;
  asOf: string;
  events: readonly EventRow[];
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
  const pairs: Pair[] = snapshot.pairs.map((pair) => ({
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
    series: pair.series.map(
      (point): SeriesPoint => ({
        d: String(point.d),
        v: toNumber(point.v) ?? 0,
        m: toNumber(point.m),
        s: toNumber(point.s),
        z: toNumber(point.z),
        roll: Boolean(point.roll)
      })
    ),
    signals: pair.signals.map(
      (signal): SignalMark => ({
        d: String(signal.d),
        z: toNumber(signal.z) ?? 0,
        direction: signal.direction as TradeDirection
      })
    ),
    nextEvent: nextEventFor(pair.slug, snapshot.events)
  }));

  return {
    mode: "snapshot",
    asOf: snapshot.asOf,
    generatedAt: snapshot.generatedAt,
    pairs
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

  const [pairsResult, eventsResult] = await Promise.all([
    client.from("pairs").select("*").order("id"),
    client.from("events").select("d,label,affects")
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
      const [seriesResult, signalsResult] = await Promise.all([
        client
          .from("spread_daily")
          .select("d,value,mean_60,std_60,z,pct_rank_252,half_life,beta,roll_suspect,adf_p,z_30,z_90,stability")
          .eq("pair_id", row.id)
          .order("d", { ascending: false })
          .limit(SERIES_SESSIONS),
        client
          .from("signals")
          .select("d,z,direction")
          .eq("pair_id", row.id)
          .order("d", { ascending: false })
          .limit(MAX_SIGNALS)
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

      return {
        id: row.id,
        slug: row.slug,
        displayName: meta.displayName ?? row.slug.toUpperCase().replace(/-/g, "-"),
        method: row.method as Pair["method"],
        unit: unitForPair(row.method as Pair["method"], legA, legB),
        lookback: Number(row.lookback ?? 60),
        entryZ: toNumber(row.entry_z) ?? 2,
        stopZ: toNumber(row.stop_z) ?? 3,
        rationale: row.rationale,
        legs: [legA, legB] as const,
        latest,
        series: seriesRows.map(liveSeriesPoint),
        signals: ((signalsResult.data ?? []) as { d: string; z: unknown; direction: string }[])
          .reverse()
          .map((signal) => ({
            d: signal.d,
            z: toNumber(signal.z) ?? 0,
            direction: signal.direction as TradeDirection
          })),
        nextEvent: nextEventFor(row.slug, events)
      };
    })
  );

  const usable = pairs.filter((pair): pair is Pair => pair !== null);
  const asOf = usable.reduce((latest, pair) => (pair.latest.d > latest ? pair.latest.d : latest), "");
  return { mode: "live", asOf: asOf || todayIso(), generatedAt: null, pairs: usable };
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
