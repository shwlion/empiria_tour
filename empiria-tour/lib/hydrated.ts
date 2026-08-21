'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * True once React has hydrated, false during the server render and the
 * hydration pass itself.
 *
 * The sanctioned way to ask "am I in a browser yet" in React 19. The obvious
 * alternative — a `useState(false)` flipped in a mount effect — forces a second
 * render on every mount and is exactly what `react-hooks/set-state-in-effect`
 * exists to stop. `useSyncExternalStore` gives the same answer with no effect
 * and no extra render.
 *
 * Use it to gate components that must read something only a browser has —
 * sessionStorage, window size, the clock — where rendering them on the server
 * would either crash or hydrate to something different.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, onClient, onServer);
}
