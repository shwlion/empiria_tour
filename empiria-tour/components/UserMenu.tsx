'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';

const ctaClass =
  'whitespace-nowrap rounded-lg bg-flame px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember sm:px-5 sm:py-2.5';

/**
 * Client-side auth indicator for the Navbar. Reads the Supabase session in the
 * browser (via the cookie the middleware keeps fresh) so the public pages stay
 * statically renderable — no server `cookies()` call is forced into every page.
 * Shows Sign In for guests, or the email + Sign out for a signed-in user.
 */
export default function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  // With Supabase unconfigured there is no session to wait for, so the menu is
  // ready on the first render. NEXT_PUBLIC_* vars are inlined at build time, so
  // this initialiser agrees between the server and client render.
  const [ready, setReady] = useState(() => !isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setEmail(null);
    router.refresh();
  }

  // Until the session resolves (and for guests) show the Sign In CTA.
  if (!ready || !email) {
    return (
      <a href="/login" className={ctaClass}>
        Sign In
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="hidden max-w-[16ch] truncate align-middle font-mono text-[11px] uppercase tracking-label text-bone/60 sm:inline-block">
        {email}
      </span>
      <button type="button" onClick={signOut} className={ctaClass}>
        Sign out
      </button>
    </div>
  );
}
