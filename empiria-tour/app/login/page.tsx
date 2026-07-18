import type { Metadata } from 'next';
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
        <div className="min-h-screen bg-white font-sans text-slate-900 flex flex-col">
            <Navbar />
            <main className="flex-1 flex items-center justify-center px-4">
                <div className="w-full max-w-sm rounded-2xl border border-gray-100 shadow-lg p-8 text-center">
                    <h1 className="text-2xl font-extrabold text-slate-900 mb-2">
                        Empiria<span className="text-[#F15A29]">Tour</span>
                    </h1>
                    <p className="text-sm text-gray-700 mb-6">
                        Sign in is not wired up yet. This app will use{' '}
                        <span className="font-semibold text-slate-900">Supabase Auth</span> (not Auth0).
                    </p>
                    <button
                        type="button"
                        disabled
                        className="w-full bg-[#F15A29]/60 text-white font-bold py-2.5 rounded-full cursor-not-allowed"
                    >
                        Continue with email (todo)
                    </button>
                </div>
            </main>
            <Footer />
        </div>
    );
}
