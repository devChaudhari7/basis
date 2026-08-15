import { NextResponse } from "next/server";

import { getBotState, getDesk } from "@/lib/datasource";
import { getSpreadState } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Everything the desk's live strip polls: current readings plus the bot's
 *  most recent decisions. One request so a poll is one round-trip. */
export async function GET() {
  const [desk, bot] = await Promise.all([getDesk(), getBotState()]);
  const nameBySlug = new Map(desk.pairs.map((pair) => [pair.slug, pair.displayName]));

  return NextResponse.json(
    {
      asOf: desk.asOf,
      servedAt: new Date().toISOString(),
      readings: desk.pairs.map((pair) => ({
        slug: pair.slug,
        name: pair.displayName,
        value: pair.latest.value,
        z: pair.latest.z,
        state: getSpreadState(pair.latest.z, pair.series, pair.entryZ)
      })),
      activity: bot.decisions.slice(0, 12).map((decision) => ({
        d: decision.d,
        slug: decision.pairSlug,
        name: nameBySlug.get(decision.pairSlug) ?? decision.pairSlug,
        action: decision.action,
        reason: decision.reason,
        z: decision.z
      }))
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
