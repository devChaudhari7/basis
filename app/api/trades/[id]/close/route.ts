import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { riskPoints } from "@/lib/datasource";
import { isAuthorizedOperator, serviceClient, toFinite } from "@/lib/server/operator";

export const dynamic = "force-dynamic";

const EXIT_REASONS = ["target", "stop", "time", "manual"] as const;

/**
 * Close an open paper trade at the latest settlement value.
 *
 * R uses the risk that was fixed on the entry session:
 *   risk = (stop_z − |entry_z|) × σ₆₀(entry day)
 *   R    = direction × (exit − entry) / risk
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!isAuthorizedOperator(request)) {
    return NextResponse.json({ error: "Invalid operator token." }, { status: 401 });
  }
  const client = serviceClient();
  if (!client) {
    return NextResponse.json(
      { error: "Live database is not configured on this deployment." },
      { status: 503 }
    );
  }
  const tradeId = Number(params.id);
  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    return NextResponse.json({ error: "Invalid trade id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    exitReason?: string;
    postMortem?: string;
  } | null;
  const exitReason = body?.exitReason;
  if (!exitReason || !EXIT_REASONS.includes(exitReason as (typeof EXIT_REASONS)[number])) {
    return NextResponse.json(
      { error: `exitReason must be one of: ${EXIT_REASONS.join(", ")}.` },
      { status: 422 }
    );
  }
  const postMortem = (body?.postMortem ?? "").trim() || null;

  const tradeResult = await client.from("paper_trades").select("*").eq("id", tradeId).single();
  if (tradeResult.error || !tradeResult.data) {
    return NextResponse.json({ error: "Trade not found." }, { status: 404 });
  }
  const trade = tradeResult.data;
  if (trade.closed_on) {
    return NextResponse.json({ error: "Trade is already closed." }, { status: 409 });
  }

  const latestResult = await client
    .from("spread_daily")
    .select("d,value,z")
    .eq("pair_id", trade.pair_id)
    .order("d", { ascending: false })
    .limit(1);
  const latest = latestResult.data?.[0];
  const exitValue = toFinite(latest?.value);
  if (!latest || exitValue === null) {
    return NextResponse.json({ error: "No settlement data to close against." }, { status: 409 });
  }

  const entryDayResult = await client
    .from("spread_daily")
    .select("std_60")
    .eq("pair_id", trade.pair_id)
    .lte("d", trade.opened_on)
    .order("d", { ascending: false })
    .limit(1);

  const entryValue = toFinite(trade.entry_value) ?? 0;
  const entryZ = toFinite(trade.entry_z) ?? 0;
  const stopZ = toFinite(trade.stop_z) ?? 0;
  const sign = trade.direction === "short_spread" ? -1 : 1;
  const pnlPoints = sign * (exitValue - entryValue);
  const risk = riskPoints(entryZ, stopZ, toFinite(entryDayResult.data?.[0]?.std_60));
  const rMultiple = risk !== null ? pnlPoints / risk : null;

  const updateResult = await client
    .from("paper_trades")
    .update({
      closed_on: latest.d,
      exit_value: exitValue,
      exit_z: toFinite(latest.z),
      exit_reason: exitReason,
      pnl_points: pnlPoints,
      r_multiple: rMultiple,
      post_mortem: postMortem
    })
    .eq("id", tradeId)
    .select("id,r_multiple")
    .single();
  if (updateResult.error) {
    return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
  }
  // Bust the ISR caches so the closed trade is visible immediately.
  revalidatePath("/");
  revalidatePath("/s/[slug]", "page");
  return NextResponse.json(updateResult.data);
}
