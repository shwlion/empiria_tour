import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * A8 — saved traveller profiles (migration 0019).
 *
 * The people a traveller books for, kept on their account so the next
 * booking's traveller cards can be filled from a list instead of typed
 * again. Read here under the service role and filtered by `user_id`
 * explicitly, the same belt-and-braces as `getProfile`; the RLS policies are
 * the backstop. The account page's own edits go through the user's client
 * (app/account/travellers/actions.ts), so the policies decide there.
 *
 * `rememberTravellers` is the booking flow's "save these for next time". It
 * matches on (name, birthday) the way the table's unique constraint does,
 * updates the ones already there and adds the rest up to the cap. Not a
 * single upsert: the cap is a BEFORE INSERT trigger, which fires for an
 * INSERT … ON CONFLICT before the conflict is found, so a full list would
 * refuse even to refresh a person already on it.
 *
 * The three normalisers are pure and tested.
 */

export type SavedTraveller = {
  id: string;
  legalName: string;
  dateOfBirth: string | null;
  dietaryNotes: string | null;
  accessibilityNotes: string | null;
};

export type SavedTravellerInput = Omit<SavedTraveller, 'id'>;

export const SAVED_TRAVELLERS_MAX = 20;
const NAME_MAX = 200;
const NOTES_MAX = 500;

/** "  Ana   Reyes " → "Ana Reyes": the unique constraint compares exact text. */
export function normaliseName(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/**
 * A date input's value → an ISO date, or null. Not a real calendar date, in
 * the future, or before 1900 → null: a wrong birthday should not be kept
 * against the person's name.
 */
export function normaliseDob(raw: string | null | undefined, today: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0]) return null; // Feb 30
  if (year < 1900 || d.getTime() > today.getTime()) return null;
  return m[0];
}

const clipNotes = (raw: string | null | undefined): string | null => {
  const s = (raw ?? '').trim();
  return s ? s.slice(0, NOTES_MAX) : null;
};

/**
 * A booking's traveller inputs → the people worth remembering: those with a
 * name, whitespace-normalised, and each person once even if they were typed
 * twice (a returning family with two "Ana Reyes" rows is one Ana).
 */
export function profilesFromTravellers(
  travellers: { legalName: string; dateOfBirth: string | null; dietaryNotes: string | null; accessibilityNotes: string | null }[]
): SavedTravellerInput[] {
  const seen = new Set<string>();
  const out: SavedTravellerInput[] = [];
  for (const t of travellers) {
    const legalName = normaliseName(t.legalName);
    if (!legalName) continue;
    const dateOfBirth = normaliseDob(t.dateOfBirth);
    const key = `${legalName}|${dateOfBirth ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      legalName,
      dateOfBirth,
      dietaryNotes: clipNotes(t.dietaryNotes),
      accessibilityNotes: clipNotes(t.accessibilityNotes),
    });
  }
  return out;
}

/**
 * Reconcile a list to remember against what is already saved. Pure: returns
 * which existing rows to refresh and which people to add, the latter cut to
 * the room left under the cap. A booking's blank notes never erase a note
 * already on the profile — absence on one trip is not information.
 */
export function planRemember(
  existing: SavedTraveller[],
  wanted: SavedTravellerInput[],
  max = SAVED_TRAVELLERS_MAX
): { updates: { id: string; dietaryNotes: string | null; accessibilityNotes: string | null }[]; inserts: SavedTravellerInput[]; dropped: number } {
  const byKey = new Map(existing.map((e) => [`${e.legalName}|${e.dateOfBirth ?? ''}`, e]));
  const updates: { id: string; dietaryNotes: string | null; accessibilityNotes: string | null }[] = [];
  const fresh: SavedTravellerInput[] = [];
  for (const w of wanted) {
    const hit = byKey.get(`${w.legalName}|${w.dateOfBirth ?? ''}`);
    if (hit) {
      const dietaryNotes = w.dietaryNotes ?? hit.dietaryNotes;
      const accessibilityNotes = w.accessibilityNotes ?? hit.accessibilityNotes;
      if (dietaryNotes !== hit.dietaryNotes || accessibilityNotes !== hit.accessibilityNotes) {
        updates.push({ id: hit.id, dietaryNotes, accessibilityNotes });
      }
    } else {
      fresh.push(w);
    }
  }
  const room = Math.max(0, max - existing.length);
  return { updates, inserts: fresh.slice(0, room), dropped: Math.max(0, fresh.length - room) };
}

type Row = {
  id: string;
  legal_name: string;
  date_of_birth: string | null;
  dietary_notes: string | null;
  accessibility_notes: string | null;
};

const fromRow = (r: Row): SavedTraveller => ({
  id: r.id,
  legalName: r.legal_name,
  dateOfBirth: r.date_of_birth,
  dietaryNotes: r.dietary_notes,
  accessibilityNotes: r.accessibility_notes,
});

export async function getSavedTravellers(userId: string): Promise<SavedTraveller[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from('saved_travellers')
    .select('id, legal_name, date_of_birth, dietary_notes, accessibility_notes')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[saved-travellers] read failed', error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

/**
 * The booking flow's save, after the booking exists. Best effort by design:
 * the booking is already made, so nothing here may fail it — a problem is
 * logged and the traveller simply finds the list unchanged.
 */
export async function rememberTravellers(userId: string, wanted: SavedTravellerInput[]): Promise<void> {
  const db = getSupabaseAdmin();
  if (!db || wanted.length === 0) return;
  const existing = await getSavedTravellers(userId);
  const plan = planRemember(existing, wanted);

  for (const u of plan.updates) {
    const { error } = await db
      .from('saved_travellers')
      .update({ dietary_notes: u.dietaryNotes, accessibility_notes: u.accessibilityNotes })
      .eq('id', u.id)
      .eq('user_id', userId);
    if (error) console.error('[saved-travellers] refresh failed', error.message);
  }
  if (plan.inserts.length > 0) {
    const { error } = await db.from('saved_travellers').insert(
      plan.inserts.map((t) => ({
        user_id: userId,
        legal_name: t.legalName,
        date_of_birth: t.dateOfBirth,
        dietary_notes: t.dietaryNotes,
        accessibility_notes: t.accessibilityNotes,
      }))
    );
    if (error) console.error('[saved-travellers] save failed', error.message);
  }
  if (plan.dropped > 0) {
    console.warn(`[saved-travellers] ${plan.dropped} not saved: the account is at its ${SAVED_TRAVELLERS_MAX}-traveller cap`);
  }
}
