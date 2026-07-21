import { timingSafeEqual } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Constant-time operator token check for the journal write API. */
export function isAuthorizedOperator(request: Request): boolean {
  const expected = process.env.OPERATOR_TOKEN;
  const provided = request.headers.get("x-operator-token");
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/** Service-role client for API routes only; never import from client code. */
export function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export const toFinite = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
