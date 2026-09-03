'use client';

import { useState } from 'react';
import { Check, Link2, Mail, Share2 } from 'lucide-react';
import { useIsHydrated } from '@/lib/hydrated';

/**
 * Send this tour to somebody.
 *
 * The native share sheet first, where the browser has one. It is the only
 * option that reaches the app the sender actually uses — WhatsApp, KakaoTalk,
 * Messages, whatever is on their phone — without this site carrying a button
 * per network, and without a vendor SDK. §5.7 makes every added dependency a
 * licence to clear, and a share button is not worth one.
 *
 * Everything below it works with no JavaScript privileges at all: a copyable
 * link and a `mailto:`. Desktop Safari and Firefox have no share sheet, so
 * that is the common path rather than a degraded one.
 *
 * The sheet is offered only after hydration. `navigator.share` cannot be
 * detected on the server, and rendering the button unconditionally would
 * either hydrate to something different or offer a control that does nothing.
 */
export default function ShareTour({
  url,
  title,
  summary,
}: {
  url: string;
  title: string;
  summary?: string | null;
}) {
  const hydrated = useIsHydrated();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const canShareNatively =
    hydrated && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function shareNatively() {
    try {
      await navigator.share({ title, text: summary ?? undefined, url });
    } catch {
      // Dismissing the sheet rejects. That is a choice, not a failure.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Denied, or an insecure context. Say so rather than looking inert.
      setCopied(false);
      setCopyFailed(true);
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
    `${summary ? `${summary}\n\n` : ''}${url}`
  )}`;

  const button =
    'inline-flex items-center gap-2 rounded-field border border-line bg-bone px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-flame hover:text-flame';

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[10px] uppercase tracking-label text-stone">Share</span>

        {canShareNatively && (
          <button type="button" onClick={shareNatively} className={button}>
            <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
            Share
          </button>
        )}

        <button
          type="button"
          onClick={copyLink}
          className={button}
          aria-live="polite"
          disabled={!hydrated}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-flame" aria-hidden="true" />
          ) : (
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Link copied' : 'Copy link'}
        </button>

        <a href={mailto} className={button}>
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Email
        </a>
      </div>

      {copyFailed && (
        <p className="mt-2 text-[12.5px] text-stone">
          Your browser would not let the page reach the clipboard. The address in the bar is the
          one to send.
        </p>
      )}
    </div>
  );
}
