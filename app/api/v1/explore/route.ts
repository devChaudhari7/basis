import { NextResponse } from "next/server";

import { serviceClient } from "@/lib/server/operator";

export const dynamic = "force-dynamic";

const MAX_SESSIONS = 1200;
const LOOKBACK_MIN = 10;
const LOOKBACK_MAX = 250;

type Method = "diff" | "ratio";

interface PricePoint {
  d: string;
  close: number;
}

/** Rolling mean/std over the PRIOR window — today never enters its own
 *  baseline, matching the worker's no-lookahead rule exactly. */
function computeSeries(a: PricePoint[], b: PricePoint[], method: Method, lookback: number) {
  const byDateB = new Map(b.map((row) => [row.d, row.close]));
  const joined: { d: string; v: number }[] = [];

  for (const row of a) {
    const other = byDateB.get(row.d);
    if (other === undefined) continue; // inner join; holidays are never filled
    if (method === "ratio" && other === 0) continue;
    const value = method === "diff" ? row.close - other : row.close / other;
    if (Number.isFinite(value)) joined.push({ d: row.d, v: value });
  }

  const points = joined.map((point, index) => {
    if (index < lookback) return { ...point, m: null, s: null, z: null };
    const window = joined.slice(index - lookback, index).map((item) => item.v);
    const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
    const variance =
      window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (window.length - 1);
    const sd = Math.sqrt(variance);
    return {
      ...point,
      m: mean,
      s: sd,
      z: sd > 0 ? (point.v - mean) / sd : null
    };
  });

  return points;
}

/**
 * Compute an arbitrary spread between any two seeded instruments.
 *
 * This is exploration, not the monitored desk: there is no roll-suspect
 * filtering, no ADF test, no half-life, and no economic rationale behind the
 * combination. Any two series can be divided; that does not make the result a
 * relationship. The response says so, and the UI repeats it.
 */
export async function GET(request: Request) {
  const client = serviceClient();
  if (!client) {
    return NextResponse.json({ error: "Live database not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const symbolA = url.searchParams.get("a");
  const symbolB = url.searchParams.get("b");
  const method = (url.searchParams.get("method") ?? "ratio") as Method;
  const lookbackRaw = Number(url.searchParams.get("lookback") ?? 60);
  const lookback = Number.isFinite(lookbackRaw)
    ? Math.max(LOOKBACK_MIN, Math.min(LOOKBACK_MAX, Math.trunc(lookbackRaw)))
    : 60;

  if (!symbolA || !symbolB) {
    return NextResponse.json({ error: "Both a and b symbols are required." }, { status: 422 });
  }
  if (symbolA === symbolB) {
    return NextResponse.json({ error: "Pick two different instruments." }, { status: 422 });
  }
  if (method !== "diff" && method !== "ratio") {
    return NextResponse.json({ error: "method must be diff or ratio." }, { status: 422 });
  }

  const instruments = await client
    .from("instruments")
    .select("id,symbol,name,unit,venue")
    .in("symbol", [symbolA, symbolB]);
  const rows = instruments.data ?? [];
  const legA = rows.find((row) => row.symbol === symbolA);
  const legB = rows.find((row) => row.symbol === symbolB);
  if (!legA || !legB) {
    return NextResponse.json({ error: "Unknown instrument symbol." }, { status: 404 });
  }

  const [pricesA, pricesB] = await Promise.all([
    client
      .from("prices")
      .select("d,close")
      .eq("instrument_id", legA.id)
      .order("d", { ascending: false })
      .limit(MAX_SESSIONS),
    client
      .from("prices")
      .select("d,close")
      .eq("instrument_id", legB.id)
      .order("d", { ascending: false })
      .limit(MAX_SESSIONS)
  ]);

  const seriesA = ((pricesA.data ?? []) as { d: string; close: unknown }[])
    .map((row) => ({ d: row.d, close: Number(row.close) }))
    .filter((row) => Number.isFinite(row.close))
    .reverse();
  const seriesB = ((pricesB.data ?? []) as { d: string; close: unknown }[])
    .map((row) => ({ d: row.d, close: Number(row.close) }))
    .filter((row) => Number.isFinite(row.close))
    .reverse();

  const series = computeSeries(seriesA, seriesB, method, lookback);
  if (series.length === 0) {
    return NextResponse.json({ error: "No overlapping sessions for these two." }, { status: 409 });
  }
  const latest = series[series.length - 1];

  return NextResponse.json(
    {
      legA: { symbol: legA.symbol, name: legA.name, unit: legA.unit, venue: legA.venue },
      legB: { symbol: legB.symbol, name: legB.name, unit: legB.unit, venue: legB.venue },
      method,
      lookback,
      sessions: series.length,
      latest,
      series: series.slice(-500),
      caveat:
        "Exploratory only. No roll-gap filtering, no stationarity test, no half-life, and no economic rationale. Any two series can be divided; that does not make the result a tradeable relationship.",
      monitored: false
    },
    { headers: { "Cache-Control": "public, s-maxage=900" } }
  );
}
