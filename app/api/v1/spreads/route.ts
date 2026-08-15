import { NextResponse } from "next/server";

import { getDesk } from "@/lib/datasource";
import { getSpreadState } from "@/lib/utils";

export const revalidate = 900;

/**
 * Public read API: every monitored spread's current statistics.
 *
 * Open on purpose — the data is EOD, delayed, and published as research. The
 * disclaimer travels with the payload so a consumer cannot accidentally strip
 * the context and present these numbers as tradeable signals.
 */
export async function GET() {
  const desk = await getDesk();

  return NextResponse.json(
    {
      asOf: desk.asOf,
      source: "Yahoo Finance EOD settlement, delayed and settlement-approximate",
      disclaimer:
        "Research data. No price prediction, no investment advice, no execution. Statistics are computed with no lookahead and exclude roll-suspect sessions.",
      count: desk.pairs.length,
      spreads: desk.pairs.map((pair) => ({
        slug: pair.slug,
        name: pair.displayName,
        method: pair.method,
        unit: pair.unit,
        legs: pair.legs.map((leg) => ({ symbol: leg.symbol, name: leg.name, venue: leg.venue })),
        asOf: pair.latest.d,
        value: pair.latest.value,
        z: pair.latest.z,
        zWindows: { d30: pair.latest.z30, d60: pair.latest.z, d90: pair.latest.z90 },
        stability: pair.latest.stability,
        percentile1y: pair.latest.pctRank,
        halfLifeSessions: pair.latest.halfLife,
        adfPValue: pair.latest.adfP,
        beta: pair.latest.beta,
        rollSuspect: pair.latest.rollSuspect,
        state: getSpreadState(pair.latest.z, pair.series, pair.entryZ),
        estimationWindowSpansBreak: pair.breakInWindow,
        entryZ: pair.entryZ,
        stopZ: pair.stopZ,
        url: `/s/${pair.slug}`
      }))
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
      }
    }
  );
}
