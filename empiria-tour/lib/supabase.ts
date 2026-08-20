import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Server-side Supabase admin client (service-role key — full access, bypasses RLS).
 *
 * Returns `null` when the env vars are unset, so the design shell renders with
 * empty data before a project is wired up.
 *
 * NOT the auth client. Sessions go through the SSR anon client in
 * `lib/supabase/` — see the header comment in `lib/supabase/config.ts`. Never
 * import this into a client component: the service-role key would ship to the
 * browser.
 *
 * Typed against the generated schema, so column names and shapes are checked at
 * compile time. Regenerate `database.types.ts` after every migration.
 */
export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

export function getSupabaseAdmin(): Db | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return null;

  // One client per server process rather than one per call — each createClient
  // allocates its own fetch/auth machinery.
  if (!cached) {
    cached = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
