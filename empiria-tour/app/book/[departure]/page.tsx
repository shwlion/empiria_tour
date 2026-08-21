import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import BookingFlow from '@/components/booking/BookingFlow';
import { getBookingContext } from '@/lib/booking';
import { getDefaultCurrency } from '@/lib/catalogue';

/**
 * A5 — the booking flow for one departure.
 *
 * Never prerendered and never indexed: it holds inventory, reads a session
 * cookie and reflects a specific traveller's selection.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book',
  robots: { index: false, follow: false },
};

type Params = Promise<{ departure: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const count = (v: string | string[] | undefined, fallback: number): number => {
  const n = Number(one(v));
  return Number.isFinite(n) && n >= 0 && n <= 20 ? Math.floor(n) : fallback;
};

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { departure } = await params;
  const sp = await searchParams;

  const currency = one(sp.currency) ?? (await getDefaultCurrency());
  const context = await getBookingContext(departure, currency);

  if (!context) {
    return (
      <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
        <Navbar currency={currency} />
        <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-16">
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-ink">
            That departure is no longer on sale
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-stone">
            It may have sold out, closed, or already left. Every other date is still there.
          </p>
          <Link
            href="/tours"
            className="mt-6 inline-block rounded-field bg-flame px-6 py-3.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
          >
            Browse departures
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  // The selection made on the package page travels in the URL, so arriving at
  // the flow does not mean answering the same questions twice.
  const initialParty = {
    adults: Math.max(1, count(sp.adults, 2)),
    children: count(sp.children, 0),
    infants: count(sp.infants, 0),
  };

  const roomParam = one(sp.room) ?? null;
  const initialRoomTypeId =
    roomParam && context.pricing.roomTypes.some((r) => r.id === roomParam) ? roomParam : null;

  // `extras=<id>:<qty>,<id>:<qty>` — ids that are not on this package are
  // dropped rather than trusted.
  const initialExtras: Record<string, number> = {};
  for (const part of (one(sp.extras) ?? '').split(',')) {
    const [id, qty] = part.split(':');
    if (!id || !context.pricing.extras.some((e) => e.id === id)) continue;
    const n = Number(qty);
    if (Number.isFinite(n) && n > 0) initialExtras[id] = Math.floor(n);
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar currency={currency} />
      <main className="flex-1">
        <BookingFlow
          context={context}
          initialParty={initialParty}
          initialRoomTypeId={initialRoomTypeId}
          initialExtras={initialExtras}
        />
      </main>
      <Footer />
    </div>
  );
}
