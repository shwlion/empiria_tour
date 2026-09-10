'use client';

/**
 * The partner application, taken a step at a time.
 *
 * Three constraints shape this, and each of them is a way the obvious
 * implementation loses somebody's application:
 *
 * 1. **Every step stays in the DOM.** The form is one server action; only
 *    mounted inputs reach FormData. A stepper that renders `steps[current]`
 *    would silently drop everything the applicant typed on an earlier step.
 *    Inactive panels are hidden, never unmounted — and never keyed, because a
 *    changing key remounts and clears them.
 *
 * 2. **It must work without JavaScript.** The form is a plain server action
 *    today. So the server renders every panel visible and the chrome hidden;
 *    `html.js` — set by the inline script in app/layout.tsx before paint —
 *    is what collapses it into a stepper. No JS means the long form, not a
 *    dead Continue button.
 *
 * 3. **A hidden `required` field cannot be focused.** Chrome refuses the
 *    submit with "an invalid form control is not focusable" and shows the
 *    applicant nothing. So advancing validates the step you are leaving, and
 *    submitting sweeps every panel and jumps to the first invalid one.
 *
 * The motion is Web Animations plus CSS transitions rather than a library:
 * the same call `useDeckEngine.ts` made when it ported the GSAP card deck.
 */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Check } from 'lucide-react';

export type StepDef = { id: string; title: string };

const EASE = 'cubic-bezier(.2, .8, .2, 1)';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function ApplyStepper({
  steps,
  children,
  submitLabel,
  pending = false,
  jumpToStep,
  errorSignal = null,
}: {
  steps: StepDef[];
  /** One panel per step, in order. All of them stay mounted. */
  children: React.ReactNode[];
  submitLabel: string;
  pending?: boolean;
  /**
   * 1-based step the server's field errors belong to, or null. Changing this
   * moves the applicant to the error rather than leaving it on a panel they
   * cannot see.
   */
  jumpToStep?: number | null;
  /**
   * The server's response object, compared by identity. Two submissions can
   * fail on the same step, so a step number alone would move the applicant
   * only the first time; a fresh object every response does not.
   */
  errorSignal?: unknown;
}) {
  const total = steps.length;
  const [current, setCurrent] = useState(1);
  const [direction, setDirection] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const [seenSignal, setSeenSignal] = useState<unknown>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  const activePanel = () => panelRefs.current[current - 1] ?? null;

  /** Slide and fade the panel being revealed. */
  const animateIn = useCallback((index: number, direction: number) => {
    const panel = panelRefs.current[index];
    if (!panel || prefersReducedMotion()) return;
    panel.animate(
      [
        { opacity: 0, transform: `translateX(${direction >= 0 ? 20 : -20}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 320, easing: EASE, fill: 'none' }
    );
  }, []);

  /**
   * Everything that follows a step change: measure the panel so the container
   * can transition to its height, slide it in, and move focus to its heading.
   * A stepper that swaps the whole form under a screen reader without saying
   * so is a stepper that loses that user.
   */
  useEffect(() => {
    const panel = panelRefs.current[current - 1];
    if (!panel) return;

    const observer = new ResizeObserver(() => setHeight(panel.offsetHeight));
    observer.observe(panel);

    if (direction !== 0) {
      animateIn(current - 1, direction);
      panel.querySelector<HTMLElement>('[data-step-heading]')?.focus();
    }
    return () => observer.disconnect();
  }, [animateIn, current, direction]);

  const goTo = useCallback(
    (next: number, dir: number) => {
      if (next < 1 || next > total || next === current) return;
      setDirection(dir);
      setCurrent(next);
    },
    [current, total]
  );

  /*
    The server rejected a field on a panel the applicant may not be looking at.
    Adjusted during render rather than in an effect — React's documented way to
    respond to a changed prop, and it avoids the cascading re-render an effect
    that calls setState would cause.

    Keyed on the response's identity, not on the step number: two submissions
    can fail on the same step, and comparing numbers alone would jump only for
    the first.
  */
  if (errorSignal !== seenSignal) {
    setSeenSignal(errorSignal);
    if (jumpToStep && jumpToStep !== current) {
      setDirection(jumpToStep > current ? 1 : -1);
      setCurrent(jumpToStep);
    }
  }

  /** The first field in `panel` that the browser considers invalid. */
  const firstInvalid = (panel: HTMLElement | null): HTMLElement | null => {
    if (!panel) return null;
    const controls = panel.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    );
    for (const control of controls) {
      if (!control.checkValidity()) return control;
    }
    return null;
  };

  /**
   * Bring a refused field into view before complaining about it.
   *
   * Continue sits at the foot of a long panel, so the first empty field is
   * usually off screen. Calling reportValidity() alone pops the browser's
   * bubble somewhere the applicant is not looking, and the button reads as
   * broken — the page simply does not move.
   */
  const revealInvalid = useCallback((bad: HTMLElement) => {
    bad.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    bad.focus({ preventScroll: true });
    // After the scroll, or the bubble is drawn against the old position.
    window.setTimeout(() => (bad as HTMLInputElement).reportValidity(), 260);
  }, []);

  const handleNext = useCallback(() => {
    const bad = firstInvalid(activePanel());
    if (bad) {
      revealInvalid(bad);
      return;
    }
    goTo(current + 1, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, goTo, revealInvalid]);

  /**
   * Before the form submits, find the first invalid control anywhere — it may
   * sit on a hidden panel, where the browser can neither focus it nor tell the
   * applicant what is wrong.
   */
  const handleSubmitCapture = useCallback(
    (event: Event) => {
      for (let i = 0; i < total; i++) {
        const bad = firstInvalid(panelRefs.current[i]);
        if (!bad) continue;
        event.preventDefault();
        event.stopPropagation();
        if (i + 1 !== current) goTo(i + 1, i + 1 > current ? 1 : -1);
        requestAnimationFrame(() => revealInvalid(bad));
        return;
      }
    },
    [current, goTo, revealInvalid, total]
  );

  /*
    The form carries `noValidate` (set in ApplyForm) and that is what makes
    this listener reachable at all.

    The HTML submission algorithm runs interactive constraint validation
    BEFORE dispatching `submit`, and aborts if anything is invalid. So with
    native validation on, a `required` field on a hidden panel meant the event
    was never dispatched, this sweep never ran, and the applicant got nothing
    but a console line — exactly the failure it was written to prevent.
    `noValidate` hands validation to us; `handleNext` and `revealInvalid`
    still call `reportValidity()` on individual controls, which is unaffected
    by the attribute.

    Bound to the real <form>, not to a wrapper inside it. A submit event fires
    on the form element itself, so a handler on any descendant — capture phase
    or not — never sees it. That mistake fails silently: the sweep simply
    never runs, and the first hidden invalid field takes the submit down with
    a console error the applicant cannot see.
  */
  useEffect(() => {
    const form = viewportRef.current?.closest('form');
    if (!form) return;
    form.addEventListener('submit', handleSubmitCapture, true);
    return () => form.removeEventListener('submit', handleSubmitCapture, true);
  }, [handleSubmitCapture]);

  /**
   * Enter in a text field submits the form by default. On any step but the
   * last that is not what the applicant means — they mean Continue.
   * Textareas keep Enter for newlines.
   */
  /**
   * Jumping by indicator. Going back is always allowed — you cannot damage
   * anything by re-reading a step — but going forward runs the same check
   * Continue does, or the dots become a way round the validation and land
   * the applicant on a later step with a required field left empty behind
   * them.
   */
  const handleDot = (target: number) => {
    if (target > current) {
      const bad = firstInvalid(activePanel());
      if (bad) {
        revealInvalid(bad);
        return;
      }
    }
    goTo(target, target > current ? 1 : -1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || current === total) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== 'INPUT') return;
    event.preventDefault();
    handleNext();
  };

  /*
    The fallback submit only exists for the window in which React cannot help:
    no JavaScript at all, or the gap between first paint and hydration. CSS
    alone was not enough — `display:none` does not take a submit button out of
    implicit submission, so it stayed the form's default button and Enter fired
    the whole application from step 1. It is unmounted instead.

    Starting false and flipping in an effect is deliberate: the server render
    and the first client render agree, so there is no hydration mismatch, and
    the button is real until React is ready to replace it.
  */
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isLast = current === total;

  return (
    <div className="apply-stepper" onKeyDown={handleKeyDown}>
      {/* Indicators. Hidden until html.js, so no-JS sees a plain long form. */}
      <ol className="apply-stepper__chrome mb-8 items-center gap-0" aria-label="Application steps">
        {steps.map((step, index) => {
          const number = index + 1;
          const state = current === number ? 'active' : current > number ? 'complete' : 'ahead';
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => handleDot(number)}
                aria-current={state === 'active' ? 'step' : undefined}
                aria-label={`Step ${number}: ${step.title}`}
                className="apply-stepper__dot"
                data-state={state}
              >
                {state === 'complete' ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <span className="font-mono text-[12px] font-semibold">{number}</span>
                )}
              </button>

              <span className="ml-3 hidden font-mono text-[10px] uppercase tracking-label text-stone sm:inline">
                {step.title}
              </span>

              {number < total && (
                <span className="apply-stepper__connector" data-complete={current > number} aria-hidden="true">
                  <span className="apply-stepper__connector-fill" />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div
        ref={viewportRef}
        className="apply-stepper__viewport"
        style={height !== null ? { height } : undefined}
      >
        {children.map((panel, index) => (
          <div
            // Index as key is correct here and nothing else would be: the
            // panels are a fixed, ordered list that never reorders, and a key
            // that changed would remount the inputs and wipe what was typed.
            key={steps[index]?.id ?? index}
            ref={(node) => {
              panelRefs.current[index] = node;
            }}
            className="apply-step"
            data-active={current === index + 1}
          >
            <h3
              data-step-heading
              tabIndex={-1}
              id={`${headingId}-${index}`}
              className="apply-stepper__chrome mb-5 font-mono text-[10px] uppercase tracking-label text-flame outline-none"
            >
              {steps[index]?.title}
            </h3>
            {panel}
          </div>
        ))}
      </div>

      <div className="apply-stepper__chrome mt-8 flex-wrap items-center gap-4">
        {current > 1 && (
          <button
            type="button"
            onClick={() => goTo(current - 1, -1)}
            className="font-mono text-[11px] uppercase tracking-label text-stone transition-colors hover:text-ink"
          >
            Back
          </button>
        )}

        {isLast ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded-field bg-flame px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:opacity-60"
          >
            {pending ? 'Sending…' : submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="rounded-field bg-flame px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
          >
            Continue
          </button>
        )}

        <p className="text-[12px] leading-relaxed text-stone">
          Step {current} of {total} · We use these details only to assess the application.
        </p>
      </div>

      {!hydrated && (
      <div className="apply-stepper__nojs mt-8 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-field bg-flame px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:opacity-60"
        >
          {pending ? 'Sending…' : submitLabel}
        </button>
        <p className="text-[12px] leading-relaxed text-stone">
          We use these details only to assess the application.
        </p>
      </div>
      )}
    </div>
  );
}
