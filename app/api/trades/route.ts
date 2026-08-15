import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { currentViewer } from "@/lib/server/auth";
import { isAuthorizedOperator, serviceClient, toFinite } from "@/lib/server/operator";

export const dynamic = "force-dynamic";

/**
 * Log a paper trade against the latest settlement session.
 *
 * Two callers are accepted: the desk operator holding the operator token, and
 * any signed-in visitor keeping their own paper book. Either way the client
 * supplies only direction, stop-z, and the mandatory hypothesis; entry
 * value/z/date always come from the worker-computed spread_daily table, so
 * nobody can log against a number the desk never produced.
 */
export async function POST(request: Request) {
  const viewer = await currentViewer();
  const isOperator = isAuthorizedOperator(request);
  if (!isOperator && !viewer) {
    return NextResponse.json(
      { error: "Sign in to keep a paper book, or supply the operator token." },
      { status: 401 }
    );
  }
  const client = serviceClient();
  if (!client) {
    return NextResponse.json(
      { error: "Live database is not configured on this deployment." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    direction?: string;
    stopZ?: number;
    hypothesis?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "Malformed JSON body." }, { status: 400 });
  }

  const { slug, direction } = body;
  const stopZ = toFinite(body.stopZ);
  const hypothesis = (body.hypothesis ?? "").trim();
  if (!slug || !["long_spread", "short_spread"].includes(direction ?? "")) {
    return NextResponse.json({ error: "slug and a valid direction are required." }, { status: 422 });
  }
  if (hypothesis.length < 10) {
    return NextResponse.json({ error: "A one-sentence hypothesis is mandatory." }, { status: 422 });
  }
  if (stopZ === null || stopZ <= 0) {
    return NextResponse.json({ error: "stopZ must be a positive number." }, { status: 422 });
  }

  const pairResult = await client.from("pairs").select("id,entry_z,stop_z").eq("slug", slug).single();
  if (pairResult.error || !pairResult.data) {
    return NextResponse.json({ error: `Unknown pair: ${slug}` }, { status: 404 });
  }
  const pairId = Number(pairResult.data.id);

  const latestResult = await client
    .from("spread_daily")
    .select("d,value,z,roll_suspect")
    .eq("pair_id", pairId)
    .order("d", { ascending: false })
    .limit(1);
  const latest = latestResult.data?.[0];
  const entryValue = toFinite(latest?.value);
  const entryZ = toFinite(latest?.z);
  if (!latest || entryValue === null) {
    return NextResponse.json({ error: "No spread data exists for this pair yet." }, { status: 409 });
  }
  if (entryZ === null || latest.roll_suspect) {
    return NextResponse.json(
      { error: "Latest session has no clean z-score (roll day or warm-up); refusing to log." },
      { status: 409 }
    );
  }
  if (stopZ <= Math.abs(entryZ)) {
    return NextResponse.json(
      { error: `stopZ must exceed the current |z| of ${Math.abs(entryZ).toFixed(2)}.` },
      { status: 422 }
    );
  }

  // The operator token identifies the desk's own book; anyone else is logging
  // into their personal one, which RLS scopes to their user id.
  const source = isOperator ? "operator" : "user";
  const ownerId = isOperator ? null : viewer?.id ?? null;

  if (source === "user") {
    const existing = await client
      .from("paper_trades")
      .select("id")
      .eq("pair_id", pairId)
      .eq("owner_id", ownerId)
      .is("closed_on", null)
      .limit(1);
    if ((existing.data ?? []).length > 0) {
      return NextResponse.json(
        { error: "You already hold an open position on this spread." },
        { status: 409 }
      );
    }
  }

  const insertResult = await client
    .from("paper_trades")
    .insert({
      pair_id: pairId,
      opened_on: latest.d,
      entry_value: entryValue,
      entry_z: entryZ,
      direction,
      stop_z: stopZ,
      hypothesis,
      source,
      owner_id: ownerId
    })
    .select("id")
    .single();
  if (insertResult.error) {
    return NextResponse.json({ error: insertResult.error.message }, { status: 500 });
  }
  // Bust the ISR caches so the new trade is visible immediately.
  revalidatePath("/");
  revalidatePath("/s/[slug]", "page");
  return NextResponse.json({ id: insertResult.data.id }, { status: 201 });
}
