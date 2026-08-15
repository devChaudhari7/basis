import { NextResponse } from "next/server";

import { createSessionClient } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const client = createSessionClient({ writable: true });
  if (client) await client.auth.signOut();
  return NextResponse.redirect(new URL("/", new URL(request.url).origin), { status: 303 });
}
