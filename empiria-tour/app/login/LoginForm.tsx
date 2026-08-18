'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

const oauthClass =
  'flex w-full items-center justify-center rounded-lg border border-line bg-paper px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:border-flame hover:bg-bone disabled:opacity-60';

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-flame';

const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-label text-stone';

export default function LoginForm() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      // With email confirmation enabled there is no session yet.
      if (!data.session) {
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
        return;
      }
      router.push('/');
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function onOAuth(provider: 'google') {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-line bg-bone p-8">
      <div className="mb-6 text-center">
        <span className="mb-4 inline-block font-mono text-[10px] uppercase tracking-label text-flame">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </span>
        <Image
          src="/logo.png"
          alt="Empiria Tour"
          width={1507}
          height={522}
          priority
          className="mx-auto h-12 w-auto"
        />
        <h1 className="sr-only">Empiria Tour account</h1>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-dashed border-line bg-paper p-4 text-center text-sm leading-relaxed text-stone">
          Sign in is not configured yet. Add{' '}
          <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
          <code className="font-mono text-ink">.env.local</code> to enable it.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <button type="button" onClick={() => onOAuth('google')} className={oauthClass}>
              Continue with Google
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[10px] uppercase tracking-label text-stone">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="At least 6 characters"
              />
            </div>

            {error && <p className="animate-shake text-sm text-ember">{error}</p>}
            {notice && <p className="text-sm text-stone">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-flame py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:opacity-60"
            >
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-stone">
            {mode === 'signin' ? 'New to Empiria Tour?' : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
                setNotice(null);
              }}
              className="font-semibold text-flame transition-colors hover:text-ember"
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
