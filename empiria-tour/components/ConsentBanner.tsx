'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useConsent, writeConsent } from '@/lib/consent';

/**
 * A1 cookie and analytics consent banner.
 *
 * Part F ties analytics to consent management, so nothing that tracks may load
 * until this returns `analytics: true`. Deliberate choices:
 *
 *  - Accept and Decline carry equal visual weight. A greyed-out decline is a
 *    dark pattern and, for a regulated seller, an avoidable argument.
 *  - Nothing is set until the visitor chooses. No "by continuing you agree".
 *  - Only the analytics category is offered, because that is all the platform
 *    actually has. A fake granular panel listing categories we do not use would
 *    be worse than one honest toggle.
 *
 * Visibility is derived from the store rather than mirrored into state: once a
 * decision is written the snapshot stops being `null` and the banner unmounts
 * on its own. `dismissed` is only the fallback for storage being unavailable,
 * where the write silently fails and the snapshot would stay `null` forever.
 */
export default function ConsentBanner() {
  const consent = useConsent();
  const [dismissed, setDismissed] = useState(false);

  function decide(analytics: boolean) {
    writeConsent(analytics);
    setDismissed(true);
  }

  // `undefined` is the pre-hydration state — render nothing rather than flash
  // the banner at people who decided months ago.
  if (dismissed || consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie and analytics consent"
      className="fixed inset-x-3 bottom-3 z-[60] sm:inset-x-6 sm:bottom-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-card border border-line bg-bone p-5 shadow-lift-panel sm:flex-row sm:items-center sm:gap-6">
        <p className="flex-1 text-[14px] leading-relaxed text-stone">
          We use essential cookies to keep you signed in and your booking in progress. We would
          also like to measure which pages people find useful — only if you say yes.{' '}
          <Link href="/privacy" className="text-flame underline underline-offset-4 hover:text-ember">
            Privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="rounded-field border border-line px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-ink transition-colors hover:border-flame hover:text-flame"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="rounded-field bg-flame px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
