import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Download } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AccountTabs from '@/components/account/AccountTabs';
import { requireUser } from '@/lib/auth';
import { listBookingsForUser, type AccountBooking } from '@/lib/account';
import { statusLabel } from '@/lib/bookingStatus';
import { formatPrice, formatDateRange } from '@/lib/money';

/**
 * A7 — the traveller's own bookings.
 *
 * Signed-in only, and keyed on the auth UUID rather than on the email address:
 * `bookings.lead_email` is typed by whoever made the booking, so matching on it
 * would eventually hand one traveller another's trip. See `lib/account.ts`.
 *
 * A booking made while signed out therefore does not appear here. That is the
 * same rule the booking page and the receipt already apply — a reference plus
 * its session cookie — and the empty state says so rather than leaving somebody
 * to conclude their booking was lost.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My bookings',
  robots: { index: false, follow: false },
};

export default async function AccountBookingsPage() {
  const user = await requireUser('/account/bookings');
  const bookings = await listBookingsForUser(user.id);

  const upcoming = bookings.filter((b) => !b.past);
  const past = bookings.filter((b) => b.past);

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
          My bookings
        </h1>
        <AccountTabs active="bookings" />

        {bookings.length === 0 ? (
          <div className="mt-8 rounded-card border border-dashed border-line bg-bone p-8 text-center">
            <p className="text-[15px] leading-relaxed text-ink">You have no bookings on this account yet.</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-stone">
              If you booked without signing in, the booking is not attached to this account — open it
              with the link in your confirmation email, which has the reference on it.
            </p>
            <Link
              href="/tours"
              className="mt-5 inline-block rounded-lg bg-flame px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
            >
              Browse tours
            </Link>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && <Section title="Upcoming" bookings={upcoming} />}
            {past.length > 0 && <Section title="Past" bookings={past} />}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Section({ title, bookings }: { title: string; bookings: AccountBooking[] }) {
  return (
    <>
      <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-3">
        {bookings.map((b) => (
          <li key={b.reference}>
            <BookingCard booking={b} />
          </li>
        ))}
      </ul>
    </>
  );
}

function BookingCard({ booking: b }: { booking: AccountBooking }) {
  return (
    <div className="rounded-card border border-line bg-bone p-4">
      <div className="flex gap-4">
        {b.heroImage && (
          <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-field">
            <Image src={b.heroImage} alt="" fill sizes="112px" className="object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <Link
              href={`/booking/${b.reference}`}
              className="truncate text-[16px] font-medium leading-snug text-ink transition-colors hover:text-flame"
            >
              {b.packageTitle}
            </Link>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-label text-stone">
              {statusLabel(b.status)}
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-stone">
            {formatDateRange(b.startsOn, b.endsOn)}
          </p>
          <p className="mt-1 text-[13px] text-stone">
            {b.travellerCount} {b.travellerCount === 1 ? 'traveller' : 'travellers'} · Reference{' '}
            <span className="font-bold text-ink">{b.reference}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
        <span className="text-[13px] text-stone">
          {formatPrice(b.amountPaidCents, b.currency)} paid of {formatPrice(b.totalCents, b.currency)}
          {b.balanceCents > 0 && b.balanceDueOn && (
            <> · balance due {formatDateRange(b.balanceDueOn, null)}</>
          )}
        </span>
        <span className="flex items-center gap-3">
          {/* Only where money has actually arrived — the same condition the
              booking page uses, so the two cannot disagree about whether a
              receipt exists. */}
          {b.hasReceipt && (
            <a
              href={`/booking/${b.reference}/receipt.pdf?download=1`}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-stone transition-colors hover:text-flame"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Receipt
            </a>
          )}
          <Link
            href={`/booking/${b.reference}`}
            className="text-[13px] font-medium text-flame transition-colors hover:text-ember"
          >
            View booking
          </Link>
        </span>
      </div>
    </div>
  );
}
