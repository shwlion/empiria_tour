import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/urls';

/**
 * OAuth + email-confirmation callback. Supabase redirects here with a `code`;
 * we exchange it for a session cookie, then send the user on to `next` (or home).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // Only allow same-origin relative paths (no open redirects). Shared with
  // /login rather than reimplemented here — this copy was safe only by accident
  // of prefixing `origin`, and the accident would not survive a call site that
  // stopped doing that.
  const next = safeNextPath(searchParams.get('next'), origin);

  if (code && isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
