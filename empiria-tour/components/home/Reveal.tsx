'use client';

import { useEffect } from 'react';
import { useReducedMotion } from '@/lib/motion';

/**
 * Scroll reveals for the landing page's lower sections.
 *
 * The sections are ordinary server markup carrying `data-reveal` (fade-up on
 * entry), `data-stagger` (children get a `--i` for their delay), `data-draw`
 * (the dashed line between the booking steps draws itself) and `data-count`
 * (a number counts up). This component renders nothing; it is the one
 * IntersectionObserver that turns them on, once each, when they enter.
 *
 * The CSS only hides these elements under `html.js`, and under reduced motion
 * everything is shown outright — so with no JavaScript, or none wanted, the
 * page is simply there.
 */
export default function Reveal() {
  const reduce = useReducedMotion();

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-stagger]').forEach((group) => {
      Array.from(group.children).forEach((child, i) => (child as HTMLElement).style.setProperty('--i', String(i)));
    });

    const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal],[data-draw]'));
    const counters = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[data-count]'));

    const countUp = (el: HTMLElement) => {
      if (el.dataset.done) return;
      el.dataset.done = '1';
      const end = Number(el.dataset.count);
      if (!Number.isFinite(end)) return;
      const t0 = performance.now();
      const duration = 900;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(end * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add('in');
          counters(el).forEach(countUp);
          io.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [reduce]);

  return null;
}
