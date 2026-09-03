import { getSupabaseAdmin } from '@/lib/supabase';
import { isClosed } from '@/lib/bookingStatus';

/**
 * A7 and A8 — the traveller's own records.
 *
 * SERVER ONLY.
 *
 * Everything here is keyed by the Supabase auth UUID and by nothing else. There
 * is no lookup by email, deliberately: `bookings.lead_email` is typed by whoever
 * made the booking and two people can hold the same address at different times,
 * so matching on it would hand one traveller another's trip. A booking reaches
 * an account exactly when `create_booking` stamped `user_id` on it, which it
 * does only for a signed-in traveller.
 *
 * That means a booking made while signed out stays reachable only by its
 * reference and its session cookie — which is the same rule the booking page
 * and `loadReceipt` already apply, and is the correct answer rather than a gap.
 */

export type AccountBooking = {
  reference: string;
  status: string;
  currency: string;
  createdAt: string;
  packageTitle: string;
  packageSlug: string;
  heroImage: string | null;
  startsOn: string;
  endsOn: string | null;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
  balanceDueOn: string | null;
  travellerCount: number;
  /** Whether a receipt exists to link. False until money has arrived. */
  hasReceipt: boolean;
  /** Upcoming or past, by status first and departure date second. */
  past: boolean;
};

export type AccountProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  address: { line1?: string; line2?: string; city?: string; region?: string; postcode?: string; country?: string } | null;
  marketingOptIn: boolean;
  status: string;
  createdAt: string;
};

/**
 * Every booking belonging to this account, newest departure first.
 *
 * Reads through the service-role client and filters by `user_id` explicitly,
 * the same pattern as `lib/booking.ts` and `lib/receipt.ts`. The `read own
 * bookings` RLS policy says the same thing and is the backstop; this is the
 * belt, and it is what keeps a bug in one from being a disclosure.
 */
export async function listBookingsForUser(userId: string): Promise<AccountBooking[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data } = await db
    .from('bookings')
    .select(
      'reference, status, currency, created_at, total_cents, amount_paid_cents, balance_cents, balance_due_on, adults, children, infants, packages ( title, slug, hero_image ), departures ( starts_on, ends_on )'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const today = new Date().toISOString().slice(0, 10);

  return (data ?? []).map((b) => {
    const pkg = (b as { packages?: { title: string; slug: string; hero_image: string | null } | null }).packages;
    const dep = (b as { departures?: { starts_on: string; ends_on: string | null } | null }).departures;
    const startsOn = dep?.starts_on ?? '';

    return {
      reference: b.reference,
      status: b.status,
      currency: b.currency,
      createdAt: b.created_at,
      packageTitle: pkg?.title ?? 'Your trip',
      packageSlug: pkg?.slug ?? '',
      heroImage: pkg?.hero_image ?? null,
      startsOn,
      endsOn: dep?.ends_on ?? null,
      totalCents: b.total_cents,
      amountPaidCents: b.amount_paid_cents,
      balanceCents: b.balance_cents ?? b.total_cents - b.amount_paid_cents,
      balanceDueOn: b.balance_due_on,
      travellerCount: b.adults + b.children + b.infants,
      // The same condition the booking page uses to decide whether to offer the
      // download, so the two can never disagree about whether one exists.
      hasReceipt: b.amount_paid_cents > 0,
      past: isClosed(b.status) || (startsOn !== '' && startsOn < today),
    };
  });
}

/** The signed-in traveller's own profile row. */
export async function getProfile(userId: string): Promise<AccountProfile | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data } = await db
    .from('users')
    .select('id, email, full_name, phone, address, marketing_opt_in, status, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    address: (data.address as AccountProfile['address']) ?? null,
    marketingOptIn: data.marketing_opt_in,
    status: data.status,
    createdAt: data.created_at,
  };
}
