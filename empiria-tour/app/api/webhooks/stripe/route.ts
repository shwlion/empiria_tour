import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { recordStripePayment, settledFromSession } from '@/lib/payments';
import { enqueueForPayment, enqueueRefundIssued } from '@/lib/email/outbox';
import { fromStripeAmount } from '@/lib/stripe';

/**
 * The Stripe webhook — the only thing in this application that may say a
 * booking has been paid.
 *
 * Not the success URL. A traveller can type that, and a real one can close the
 * tab before Stripe ever redirects them; neither the presence nor the absence
 * of a redirect is evidence about money. Stripe tells the database directly,
 * server to server, with a signature over the raw body.
 *
 * This route is excluded from the auth middleware matcher on purpose — it
 * authenticates by signature, and a session cookie would mean nothing here.
 *
 * Response contract: 400 only for a body we cannot verify, so Stripe stops
 * resending something malformed. Everything else returns 200, including
 * failures to record — because `record_payment` is idempotent, and a retry
 * costs nothing, but a 500 makes Stripe retry a poison event for days.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Events worth acting on. Everything else is acknowledged and ignored. */
const HANDLED = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'charge.refunded',
]);

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !secret) {
    console.error('[stripe] webhook called while payment is not configured');
    return NextResponse.json({ error: 'Payment is not configured.' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  // The RAW body. Parsing it first would change the bytes the signature was
  // computed over and every event would fail verification.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    // Either somebody is posting to this URL, or the signing secret is the
    // wrong one for this endpoint. Both are worth a 400 and a log line.
    console.error('[stripe] signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;

        // A completed session is not necessarily a paid one: bank redirect
        // methods complete first and settle later, and the async event above is
        // what actually arrives for those.
        if (session.payment_status !== 'paid') {
          return NextResponse.json({ received: true, pending: session.id });
        }

        const settled = await settledFromSession(session);
        if (!settled?.bookingId) {
          console.error('[stripe] paid session carries no booking', session.id);
          return NextResponse.json({ received: true, unmatched: session.id });
        }

        await recordStripePayment({
          bookingId: settled.bookingId,
          kind: settled.kind,
          amountCents: settled.amountCents,
          currency: settled.currency,
          providerRef: settled.providerRef,
          processorFeeCents: settled.processorFeeCents,
        });

        // Part C. After the money is recorded, never before: an email saying a
        // booking is confirmed must not go out ahead of the row that makes it
        // true. Enqueueing only writes to the outbox — the send happens on the
        // next tick — so a slow mail provider cannot hold up this response.
        await enqueueForPayment(settled.bookingId, settled.amountCents);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const bookingId = session.client_reference_id ?? session.metadata?.booking_id;
        if (!bookingId) break;

        // Recorded rather than ignored: a traveller who thinks they have paid
        // and has not is a support conversation, and it goes better with the
        // attempt on file.
        await recordStripePayment({
          bookingId,
          kind: (session.metadata?.kind as 'deposit' | 'full' | 'balance') ?? 'full',
          amountCents: fromStripeAmount(session.amount_total ?? 0, (session.currency ?? 'cad').toUpperCase()),
          currency: (session.currency ?? 'cad').toUpperCase(),
          providerRef: `${session.id}:failed`,
          status: 'failed',
        });
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const bookingId = charge.metadata?.booking_id
          ?? (typeof charge.payment_intent === 'string' ? null : charge.payment_intent?.metadata?.booking_id)
          ?? null;
        if (!bookingId) {
          console.error('[stripe] refund carries no booking', charge.id);
          break;
        }

        // Negative, because `record_payment` reduces the balance by whatever it
        // is given and lets the resulting figure decide the status.
        const currency = charge.currency.toUpperCase();
        await recordStripePayment({
          bookingId,
          kind: 'refund' as 'full',
          amountCents: -fromStripeAmount(charge.amount_refunded, currency),
          currency,
          // The charge id rather than the refund id: a charge refunded twice
          // in parts would otherwise be recorded once. Stripe sends this event
          // per refund, and the amount is cumulative — so the id must vary.
          providerRef: `${charge.id}:refund:${charge.amount_refunded}`,
        });

        await enqueueRefundIssued(
          bookingId,
          charge.amount_refunded,
          'the card originally used',
          `${charge.id}:${charge.amount_refunded}`
        );
        break;
      }
    }
  } catch (error) {
    // Deliberately still a 200. record_payment is idempotent, so Stripe's
    // retry is safe — but a 500 here makes Stripe hammer a poison event for
    // three days, and the log line is what actually gets this fixed.
    console.error('[stripe] failed handling', event.type, event.id, error);
    return NextResponse.json({ received: true, error: 'logged' });
  }

  return NextResponse.json({ received: true });
}
