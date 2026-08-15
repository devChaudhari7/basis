import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createSessionClient, currentViewer } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const MIN_ALERT_Z = 0.5;
const MAX_ALERT_Z = 5;

/** Add or update a watched spread. The session client is used deliberately so
 *  Postgres RLS enforces ownership rather than this route being trusted. */
export async function POST(request: Request) {
  const viewer = await currentViewer();
  const client = createSessionClient();
  if (!viewer || !client) {
    return NextResponse.json({ error: "Sign in to keep a watchlist." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    slug?: string;
    alertZ?: number;
  } | null;
  const slug = body?.slug?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug is required." }, { status: 422 });
  }
  const parsed = Number(body?.alertZ ?? 2);
  const alertZ = Number.isFinite(parsed)
    ? Math.min(MAX_ALERT_Z, Math.max(MIN_ALERT_Z, parsed))
    : 2;

  const { error } = await client
    .from("watchlists")
    .upsert({ owner_id: viewer.id, pair_slug: slug, alert_z: alertZ }, { onConflict: "owner_id,pair_slug" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/watchlist");
  revalidatePath(`/s/${slug}`);
  return NextResponse.json({ slug, alertZ }, { status: 201 });
}

export async function DELETE(request: Request) {
  const viewer = await currentViewer();
  const client = createSessionClient();
  if (!viewer || !client) {
    return NextResponse.json({ error: "Sign in to manage your watchlist." }, { status: 401 });
  }

  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug is required." }, { status: 422 });
  }

  const { error } = await client
    .from("watchlists")
    .delete()
    .eq("owner_id", viewer.id)
    .eq("pair_slug", slug);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/watchlist");
  revalidatePath(`/s/${slug}`);
  return NextResponse.json({ removed: slug });
}
