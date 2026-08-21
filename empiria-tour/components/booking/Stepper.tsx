import { Check } from 'lucide-react';

export type Step = { key: string; label: string };

/**
 * The five steps, always visible.
 *
 * Booking.com and Airbnb both show progress through checkout for the same
 * reason: an unbounded form is one people abandon. Completed steps are
 * clickable so somebody can go back and change a name without losing the rest —
 * forward steps are not, because the flow validates as it goes.
 */
export default function Stepper({
  steps,
  current,
  furthest,
  onJump,
}: {
  steps: Step[];
  current: number;
  furthest: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {steps.map((step, i) => {
        const done = i < furthest;
        const active = i === current;
        const reachable = i <= furthest;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              className={[
                'flex items-center gap-2 rounded-chip px-2 py-1 font-mono text-[10px] uppercase tracking-label transition-colors',
                active ? 'text-flame' : done ? 'text-ink hover:text-flame' : 'text-stone/50',
                reachable ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-chip border text-[10px]',
                  active
                    ? 'border-flame bg-flame text-white'
                    : done
                      ? 'border-flame/40 bg-flame/10 text-flame'
                      : 'border-line text-stone/50',
                ].join(' ')}
              >
                {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
              </span>
              {step.label}
            </button>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="h-px w-4 bg-line sm:w-8" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
