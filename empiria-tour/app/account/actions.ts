'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createClient } from '@/lib/supabase/server';

/**
 * A8 — the traveller acting on their own account.
 *
 * Every action here re-reads the session server-side and writes only to that
 * user's own row. Nothing takes a user id from the client, because a form field
 * is not evidence of who is asking.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

/** Trim to null, so an emptied field clears rather than storing "". */
const clean = (v: FormDataEntryValue | null, max = 200): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s.slice(0, max);
};

export async function saveProfile(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: 'You are not signed in.' };

  const address = {
    line1: clean(form.get('line1')),
    line2: clean(form.get('line2')),
    city: clean(form.get('city')),
    region: clean(form.get('region')),
    postcode: clean(form.get('postcode'), 32),
    country: clean(form.get('country')),
  };
  // An address of nothing but nulls is no address. Storing `{}` would make an
  // empty form look like a filled one to anything reading the column later.
  const anyAddress = Object.values(address).some((v) => v != null);

  // Written through the user's own client rather than the service role, so the
  // `update own profile` policy applies. That policy's with-check pins `role`
  // to its current value, which makes privilege escalation impossible here even
  // if this function were wrong about which columns it is allowed to set.
  const supabase = await createClient();
  const { error } = await supabase
    .from('users')
    .update({
      full_name: clean(form.get('full_name'), 120),
      phone: clean(form.get('phone'), 40),
      address: anyAddress ? address : null,
      marketing_opt_in: form.get('marketing_opt_in') === 'on',
    })
    .eq('id', user.id);

  if (error) {
    console.error('[account] profile update failed', error.message);
    return { ok: false, message: 'We could not save that. Please try again.' };
  }

  revalidatePath('/account');
  return { ok: true, message: 'Saved.' };
}

/**
 * Close the account.
 *
 * The anonymising happens in `close_own_account` (migration 0010), not here:
 * emptying seven columns from application code is seven chances to half-do it,
 * and the definition of "anonymised" belongs beside the columns.
 *
 * Signing out afterwards is what the traveller expects, but it is not what makes
 * the closure effective — `getUser` refuses a closed account, so a stale cookie
 * buys nothing.
 */
export async function closeAccount(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: 'You are not signed in.' };

  // Typed confirmation. Closure is irreversible and the profile does not come
  // back, so it should not be one misplaced click away.
  if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'CLOSE') {
    return { ok: false, message: 'Type CLOSE to confirm.' };
  }

  const db = getSupabaseAdmin();
  if (!db) return { ok: false, message: 'Account closure is unavailable right now.' };

  const { error } = await db.rpc('close_own_account', { p_user: user.id });

  if (error) {
    console.error('[account] close_own_account failed', error.message);
    // PGRST202 is PostgREST failing to find the function — migration 0010 has
    // not been applied. Worth saying plainly rather than as "try again", which
    // would send somebody round a loop that cannot succeed.
    if (error.code === 'PGRST202') {
      return { ok: false, message: 'Account closure is not switched on yet. Please contact us and we will close it for you.' };
    }
    // The one rule the function enforces that a person can actually act on.
    if (error.message.includes('active administrator')) {
      return { ok: false, message: 'You are the last active administrator, so this account cannot be closed. Appoint another administrator first.' };
    }
    return { ok: false, message: 'We could not close the account. Please contact us.' };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  return { ok: true, message: 'closed' };
}
