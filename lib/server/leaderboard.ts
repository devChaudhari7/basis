import { createHash } from "node:crypto";

import { serviceClient } from "@/lib/server/operator";
import type { LeaderboardRow } from "@/lib/types";

/** Minimum settled trades before a book is ranked at all: three lucky trades
 *  are not a track record, and ranking them would teach the wrong lesson. */
export const MIN_RANKED_TRADES = 5;

/** Stable, non-reversible handle. User ids and emails never leave the server. */
function handleFor(userId: string): string {
  return `desk-${createHash("sha256").update(userId).digest("hex").slice(0, 6)}`;
}

interface Row {
  owner_id: string | null;
  source: string | null;
  r_multiple: unknown;
  closed_on: string | null;
}

function summarise(
  handle: string,
  isMachine: boolean,
  rMultiples: number[]
): LeaderboardRow {
  const wins = rMultiples.filter((value) => value > 0);
  const losses = rMultiples.filter((value) => value < 0);
  const hitRate = rMultiples.length > 0 ? (wins.length / rMultiples.length) * 100 : null;
  const averageWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const averageLoss =
    losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const winRate = hitRate === null ? null : hitRate / 100;

  return {
    handle,
    isMachine,
    settled: rMultiples.length,
    hitRate,
    expectancyR: winRate === null ? null : winRate * averageWin - (1 - winRate) * averageLoss,
    totalR: rMultiples.reduce((a, b) => a + b, 0)
  };
}

/**
 * Rank the mechanical book against every user's paper book.
 *
 * Uses the service key deliberately: RLS correctly hides one user's trades
 * from another, but an aggregate leaderboard needs to read across all of them.
 * Only anonymised aggregates leave this function — never an id, email, or an
 * individual trade.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const client = serviceClient();
  if (!client) return [];

  const result = await client
    .from("paper_trades")
    .select("owner_id,source,r_multiple,closed_on")
    .not("closed_on", "is", null);
  if (result.error) {
    console.error("leaderboard query failed:", result.error.message);
    return [];
  }

  const byBook = new Map<string, { isMachine: boolean; values: number[] }>();
  for (const row of (result.data ?? []) as Row[]) {
    const value = Number(row.r_multiple);
    if (!Number.isFinite(value)) continue;

    const isMachine = row.source === "auto";
    const key = isMachine ? "__machine__" : row.owner_id ?? "__operator__";
    const entry = byBook.get(key) ?? { isMachine, values: [] };
    entry.values.push(value);
    byBook.set(key, entry);
  }

  const rows: LeaderboardRow[] = [];
  for (const [key, entry] of byBook) {
    if (entry.values.length < MIN_RANKED_TRADES) continue;
    const handle =
      key === "__machine__"
        ? "the machine"
        : key === "__operator__"
          ? "the operator"
          : handleFor(key);
    rows.push(summarise(handle, entry.isMachine, entry.values));
  }

  // Expectancy ranks above raw total R: a big number from one lucky trade is
  // not a better process than a steady edge.
  return rows.sort((a, b) => (b.expectancyR ?? -Infinity) - (a.expectancyR ?? -Infinity));
}
