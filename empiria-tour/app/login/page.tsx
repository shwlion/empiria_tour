import type { Metadata } from 'next';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
    title: 'Sign In',
};

/**
 * STUB — sign in.
 *
 * This app deliberately does NOT use Auth0. Wire Supabase Auth here:
 *   1. `bun add @supabase/ssr`
 *   2. Add a browser client (createBrowserClient) + a server client
 *      (createServerClient reading/writing cookies) under lib/.
 *   3. Replace this form with email/password + OAuth (Google/Apple) via
 *      supabase.auth.signInWithPassword / signInWithOAuth.
 *   4. Add middleware to refresh the session cookie, and gate dashboards by the
 *      `role` column on your `users` table (keyed by the Supabase auth UUID —
 *      the replacement for the shop's `auth0_id`).
 */
export default function LoginPage() {
    return (
        <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
            <Navbar />
            <main className="flex flex-1 items-center justify-center px-4 py-16">
                <div className="w-full max-w-sm rounded-lg border border-line bg-bone p-8 text-center">
                    <span className="mb-4 inline-block font-mono text-[10px] uppercase tracking-label text-flame">
                        Sign in
                    </span>
                    <Image
                        src="/logo.png"
                        alt="Empiria"
                        width={189}
                        height={63}
                        className="mx-auto mb-4 h-9 w-auto"
                    />
                    <h1 className="sr-only">Empiria Tour</h1>
                    <p className="mb-6 text-sm leading-relaxed text-stone">
                        Sign in isn&rsquo;t wired up yet. This app will use{' '}
                        <span className="font-semibold text-ink">Supabase Auth</span> (not Auth0).
                    </p>
                    <button
                        type="button"
                        disabled
                        className="w-full cursor-not-allowed rounded-lg bg-flame/50 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white"
                    >
                        Continue with email (todo)
                    </button>
                </div>
            </main>
            <Footer />
        </div>
    );
}
