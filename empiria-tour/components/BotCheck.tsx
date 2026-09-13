'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

/**
 * The Turnstile widget, rendered only when Empiria has set a site key.
 *
 * Inside a <form> the widget writes its token into a hidden
 * `cf-turnstile-response` field, so a server action reads it from FormData
 * with no help from here. The booking flow submits an object rather than a
 * form, so it takes the token through `onToken` instead; the callback is
 * also called with null when a token expires, so a long pause on the last
 * step cannot submit a stale one.
 *
 * Without a site key this renders nothing at all — no script, no box — and
 * lib/botcheck.ts on the server passes everything, so the two halves are
 * switched on by the same pair of keys and never disagree.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export const isBotCheckEnabled = !!SITE_KEY;

export default function BotCheck({
  onToken,
  resetKey,
  className,
}: {
  onToken?: (token: string | null) => void;
  /**
   * A token is single-use: once the server has verified it, a second submit
   * with the same one is refused. Pass the form's last result here and the
   * widget fetches a fresh token whenever it changes.
   */
  resetKey?: unknown;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // The latest callback, so the widget's own (long-lived) closures never call
  // a stale one.
  const latest = useRef(onToken);
  useEffect(() => {
    latest.current = onToken;
  });

  useEffect(() => {
    const ts = window.turnstile;
    const el = host.current;
    if (!SITE_KEY || !ready || !ts || !el || widget.current) return;
    widget.current = ts.render(el, {
      sitekey: SITE_KEY,
      size: 'flexible',
      theme: 'light',
      callback: (token: string) => latest.current?.(token),
      'expired-callback': () => latest.current?.(null),
      'error-callback': () => latest.current?.(null),
    });
    return () => {
      if (widget.current) {
        try {
          ts.remove(widget.current);
        } catch {
          /* already gone */
        }
        widget.current = null;
      }
    };
  }, [ready]);

  useEffect(() => {
    const ts = window.turnstile;
    if (!ts || !widget.current) return;
    try {
      ts.reset(widget.current);
      latest.current?.(null);
    } catch {
      /* the widget is gone; the next mount renders a new one */
    }
  }, [resetKey]);

  if (!SITE_KEY) return null;

  return (
    <>
      {/* onReady fires after load and again on every later mount, which is
          the case of a second form in the same session with the script
          already on the page. */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={host} className={className} />
    </>
  );
}
