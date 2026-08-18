import Link from 'next/link';
import Image from 'next/image';
import CurrencySelector from './CurrencySelector';
import MobileNav from './MobileNav';
import UserMenu from './UserMenu';

/**
 * Floating navbar — a warm ink "plate" that reads over both the dark hero and
 * the paper pages. The Empiria flame lives in the wordmark and the auth button;
 * everything else is the quiet mono wayfinding layer.
 *
 * AUTH: session state is read client-side by <UserMenu /> (Supabase Auth, not
 * Auth0), which keeps these server-rendered pages statically renderable.
 */
export default function Navbar({ overlay = false }: { overlay?: boolean }) {
  return (
    <>
      <nav className="fixed top-4 left-1/2 z-50 w-[94%] max-w-5xl -translate-x-1/2">
        <div className="relative flex items-center justify-between rounded-xl bg-ink/90 px-4 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-md sm:px-5">
          <div className="flex items-center gap-3 sm:gap-8">
            {/* Mobile: links collapse into a hamburger dropdown */}
            <MobileNav />

            <Link href="/" className="flex items-center" aria-label="Empiria Tour home">
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
                href="/"
                className="font-mono text-[11px] uppercase tracking-label text-bone/60 transition-colors hover:text-bone"
              >
                Tours
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <CurrencySelector />
            <UserMenu />
          </div>
        </div>
      </nav>
      {/* In-flow spacer so page content sits below the floating nav (skipped when a page wants its hero under the navbar) */}
      {!overlay && <div aria-hidden="true" className="h-20" />}
    </>
  );
}
