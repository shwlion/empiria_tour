import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase admin client (Service Role Key — full access).
 *
 * Returns `null` when the env vars are not configured, so the design shell
 * renders (with empty data) before a Supabase project is wired up. Once
 * SUPABASE_URL + SUPABASE_KEY are set, callers get a real client.
 *
 * NOTE: this app will move to Supabase Auth (not Auth0). The identity column
 * on `users` should key off the Supabase auth UUID rather than `auth0_id`.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
