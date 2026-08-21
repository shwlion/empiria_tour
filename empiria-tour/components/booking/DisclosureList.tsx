'use client';

import type { BookingDisclosure } from '@/lib/booking';

/**
 * Part D's disclosure blocks for one step.
 *
 * Two behaviours the Agreement actually turns on:
 *
 *  - Blocks marked `requires_acknowledgement` render a checkbox and cannot be
 *    passed without ticking it. Nothing is pre-ticked, and there is no "by
 *    continuing you agree" — consent that was never given is worse than no
 *    record of consent.
 *  - The wording shown is captured verbatim into `booking_acknowledgements`.
 *    What matters in a dispute is the text that was on screen that day, not
 *    whatever the block says by the time anyone goes looking.
 */
export default function DisclosureList({
  blocks,
  accepted,
  onToggle,
  showErrors = false,
}: {
  blocks: BookingDisclosure[];
  accepted: Record<string, boolean>;
  onToggle: (id: string, value: boolean) => void;
  showErrors?: boolean;
}) {
  if (blocks.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b) => {
        const needsTick = b.requiresAcknowledgement;
        const ticked = accepted[b.id] === true;
        const missing = showErrors && needsTick && !ticked;

        if (!needsTick) {
          return (
            <div key={b.id} className="rounded-card border border-line bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-label text-stone">{b.name}</p>
              <p className="mt-2 whitespace-pre-line text-[13.5px] leading-relaxed text-stone">
                {b.body}
              </p>
            </div>
          );
        }

        return (
          <label
            key={b.id}
            className={[
              'flex cursor-pointer gap-3 rounded-card border p-4 transition-colors',
              missing ? 'border-ember bg-ember/5' : 'border-line bg-paper hover:border-flame',
            ].join(' ')}
          >
            <input
              type="checkbox"
              checked={ticked}
              onChange={(e) => onToggle(b.id, e.target.checked)}
              aria-describedby={`disclosure-${b.id}`}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--flame)]"
            />
            <span className="flex-1">
              <span className="block text-[14px] font-medium text-ink">{b.name}</span>
              <span
                id={`disclosure-${b.id}`}
                className="mt-1.5 block whitespace-pre-line text-[13.5px] leading-relaxed text-stone"
              >
                {b.body}
              </span>
              {missing && (
                <span className="mt-2 block font-mono text-[10px] uppercase tracking-label text-ember">
                  Please confirm to continue
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
