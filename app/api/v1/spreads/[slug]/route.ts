import { NextResponse } from "next/server";

import { getPair } from "@/lib/datasource";
import { getSpreadState } from "@/lib/utils";

export const revalidate = 900;

const MAX_SERIES = 500;

/** One spread in full: current statistics, history, signals with outcomes,
 *  detected structural breaks, and the diagnostics of the screen itself. */
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const pair = await getPair(params.slug);
  if (!pair) {
    return NextResponse.json(
      { error: `Unknown spread: ${params.slug}` },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("sessions"));
  const sessions = Number.isFinite(requested)
    ? Math.max(1, Math.min(MAX_SERIES, Math.trunc(requested)))
    : 120;

  return NextResponse.json(
    {
      slug: pair.slug,
      name: pair.displayName,
      method: pair.method,
      unit: pair.unit,
      rationale: pair.rationale,
      legs: pair.legs,
      lookback: pair.lookback,
      entryZ: pair.entryZ,
      stopZ: pair.stopZ,
      disclaimer:
        "Research data. Descriptive statistics on delayed EOD settlement prices. Not a forecast and not investment advice.",
      latest: {
        ...pair.latest,
        state: getSpreadState(pair.latest.z, pair.series, pair.entryZ),
        estimationWindowSpansBreak: pair.breakInWindow
      },
      diagnostics: pair.diagnostics,
      structuralBreaks: pair.breaks,
      signals: pair.signals,
      nextEvent: pair.nextEvent,
      series: pair.series.slice(-sessions)
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
      }
    }
  );
}
