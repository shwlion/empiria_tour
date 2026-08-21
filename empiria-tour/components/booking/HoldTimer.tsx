'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Clock } from 'lucide-react';

/**
 * The countdown on the held seats.
 *
 * Shown rather than hidden on purpose. The seats really are reserved and really
 * do lapse, and a traveller who loses them without warning has been treated
 * badly — while a countdown that is honest about a 20-minute window is not the
 * same thing as Booking.com's "3 people are looking at this right now". One is
 * a fact about inventory; the other is manufactured pressure.
 *
 * The window is extended automatically while somebody is still filling the form
 * in, so it only ever runs out on a flow nobody is using.
 *
 * The clock is read through `useSyncExternalStore` rather than kept in state and
 * pushed by an interval. Time is an external system — the canonical case the
 * hook exists for — and the remaining seconds are then derived during render
 * instead of being a second copy of the truth that has to be kept in step.
 */

/** Quantised to the second so repeated reads inside one render agree. */
const readNow = () => Math.floor(Date.now() / 1000) * 1000;
/** Zero means "no clock yet": the server render, and the hydration pass. */
const noClock = () => 0;

function useNow(active: boolean): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      const id = setInterval(onChange, 1000);
      return () => clearInterval(id);
    },
    [active]
  );
  return useSyncExternalStore(subscribe, readNow, noClock);
}

/** Top up with time to spare rather than at the last second. */
const REFRESH_BELOW_SECONDS = 300;

export default function HoldTimer({
  expiresAt,
  onExpire,
  onRefresh,
}: {
  expiresAt: string | null;
  onExpire: () => void;
  /** Called once when the window is running low and the traveller is still here. */
  onRefresh: () => void;
}) {
  const now = useNow(expiresAt != null);
  const deadline = expiresAt ? new Date(expiresAt).getTime() : null;

  const remaining =
    deadline == null || now === 0 ? null : Math.max(0, Math.round((deadline - now) / 1000));

  // Crossing a deadline is an event, not derived state: the parent has to be
  // told, and only once per window.
  const refreshedFor = useRef<string | null>(null);
  const expiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (remaining == null || !expiresAt) return;
    if (remaining === 0) {
      if (expiredFor.current !== expiresAt) {
        expiredFor.current = expiresAt;
        onExpire();
      }
      return;
    }
    if (remaining < REFRESH_BELOW_SECONDS && refreshedFor.current !== expiresAt) {
      refreshedFor.current = expiresAt;
      onRefresh();
    }
  }, [remaining, expiresAt, onExpire, onRefresh]);

  if (remaining == null) return null;

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const low = remaining < 120;

  return (
    <p
      className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-label ${
        low ? 'text-ember' : 'text-stone'
      }`}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        Seats held · {mins}:{String(secs).padStart(2, '0')}
      </span>
    </p>
  );
}
