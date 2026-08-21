import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from './supabase/config';
import { createClient } from './supabase/server';

/**
 * Exhibit A's role names, which migration 0002 made the database's names too.
 * This union said `customer` until now, inherited from the sibling shop app —
 * so `requireRole('customer')` could never have matched a row, and the mismatch
 * would only have surfaced the first time a page tried to gate on it.
 */
export type Role = 'traveller' | 'partner' | 'agent' | 'admin';

export interface SessionUser {
  id: string;
  email: string | null;
  role: Role | null;
}

/**
 * The signed-in user (with their `users.role`) or null.
 *
 * Keyed on the Supabase auth UUID (`users.id`) — the replacement for the shop's
 * `auth0_id`. Design-shell safe: returns null when Supabase is unconfigured, so
 * the storefront renders for anonymous visitors with no backend.
 */
export async function getUser(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as Role) ?? null,
  };
}

/**
 * Gate a page by role. Redirects anonymous users to /login and wrong-role users
 * to /unauthorized. Use on partner / admin / account pages as they are built;
 * the public storefront does not need it.
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.role !== role) redirect('/unauthorized');
  return user;
}
