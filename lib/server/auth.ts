import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Is visitor sign-in available on this deployment? */
export function authEnabled(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Request-scoped Supabase client that carries the visitor's session cookie, so
 * Postgres RLS decides what they can read and write. Server code only.
 *
 * `writable` must be false in Server Components: Next.js forbids mutating
 * cookies during render, and only Route Handlers / Server Actions may refresh
 * the session.
 */
export function createSessionClient({ writable = false }: { writable?: boolean } = {}):
  | SupabaseClient
  | null {
  if (!authEnabled()) return null;
  const store = cookies();

  return createServerClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        get: (name: string) => store.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          if (!writable) return;
          try {
            store.set({ name, value, ...options });
          } catch {
            // Render-phase write attempt; the session simply is not refreshed.
          }
        },
        remove: (name: string, options: CookieOptions) => {
          if (!writable) return;
          try {
            store.set({ name, value: "", ...options, maxAge: 0 });
          } catch {
            // As above.
          }
        }
      }
    }
  );
}

export interface Viewer {
  id: string;
  email: string | null;
}

/** The signed-in visitor, or null. Never throws: signed-out is the norm. */
export async function currentViewer(): Promise<Viewer | null> {
  const client = createSessionClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
