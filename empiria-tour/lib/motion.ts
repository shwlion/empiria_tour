'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the visitor has asked for reduced motion.
 *
 * Read the same way `lib/hydrated.ts` reads hydration: through
 * `useSyncExternalStore`, with a server snapshot of `false`. A `useState`
 * flipped in an effect would render the deck moving for one frame before
 * stopping it, and is the pattern `react-hooks/set-state-in-effect` exists to
 * stop. CSS already honours the preference for everything declared in
 * stylesheets; this is for the animations JavaScript schedules.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const onClient = () => window.matchMedia(QUERY).matches;
const onServer = () => false;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
