import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { CircleCheck, CreditCard } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getBookingForViewer } from '@/lib/booking';
import { getUser } from '@/lib/auth';
import { formatPrice, formatDateRange } from '@/lib/money';

/**
 * The booking, after A5 and before A6.
 *
 * Right now it is the end of the flow: the seats are reserved and the record is
 * complete, but Empiria has not yet handed over their Stripe account, so there
 * is nothing to charge with. The page says exactly that rather than implying a
 * payment happened — and when A6 lands, the payment panel goes in the space
 * below, on the same URL the traveller already has.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
};

const STATUS_COPY: Record<string, { title: string; detail: string }> = {
  pending_payment: {
    title: 'Your places are reserved',
    detail: 'They are held for you while payment is arranged.',
  },
  confirmed: { title: 'Your booking is confirmed', detail: 'We will be in touch before you travel.' },
  balance_due: { title: 'Balance outstanding', detail: 'The remainder is due before you travel.' },
  paid_in_full: { title: 'Paid in full', detail: 'Everything is settled. See you there.' },
  cancelled: {
    title: 'This booking was cancelled',
    detail: 'The places have gone back on sale. Nothing was charged.',
  },
  refunded: { title: 'This booking was refunded', detail: 'The payment has been returned.' },
  travelled: { title: 'Trip complete', detail: 'We hope it was a good one.' },
};

export default async function BookingPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const jar = await cookies();
  const user = await getUser();

  const booking = await getBookingForViewer(
    reference,
    jar.get('empiria_booking_session')?.value ?? null,
    user?.id ?? null
  );
  // Not "no such booking" — a reference that exists but is not yours is
  // indistinguishable from one that does not, on purpose.
  if (!booking) notFound();

  const copy = STATUS_COPY[booking.status] ?? {
    title: 'Your booking',
    detail: '',
  };
  const due =
    booking.totals.depositDueCents > 0
      ? booking.totals.depositDueCents
      : booking.totals.totalCents;

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar currency={booking.currency} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <div className="flex items-start gap-3">
          <CircleCheck
            className={`mt-1 h-6 w-6 shrink-0 ${
              booking.status === 'cancelled' ? 'text-stone' : 'text-flame'
            }`}
            aria-hidden="true"
          />
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
              {copy.title}
            </h1>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone">{copy.detail}</p>
          </div>
        </div>

        <p className="mt-6 font-mono text-[11px] uppercase tracking-label text-stone">
          Reference{' '}
          <span className="ml-1 text-[13px] font-bold text-ink">{booking.reference}</span>
        </p>

        <div className="mt-8 flex gap-4 rounded-card border border-line bg-bone p-4">
          {booking.package.heroImage && (
            <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-field">
              <Image
                src={booking.package.heroImage}
                alt=""
                fill
                sizes="112px"
                className="object-cover"
              />
            </div>
          )}
          <div className="min-w-0">
            <Link
              href={`/tours/${booking.package.slug}`}
              className="text-[16px] font-medium leading-snug text-ink transition-colors hover:text-flame"
            >
              {booking.package.title}
            </Link>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-stone">
              {formatDateRange(booking.departure.startsOn, booking.departure.endsOn)}
            </p>
            <p className="mt-1 text-[13px] text-stone">
              {booking.party.adults} {booking.party.adults === 1 ? 'adult' : 'adults'}
              {booking.party.children > 0 && `, ${booking.party.children} children`}
              {booking.party.infants > 0 && `, ${booking.party.infants} infants`}
            </p>
          </div>
        </div>

        {/* Part D: the itemised total, kept available after the sale. */}
        <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">What it costs</h2>
        <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-bone">
          {booking.lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[14px]">
              <span className="text-ink">
                {l.label}
                {l.quantity > 1 && <span className="ml-1.5 text-[12.5px] text-stone">× {l.quantity}</span>}
              </span>
              <span className={`shrink-0 tabular-nums ${l.amountCents < 0 ? 'text-flame' : 'text-ink'}`}>
                {formatPrice(l.amountCents, booking.currency)}
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 px-4 py-3">
            <span className="font-display text-[16px] font-semibold text-ink">Total</span>
            <span className="font-display text-[20px] tabular-nums text-ink">
              {formatPrice(booking.totals.totalCents, booking.currency)}
            </span>
          </li>
        </ul>

        <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">Travelling</h2>
        <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-bone">
          {booking.travellers.map((t) => (
            <li key={t.position} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
              <span className="text-[14px] text-ink">{t.legalName}</span>
              <span className="font-mono text-[10px] uppercase tracking-label text-stone">
                {t.travellerType}
                {t.isLead && ' · lead'}
              </span>
            </li>
          ))}
        </ul>

        {booking.acknowledgements.length > 0 && (
          <>
            <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">You agreed to</h2>
            <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-bone">
              {booking.acknowledgements.map((a, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span className="text-[14px] text-ink">{a.label}</span>
                  <span className="font-mono text-[10px] uppercase tracking-label text-stone">
                    {new Date(a.acceptedAt).toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {booking.status === 'pending_payment' && (
          <div className="mt-10 rounded-card border border-line bg-bone p-5">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-flame">
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              Payment
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink">
              {formatPrice(due, booking.currency)} is due to confirm these places
              {booking.totals.depositDueCents > 0 && (
                <>
                  , with {formatPrice(booking.totals.balanceCents, booking.currency)} to follow
                  {booking.totals.balanceDueOn &&
                    ` by ${formatDateRange(booking.totals.balanceDueOn, null)}`}
                </>
              )}
              .
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed text-stone">
              Card payment is not switched on for this site yet. Our team will contact you at{' '}
              <span className="text-ink">{booking.lead.email}</span> to take payment and confirm.
              Quote your reference and nothing else is needed.
            </p>
          </div>
        )}

        <p className="mt-8 text-[13px] leading-relaxed text-stone">
          Keep this reference. Questions about the booking? Reply to the confirmation email or get in
          touch quoting {booking.reference}.
        </p>
      </main>
      <Footer />
    </div>
  );
}
