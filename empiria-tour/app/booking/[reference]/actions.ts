'use server';

import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { startCheckout, type CheckoutResult, type PaymentKind } from '@/lib/payments';
import { TOUR_URL } from '@/lib/urls';

const SESSION_COOKIE = 'empiria_booking_session';

/**
 * Where Stripe should send the traveller back to.
 *
 * The configured site URL wins, because it is the one that is certainly
 * correct in production. The request headers are the fallback for local
 * development, where the port changes and nobody wants to keep editing env
 * files to test a payment.
 */
async function returnOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host');
  if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'))) {
    const proto = h.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
  }
  return TOUR_URL;
}

/**
 * Open Stripe Checkout.
 *
 * Returns the URL rather than redirecting, so the client can show its own
 * error in place if something is wrong — a redirect to an error page loses the
 * booking the traveller was looking at.
 */
export async function startCheckoutAction(
  reference: string,
  kind: PaymentKind
): Promise<CheckoutResult> {
  const jar = await cookies();
  const user = await getUser();
  return startCheckout(
    reference,
    kind,
    jar.get(SESSION_COOKIE)?.value ?? null,
    user?.id ?? null,
    await returnOrigin()
  );
}

/**
 * Give up on an unpaid booking and hand the seats straight back.
 *
 * Scoped by the booking-session cookie inside `abandon_booking`, so a guessed
 * reference cannot cancel somebody else's trip. Refuses once anything has been
 * paid — that is a refund, which is a conversation and a B3 screen, not a
 * button on a public page.
 */
export async function abandonBookingAction(
  reference: string
): Promise<{ ok: boolean; message: string }> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, message: 'That could not be cancelled right now.' };

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false, message: 'We cannot confirm this booking is yours from this browser.' };
  }

  const { data: booking } = await db
    .from('bookings')
    .select('id')
    .eq('reference', reference.toUpperCase())
    .maybeSingle();
  if (!booking) return { ok: false, message: 'We could not find that booking.' };

  const { data, error } = await db.rpc('abandon_booking', {
    p_booking: booking.id,
    p_session: token,
  });

  if (error || data !== true) {
    return {
      ok: false,
      message:
        'That booking cannot be cancelled here — either something has already been paid, or it is not held by this browser. Get in touch and we will sort it out.',
    };
  }

  revalidatePath(`/booking/${reference}`);
  return { ok: true, message: 'Cancelled. The places have gone back on sale and nothing was charged.' };
}
