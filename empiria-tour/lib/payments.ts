import type Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStripe, toStripeAmount, fromStripeAmount } from '@/lib/stripe';

/**
 * A6 — taking the money.
 *
 * SERVER ONLY. Two halves that never meet:
 *
 *   Going out, `startCheckout` decides what is owed and asks Stripe for a
 *   hosted page. It writes nothing except the session reference, because a
 *   booking is not paid because somebody clicked a button.
 *
 *   Coming back, the webhook is the only thing that records a payment. Not the
 *   success URL — a traveller can open that by hand, and a real one can close
 *   the tab before Stripe ever redirects them. The database is told by Stripe,
 *   server to server, signed.
 *
 * The amount is recomputed here from the booking every time. What the browser
 * thinks is due is not evidence of anything.
 */

export type PaymentKind = 'deposit' | 'full' | 'balance';

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

type PayableBooking = {
  id: string;
  reference: string;
  status: string;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  depositDueCents: number;
  leadEmail: string;
  leadName: string;
  packageTitle: string;
  startsOn: string;
  holdExpiresAt: string | null;
};

/** What a booking still owes, and what it may be asked for. */
export function amountDue(booking: Pick<PayableBooking, 'totalCents' | 'amountPaidCents' | 'depositDueCents'>, kind: PaymentKind): number {
  const outstanding = booking.totalCents - booking.amountPaidCents;
  if (outstanding <= 0) return 0;
  if (kind === 'deposit' && booking.amountPaidCents === 0 && booking.depositDueCents > 0) {
    // Never let a "deposit" exceed what is actually left owing.
    return Math.min(booking.depositDueCents, outstanding);
  }
  return outstanding;
}

async function loadPayable(
  reference: string,
  sessionToken: string | null,
  userId: string | null
): Promise<PayableBooking | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data } = await db
    .from('bookings')
    .select(
      'id, reference, status, currency, total_cents, amount_paid_cents, deposit_due_cents, lead_email, lead_name, user_id, packages ( title ), departures ( starts_on )'
    )
    .eq('reference', reference.toUpperCase())
    .maybeSingle();
  if (!data) return null;

  // Same rule as the booking page: a reference alone is not authorisation.
  let allowed = userId != null && data.user_id === userId;
  const { data: holds } = await db
    .from('booking_holds')
    .select('session_token, expires_at, released_at')
    .eq('booking_id', data.id);
  if (!allowed && sessionToken) {
    allowed = (holds ?? []).some((h) => h.session_token === sessionToken);
  }
  if (!allowed) return null;

  const live = (holds ?? []).find((h) => h.released_at == null);
  const pkg = (data as { packages?: { title: string } | null }).packages;
  const dep = (data as { departures?: { starts_on: string } | null }).departures;

  return {
    id: data.id,
    reference: data.reference,
    status: data.status,
    currency: data.currency,
    totalCents: data.total_cents,
    amountPaidCents: data.amount_paid_cents,
    depositDueCents: data.deposit_due_cents,
    leadEmail: data.lead_email,
    leadName: data.lead_name,
    packageTitle: pkg?.title ?? 'Your trip',
    startsOn: dep?.starts_on ?? '',
    holdExpiresAt: live?.expires_at ?? null,
  };
}

/**
 * Create a Stripe Checkout session and hand back its URL.
 *
 * One line item rather than the full breakdown. Stripe cannot express a
 * negative promotion line or our already-computed tax without Stripe Tax and
 * coupons, and half-itemising would produce a receipt that disagrees with the
 * booking page. The breakdown lives where Part D needs it — on the booking, on
 * the page, and in the confirmation email — and Stripe is asked for one number
 * with an honest label.
 */
export async function startCheckout(
  reference: string,
  kind: PaymentKind,
  sessionToken: string | null,
  userId: string | null,
  origin: string
): Promise<CheckoutResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, message: 'Payment is unavailable right now.' };

  const booking = await loadPayable(reference, sessionToken, userId);
  if (!booking) return { ok: false, message: 'We could not find that booking.' };

  if (booking.status === 'cancelled' || booking.status === 'refunded') {
    return { ok: false, message: 'That booking has been cancelled. Nothing is owed on it.' };
  }
  const due = amountDue(booking, kind);
  if (due <= 0) {
    return { ok: false, message: 'That booking is already paid in full.' };
  }

  // A first payment against seats that are no longer held would confirm a
  // booking with nowhere to sit. Migration 0005 cancels those bookings when the
  // window lapses; this is the earlier, kinder refusal.
  if (booking.amountPaidCents === 0) {
    const stillHeld = booking.holdExpiresAt != null && new Date(booking.holdExpiresAt) > new Date();
    if (!stillHeld) {
      return {
        ok: false,
        message:
          'The window on these seats has closed and they have gone back on sale. Nothing was charged — please start a new booking.',
      };
    }
  }

  try {
    const stripe = requireStripe();

    const label =
      kind === 'deposit'
        ? `Deposit — ${booking.packageTitle}`
        : booking.amountPaidCents > 0
          ? `Balance — ${booking.packageTitle}`
          : booking.packageTitle;

    // The session dies when the seats do, so an abandoned tab cannot be paid
    // an hour later against inventory somebody else now has. Stripe requires
    // at least half an hour, which is why the floor is there.
    const holdEnds = booking.holdExpiresAt ? new Date(booking.holdExpiresAt).getTime() : 0;
    const floor = Date.now() + 31 * 60 * 1000;
    const expiresAt = Math.floor(Math.max(holdEnds, floor) / 1000);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: booking.id,
      customer_email: booking.leadEmail,
      expires_at: expiresAt,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: toStripeAmount(due, booking.currency),
            product_data: {
              name: label,
              description: `Departing ${booking.startsOn} · Booking ${booking.reference}`,
            },
          },
        },
      ],
      // Carried on both the session and the payment intent: the webhook may see
      // either first, depending which event arrives.
      metadata: { booking_id: booking.id, reference: booking.reference, kind },
      payment_intent_data: {
        metadata: { booking_id: booking.id, reference: booking.reference, kind },
        description: `${booking.packageTitle} — ${booking.reference}`,
      },
      success_url: `${origin}/booking/${booking.reference}?paid=1`,
      cancel_url: `${origin}/booking/${booking.reference}?cancelled=1`,
    });

    if (!session.url) {
      return { ok: false, message: 'Stripe did not return a payment page. Please try again.' };
    }

    await db
      .from('bookings')
      .update({ checkout_session_ref: session.id })
      .eq('id', booking.id);

    return { ok: true, url: session.url };
  } catch (error) {
    console.error('[stripe] checkout session failed', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('STRIPE_SECRET_KEY')) return { ok: false, message };
    return { ok: false, message: 'We could not open the payment page. Please try again.' };
  }
}

/**
 * Record a settled Stripe payment.
 *
 * Everything meaningful happens inside `record_payment`, which holds a lock on
 * the booking, refuses to insert the same `provider_ref` twice and converts
 * held seats into booked ones. This function's only jobs are to work out which
 * booking Stripe means and what the processor kept.
 */
export async function recordStripePayment(input: {
  bookingId: string;
  kind: PaymentKind;
  amountCents: number;
  currency: string;
  providerRef: string;
  processorFeeCents?: number | null;
  status?: 'succeeded' | 'failed';
}): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;

  const { error } = await db.rpc('record_payment', {
    p_payload: {
      booking_id: input.bookingId,
      kind: input.kind,
      amount_cents: input.amountCents,
      currency: input.currency.toUpperCase(),
      provider: 'stripe',
      provider_ref: input.providerRef,
      processor_fee_cents: input.processorFeeCents ?? null,
      status: input.status ?? 'succeeded',
    },
  });

  if (error) {
    console.error('[stripe] record_payment failed', input.providerRef, error.message);
    return false;
  }
  return true;
}

/**
 * Pull the payment intent, its charge and the balance transaction out of a
 * completed session.
 *
 * The fee is what §4.6 calls the processor cost and it cannot be derived later
 * without another round trip per booking, so it is fetched once here while the
 * event is in hand.
 */
export async function settledFromSession(session: Stripe.Checkout.Session): Promise<{
  bookingId: string | null;
  kind: PaymentKind;
  amountCents: number;
  currency: string;
  providerRef: string;
  processorFeeCents: number | null;
} | null> {
  const stripe = requireStripe();

  const bookingId = session.client_reference_id ?? session.metadata?.booking_id ?? null;
  const kind = (session.metadata?.kind as PaymentKind | undefined) ?? 'full';
  const currency = (session.currency ?? 'cad').toUpperCase();

  const intentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  if (!intentId) return null;

  let processorFeeCents: number | null = null;
  try {
    const intent = await stripe.paymentIntents.retrieve(intentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = intent.latest_charge;
    if (charge && typeof charge !== 'string') {
      const txn = charge.balance_transaction;
      if (txn && typeof txn !== 'string') {
        processorFeeCents = fromStripeAmount(txn.fee, txn.currency.toUpperCase());
      }
    }
  } catch (error) {
    // A missing fee is a gap in the revenue-share figure, not a reason to fail
    // to record that a traveller paid.
    console.error('[stripe] could not read the processor fee', intentId, error);
  }

  return {
    bookingId,
    kind,
    amountCents: fromStripeAmount(session.amount_total ?? 0, currency),
    currency,
    providerRef: intentId,
    processorFeeCents,
  };
}
