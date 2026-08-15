import { NextResponse } from "next/server";

import { createSessionClient } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Exchanges the magic-link code for a session cookie, then returns the
 *  visitor to the desk. Route Handlers may write cookies, so the session is
 *  established here rather than during render. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/journal";
  // Only same-origin paths, so the callback can never be used as an open redirect.
  const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/journal";

  if (code) {
    const client = createSessionClient({ writable: true });
    if (client) {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(new URL("/signin?error=link", url.origin));
      }
    }
  }
  return NextResponse.redirect(new URL(destination, url.origin));
}
