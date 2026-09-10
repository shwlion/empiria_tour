'use client';

/**
 * The home gallery: vertical scroll pins the section and drives the row of
 * cards sideways.
 *
 * The cards are server components — they arrive as `children` so `TourCard`
 * and its data stay on the server. This file only moves them.
 *
 * Three conditions skip pinning entirely and leave a plain snap-scrolling
 * row, which is also the no-JS and pre-hydration state:
 *
 *   - the row already fits, so there is nothing to travel;
 *   - `prefers-reduced-motion`, matching the block in globals.css;
 *   - narrow viewports, where hijacking touch scroll is worse than a swipe.
 *
 * Widths are the whole problem with pinning. `useLayoutEffect` runs after the
 * DOM is built and before paint, so React is never the thing that makes them
 * wrong — the three web fonts reflowing text and next/image settling are, and
 * both land after any fixed delay would have fired. So rather than guess at a
 * timeout, every measurement is a function ScrollTrigger re-runs on refresh,
 * and we refresh on the signals that actually mean a width changed.
 */

import { useLayoutEffect, useRef } from 'react';

type Props = {
  children: React.ReactNode;
  /** Accessible name for the scrollable region. */
  label: string;
  /**
   * Rendered inside the pinned area, above the row. The section heading
   * belongs here rather than outside: what gets pinned is what stays on
   * screen, and a gallery whose title has scrolled away reads as unmoored.
   */
  header?: React.ReactNode;
};

export default function HorizontalGallery({ children, label, header }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return;

    let disposed = false;
    // Cleanups registered as setup progresses, unwound in reverse on teardown.
    const teardown: Array<() => void> = [];

    (async () => {
      // Loaded here rather than imported at module scope so GSAP stays out of
      // the bundle for anyone who never scrolls a viewport wide enough to pin.
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (disposed) return;

      gsap.registerPlugin(ScrollTrigger);

      // How far the row must travel. A function, not a number: ScrollTrigger
      // re-runs it on every refresh, so a late-loading font cannot leave a
      // stale distance baked into the tween.
      const distance = () => Math.max(0, track.scrollWidth - root.offsetWidth);

      // One card plus one gap, read off the live layout rather than assumed,
      // so it follows the responsive widths without being told about them.
      const pitch = () => {
        const [a, b] = track.children as unknown as HTMLElement[];
        return a && b ? b.offsetLeft - a.offsetLeft : 0;
      };

      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        mm.add(
          {
            wide: '(min-width: 768px)',
            motion: '(prefers-reduced-motion: no-preference)',
          },
          (context) => {
            const { wide, motion } = context.conditions as {
              wide: boolean;
              motion: boolean;
            };
            // Never pin a row that already fits: the section would grab the
            // page and hand it straight back, which reads as a broken scroll.
            if (!wide || !motion || distance() === 0) return;

            // The row is driven directly, so the native scrollbar would be a
            // second, conflicting way to move it.
            track.style.overflowX = 'hidden';

            const tween = gsap.to(track, {
              x: () => -distance(),
              ease: 'none',
              scrollTrigger: {
                trigger: root,
                start: 'center center',
                end: () => '+=' + distance(),
                pin: true,
                pinSpacing: true,
                anticipatePin: 1,
                scrub: 1,
                invalidateOnRefresh: true,
                /*
                  Come to rest on a card boundary, never mid-card. Because the
                  cards are sized to fill the container exactly, landing on a
                  multiple of the pitch means every stop shows whole cards.
                  Recomputed per call so a resize cannot leave it stale.
                */
                snap: {
                  snapTo: (value) => {
                    const d = distance();
                    const step = d > 0 ? pitch() / d : 0;
                    if (!step) return value;
                    return Math.min(1, Math.round(value / step) * step);
                  },
                  duration: { min: 0.15, max: 0.35 },
                  ease: 'power1.inOut',
                  delay: 0.05,
                },
              },
            });

            return () => {
              tween.scrollTrigger?.kill();
              tween.kill();
              track.style.overflowX = '';
              gsap.set(track, { clearProps: 'transform' });
            };
          }
        );

        teardown.push(() => mm.revert());
      }, root);

      teardown.push(() => ctx.revert());

      // ── Keep the measurements honest ──────────────────────────────────
      // Everything below exists to call refresh() when a width really moved,
      // rather than at some moment we hoped would be late enough.

      let raf2 = 0;
      // One deferred pass after the first paint, for anything that settles
      // within the frame we cannot observe.
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      teardown.push(() => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      });

      // The real culprit: text reflows when the display/body/mono faces swap in.
      document.fonts?.ready.then(() => {
        if (!disposed) ScrollTrigger.refresh();
      });

      // The catch-all — images decoding, a container query, anything we did
      // not predict. Debounced because a resize drag fires this continuously.
      let debounce: ReturnType<typeof setTimeout>;
      const ro = new ResizeObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (!disposed) ScrollTrigger.refresh();
        }, 120);
      });
      ro.observe(track);
      teardown.push(() => {
        clearTimeout(debounce);
        ro.disconnect();
      });
    })();

    return () => {
      disposed = true;
      // Reverse order: the GSAP context must outlive the observers feeding it.
      for (const fn of teardown.reverse()) fn();
    };
  }, []);

  return (
    <div ref={rootRef} className="overflow-hidden">
      {header}
      <div
        ref={trackRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [scrollbar-width:thin] md:snap-none"
      >
        {children}
      </div>
    </div>
  );
}
