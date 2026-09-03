'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, ShieldCheck, Compass, Luggage, UserRound } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';
import { PARTNER_URL, TOUR_ADMIN_URL } from '@/lib/urls';

const ctaClass =
  'whitespace-nowrap rounded-lg bg-flame px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember sm:px-5 sm:py-2.5';

type Account = { email: string; role: string };

/**
 * A1's account menu.
 *
 * Session state is read in the browser (via the cookie the proxy keeps fresh)
 * so the public pages stay statically renderable — no `cookies()` call forced
 * into every page.
 *
 * The role is read too, and it is the point of this component. Somebody signed
 * in as staff on the storefront has no way to reach the console except by
 * remembering its address; somebody approved as a partner has no way back to
 * their dashboard except the invitation email. Both links live here, inside the
 * menu of a person who already holds that role — which discloses nothing,
 * because seeing it requires already being it. That is the difference between
 * this and putting a console link in a public footer, which tells every visitor
 * and every scanner where to knock.
 *
 * The read is permitted by the "read own profile" policy on `users`. A traveller
 * gets nothing extra and one wasted round trip; that is the right trade for not
 * dragging the whole navbar onto the server.
 */
export default function UserMenu() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  // With Supabase unconfigured there is no session to wait for, so the menu is
  // ready on the first render. NEXT_PUBLIC_* vars are inlined at build time, so
  // this initialiser agrees between the server and client render.
  const [ready, setReady] = useState(() => !isSupabaseConfigured());
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user?.email) {
        if (!cancelled) {
          setAccount(null);
          setReady(true);
          setOpen(false);
        }
        return;
      }
      // Role decides which destinations the menu offers. Failing to read it is
      // not an error worth surfacing — the menu simply behaves as a traveller's.
      supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          setAccount({ email: user.email as string, role: data?.role ?? 'traveller' });
          setReady(true);
        });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Close on Escape or a click elsewhere. Both are events, not derived state,
  // so they belong on the document rather than in a render.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAccount(null);
    setOpen(false);
    router.refresh();
  }, [router]);

  if (!ready || !account) {
    return (
      <a href="/login" className={ctaClass}>
        Sign In
      </a>
    );
  }

  const isStaff = account.role === 'admin' || account.role === 'agent';
  const isPartner = account.role === 'partner';
  const itemClass =
    'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] text-ink transition-colors hover:bg-bone';

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-bone/25 px-3 py-2 font-mono text-[11px] uppercase tracking-label text-bone transition-colors hover:border-flame hover:text-white sm:px-3.5"
      >
        <span className="hidden max-w-[14ch] truncate sm:inline">{account.email}</span>
        <span className="sm:hidden">Account</span>
        <ChevronDown size={13} aria-hidden="true" className={open ? 'rotate-180' : undefined} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-card border border-line bg-paper shadow-lift-panel"
        >
          <p className="truncate border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-label text-stone">
            {account.email}
          </p>

          <a href="/account/bookings" role="menuitem" className={itemClass}>
            <Luggage size={15} aria-hidden="true" className="text-stone" />
            My bookings
          </a>

          <a href="/account" role="menuitem" className={itemClass}>
            <UserRound size={15} aria-hidden="true" className="text-stone" />
            Account
          </a>

          {isStaff && (
            <a href={`${TOUR_ADMIN_URL}/dashboard`} role="menuitem" className={itemClass}>
              <ShieldCheck size={15} aria-hidden="true" className="text-flame" />
              Admin console
            </a>
          )}

          {isPartner && (
            <a href={`${PARTNER_URL}/dashboard`} role="menuitem" className={itemClass}>
              <Compass size={15} aria-hidden="true" className="text-flame" />
              Partner dashboard
            </a>
          )}

          <button type="button" role="menuitem" onClick={signOut} className={`${itemClass} border-t border-line`}>
            <LogOut size={15} aria-hidden="true" className="text-stone" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
