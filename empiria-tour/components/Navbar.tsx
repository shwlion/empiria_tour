import Link from 'next/link';
import Image from 'next/image';
import CurrencySelector from './CurrencySelector';
import MobileNav from './MobileNav';
import UserMenu from './UserMenu';
import { getCurrencies, getDefaultCurrency } from '@/lib/catalogue';

/**
 * Floating navbar — a warm ink "plate" that reads over both the dark hero and
 * the paper pages. The Empiria flame lives in the wordmark and the auth button;
 * everything else is the quiet mono wayfinding layer.
 *
 * AUTH: session state is read client-side by <UserMenu /> (Supabase Auth, not
 * Auth0), which keeps these server-rendered pages statically renderable.
 *
 * CURRENCY: the list comes from the database rather than a hard-coded constant,
 * because it decides which prices exist — a currency with no `package_prices`
 * rows would show an empty catalogue.
 */
export default async function Navbar({
  overlay = false,
  currency,
}: {
  overlay?: boolean;
  /** The currency the page is rendering in; falls back to the platform default. */
  currency?: string;
}) {
  const [currencies, fallback] = await Promise.all([getCurrencies(), getDefaultCurrency()]);
  const active = currency ?? fallback;

  return (
    <>
      {/* Sits clear of the hero plate frame, which is inset 12px on mobile and
          24px from sm up — at top-4 the nav plate landed on that line. */}
      <nav className="fixed top-8 left-1/2 z-50 w-[94%] max-w-5xl -translate-x-1/2 sm:top-12">
        <div className="relative flex items-center justify-between rounded-xl bg-ink/90 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3 sm:gap-8">
            {/* Mobile: links collapse into a hamburger dropdown */}
            <MobileNav />

            <Link href="/" className="flex items-center" aria-label="Empiria Tours home">
              {/* Empiria master brand mark (white variant for the dark nav plate). */}
              <Image
                src="/logo-white.png"
                alt="Empiria"
                width={1507}
                height={522}
                priority
                className="h-10 w-auto"
              />
            </Link>

            <div className="hidden items-center gap-6 sm:flex">
              <Link
                href="/tours"
                className="font-mono text-[11px] uppercase tracking-label text-bone/60 transition-colors hover:text-bone"
              >
                Tours
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <CurrencySelector
              currencies={currencies.map((c) => ({ code: c.code, symbol: c.symbol, name: c.name }))}
              current={active}
            />
            <UserMenu />
          </div>
        </div>
      </nav>
      {/* In-flow spacer so page content sits below the floating nav (skipped when a page wants its hero under the navbar) */}
      {!overlay && <div aria-hidden="true" className="h-24 sm:h-28" />}
    </>
  );
}
