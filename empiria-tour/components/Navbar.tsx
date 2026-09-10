import Link from 'next/link';
import Image from 'next/image';
import CurrencySelector from './CurrencySelector';
import MobileNav from './MobileNav';
import UserMenu from './UserMenu';
import DestinationMenu from './DestinationMenu';
import NavShell from './NavShell';
import type { DestinationOption } from '@/components/tours/SearchBar';
import {
  getCurrencies,
  getDefaultCurrency,
  getDestinationTree,
  type DestinationNode,
} from '@/lib/catalogue';

/**
 * Site navbar, in two tones.
 *
 * 'dark' (default) is the floating ink "plate" that reads over a dark hero and
 * the inner pages — unchanged. 'light' is the Postcard look's sticky white bar
 * with the dark logo and grey links that firm up to ink, used by pages whose
 * hero sits on the white ground. The Empiria flame lives in the auth button in
 * both; everything else is the quiet wayfinding layer.
 *
 * AUTH: session state is read client-side by <UserMenu /> (Supabase Auth, not
 * Auth0), which keeps these server-rendered pages statically renderable.
 *
 * CURRENCY: the list comes from the database rather than a hard-coded constant,
 * because it decides which prices exist — a currency with no `package_prices`
 * rows would show an empty catalogue.
 *
 * DESTINATIONS: A1 requires the menu to be driven by published destinations, so
 * it is fetched here rather than written into the component.
 */

function flatten(nodes: DestinationNode[], depth = 0): DestinationOption[] {
  return nodes.flatMap((n) => [
    { path: n.path, name: n.name, depth },
    ...flatten(n.children, depth + 1),
  ]);
}

export default async function Navbar({
  overlay = false,
  currency,
  tone = 'light',
}: {
  overlay?: boolean;
  /** The currency the page is rendering in; falls back to the platform default. */
  currency?: string;
  /** 'light' is the sticky white bar of the Postcard look; 'dark' the floating ink plate. */
  tone?: 'light' | 'dark';
}) {
  const [currencies, fallback, tree] = await Promise.all([
    getCurrencies(),
    getDefaultCurrency(),
    getDestinationTree(),
  ]);
  const active = currency ?? fallback;
  const destinations = flatten(tree);
  const currencyChoices = currencies.map((c) => ({ code: c.code, symbol: c.symbol, name: c.name }));

  if (tone === 'light') {
    // Sticky rather than fixed, so the bar takes its own height in flow and no
    // spacer is needed — `overlay` has nothing to skip here.
    return (
      <NavShell>
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4 sm:px-10">
          <div className="flex items-center gap-3 sm:gap-8">
            <MobileNav destinations={destinations} tone="light" />

            <Link href="/" className="flex items-center" aria-label="Empiria Tours home">
              {/* Empiria master brand mark (dark variant for the white bar). */}
              <Image
                src="/logo.png"
                alt="Empiria"
                width={1507}
                height={522}
                priority
                className="h-10 w-auto"
              />
            </Link>

            <div className="hidden items-center gap-7 sm:flex">
              <Link
                href="/tours"
                className="flex min-h-[44px] items-center font-mono text-[13px] font-medium text-ink/70 transition-colors hover:text-ink"
              >
                Tours
              </Link>
              <Link
                href="/blog"
                className="flex min-h-[44px] items-center font-mono text-[13px] font-medium text-ink/70 transition-colors hover:text-ink"
              >
                Journal
              </Link>
              <DestinationMenu destinations={destinations} tone="light" />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <CurrencySelector currencies={currencyChoices} current={active} tone="light" />
            <UserMenu tone="light" />
          </div>
        </div>
      </NavShell>
    );
  }

  return (
    <>
      {/* Sits clear of the hero plate frame, which is inset 12px on mobile and
          24px from sm up — at top-4 the nav plate landed on that line. */}
      <nav className="fixed top-8 left-1/2 z-50 w-[94%] max-w-5xl -translate-x-1/2 sm:top-12">
        <div className="relative flex items-center justify-between rounded-xl bg-ink/90 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3 sm:gap-8">
            {/* Mobile: links collapse into a hamburger dropdown */}
            <MobileNav destinations={destinations} />

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
              <Link
                href="/blog"
                className="font-mono text-[11px] uppercase tracking-label text-bone/60 transition-colors hover:text-bone"
              >
                Journal
              </Link>
              <DestinationMenu destinations={destinations} />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <CurrencySelector currencies={currencyChoices} current={active} />
            <UserMenu />
          </div>
        </div>
      </nav>
      {/* In-flow spacer so page content sits below the floating nav (skipped when a page wants its hero under the navbar) */}
      {!overlay && <div aria-hidden="true" className="h-24 sm:h-28" />}
    </>
  );
}
