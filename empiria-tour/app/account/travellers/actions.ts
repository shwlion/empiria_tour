'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normaliseDob, normaliseName, SAVED_TRAVELLERS_MAX } from '@/lib/savedTravellers';

/**
 * A8 — the traveller editing their own saved travellers.
 *
 * Written through the user's own client, as `saveProfile` is, so the 0019
 * policies decide: a row is reachable only when `user_id` is the session's
 * own id, and an id from the form that belongs to somebody else matches
 * nothing. The cap and the one-per-person rule are the database's; here they
 * are only translated into sentences.
 */

export type TravellerActionResult = { ok: true; message?: string } | { ok: false; message: string };

const str = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};
const notes = (form: FormData, key: string): string | null => {
  const s = str(form, key).trim();
  return s ? s.slice(0, 500) : null;
};

function explain(code: string | undefined, message: string): string {
  if (code === '23505') return 'That person is already on your list.';
  if (code === '23514' && /at most/.test(message)) return `You can keep up to ${SAVED_TRAVELLERS_MAX} saved travellers. Remove one to add another.`;
  return 'We could not save that. Please try again.';
}

export async function saveTraveller(_prev: TravellerActionResult | null, form: FormData): Promise<TravellerActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: 'You are not signed in.' };

  const legalName = normaliseName(str(form, 'legal_name'));
  if (!legalName) return { ok: false, message: 'The name on their ID is needed.' };

  const rawDob = str(form, 'date_of_birth').trim();
  const dateOfBirth = normaliseDob(rawDob);
  if (rawDob && !dateOfBirth) return { ok: false, message: 'That date of birth is not a real past date.' };

  const row = {
    legal_name: legalName,
    date_of_birth: dateOfBirth,
    dietary_notes: notes(form, 'dietary_notes'),
    accessibility_notes: notes(form, 'accessibility_notes'),
  };

  const supabase = await createClient();
  const id = str(form, 'id').trim();
  const { error } = id
    ? await supabase.from('saved_travellers').update(row).eq('id', id).eq('user_id', user.id)
    : await supabase.from('saved_travellers').insert({ ...row, user_id: user.id });

  if (error) {
    console.error('[saved-travellers] write failed', error.code, error.message);
    return { ok: false, message: explain(error.code, error.message) };
  }

  revalidatePath('/account/travellers');
  return { ok: true, message: id ? 'Saved.' : `${legalName} added.` };
}

export async function deleteTraveller(_prev: TravellerActionResult | null, form: FormData): Promise<TravellerActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: 'You are not signed in.' };
  const id = str(form, 'id').trim();
  if (!id) return { ok: false, message: 'Nothing to remove.' };

  const supabase = await createClient();
  const { error } = await supabase.from('saved_travellers').delete().eq('id', id).eq('user_id', user.id);
  if (error) {
    console.error('[saved-travellers] delete failed', error.message);
    return { ok: false, message: 'We could not remove that. Please try again.' };
  }
  revalidatePath('/account/travellers');
  return { ok: true, message: 'Removed.' };
}
