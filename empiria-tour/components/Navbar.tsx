import Link from 'next/link';
import CurrencySelector from './CurrencySelector';
import MobileNav from './MobileNav';
import { APEX_URL } from '@/lib/urls';

/**
 * Floating pill navbar (same design as the Empiria shop).
 *
 * AUTH: the shop navbar reads an Auth0 session here to show a UserMenu. This
 * app is moving to Supabase Auth, so the session read is intentionally removed
 * for now — the "Sign In" button points at the (placeholder) /login route.
 * Wire the Supabase server client in here once auth is set up, then swap the
 * button for a UserMenu when a session exists.
 */
export default function Navbar({ overlay = false }: { overlay?: boolean }) {
  return (
    <>
      <nav className="fixed top-4 left-1/2 z-50 w-[94%] max-w-5xl -translate-x-1/2">
        <div className="relative flex items-center justify-between rounded-2xl bg-white px-4 sm:px-6 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-2 sm:gap-8">
            {/* Mobile: links collapse into a hamburger dropdown */}
            <MobileNav />

            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-slate-900">
                Empiria<span className="text-[#F15A29]">Tour</span>
              </span>
            </Link>

            <div className="hidden sm:flex items-center gap-6">
              <Link href="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Tours</Link>
              <a href={`${APEX_URL}/about`} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">About</a>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <CurrencySelector />
            <a
              href="/login"
              className="text-sm font-bold bg-black text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-full hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              Sign In
            </a>
          </div>
        </div>
      </nav>
      {/* In-flow spacer so page content sits below the floating pill (skipped when a page wants its hero under the navbar) */}
      {!overlay && <div aria-hidden="true" className="h-20" />}
    </>
  );
}
