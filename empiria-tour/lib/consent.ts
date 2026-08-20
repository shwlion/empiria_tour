'use client';

import { useSyncExternalStore } from 'react';

/**
 * Cookie / analytics consent, modelled as an external store.
 *
 * The decision lives in localStorage rather than a cookie, so it never travels
 * with a request and cannot itself become something to disclose. That makes it
 * an *external* store from React's point of view — which is exactly what
 * `useSyncExternalStore` exists for. Reading it in a mount effect and calling
 * setState works, but it is the pattern React 19 now flags: it forces a second
 * render on every mount and gives React no way to keep concurrent renders
 * consistent.
 *
 * Three-valued on purpose:
 *
 *   undefined — not known yet (server render and the hydration pass)
 *   null      — known, and the visitor has not decided
 *   ConsentState — known, and decided
 *
 * The `undefined` state is what keeps the banner from flashing. On the server
 * we cannot know whether this visitor already decided, so we render nothing;
 * React swaps in the real value the moment hydration finishes.
 */

export const CONSENT_KEY = 'empiria_consent_v1';
export const CONSENT_EVENT = 'empiria:consent';

export type ConsentState = { analytics: boolean; decidedAt: string };
export type ConsentSnapshot = ConsentState | null | undefined;

// getSnapshot must return a referentially stable value or React re-renders
// forever, so the parse result is memoised against the raw string it came from.
let cachedRaw: string | null = null;
let cachedValue: ConsentState | null = null;

/** Read the stored decision. Returns null when nothing has been decided yet. */
export function readConsent(): ConsentState | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CONSENT_KEY);
  } catch {
    // Private browsing, or storage blocked. Treat as undecided rather than
    // assuming consent — the safe default is not to track.
    return null;
  }

  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedValue = raw ? (JSON.parse(raw) as ConsentState) : null;
    } catch {
      cachedValue = null;
    }
  }
  return cachedValue;
}

/**
 * Record a decision and tell every listener — this tab and any other one the
 * visitor has open. Declining in one tab should stop tracking in all of them.
 */
export function writeConsent(analytics: boolean): void {
  const state: ConsentState = { analytics, decidedAt: new Date().toISOString() };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the choice still holds for this page view.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: { analytics } }));
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onStoreChange);
  // `storage` only fires in *other* tabs, which is precisely the case the
  // custom event cannot cover.
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

const serverSnapshot = (): ConsentSnapshot => undefined;

/** Subscribe to the consent decision. See the three-valued note above. */
export function useConsent(): ConsentSnapshot {
  return useSyncExternalStore<ConsentSnapshot>(subscribe, readConsent, serverSnapshot);
}
