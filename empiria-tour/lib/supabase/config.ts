/**
 * Supabase env access + a "configured" flag (SSR / auth layer).
 *
 * These are the PUBLIC keys used by @supabase/ssr for the user session:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Server-side privileged data access uses a DIFFERENT client — the service-role
 * `getSupabaseAdmin()` in `lib/supabase.ts` (secret SUPABASE_KEY). Don't mix them:
 * the anon key here is public and RLS-enforced; the service-role key bypasses RLS
 * and must never reach the browser.
 *
 * With these vars unset the app stays a design shell: `isSupabaseConfigured()`
 * returns false and every auth touch-point becomes a no-op / pass-through.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
