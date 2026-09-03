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
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle();

  // A closed account (A8) reads as signed out.
  //
  // Closure anonymises the profile but cannot remove the `auth.users` row —
  // that row is what the booking history hangs off. So the session survives
  // closure, and without this check a traveller who closed their account would
  // still be signed in to an empty one. The status column is already being read
  // for the role, so this costs nothing.
  if (profile?.status === 'closed') return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role: (profile?.role as Role) ?? null,
  };
}

/**
 * Gate a page on being signed in at all, whatever the role.
 *
 * A7 and A8 are every traveller's own screens, so `requireRole('traveller')`
 * would be wrong twice over: it would turn an admin or a partner away from
 * their own bookings, and it would send them to /unauthorized — which says
 * "your account does not have access", a sentence that is simply untrue there.
 *
 * `next` comes back through /login and /auth/callback, both of which accept
 * only same-origin relative paths, so somebody signing in to reach their
 * bookings arrives at their bookings rather than at the home page.
 */
export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  return user;
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
