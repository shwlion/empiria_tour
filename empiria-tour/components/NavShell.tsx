'use client';

import { useEffect, useRef } from 'react';

/**
 * The light navbar's sticky white shell.
 *
 * Once the page has scrolled 80px under it, the bar gains a shadow so it reads
 * as a surface over the content rather than part of it. The class is toggled
 * straight on the element from a passive scroll listener — no React state, so
 * scrolling never re-renders the navbar tree.
 */
export default function NavShell({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      el.classList.toggle('is-scrolled', window.scrollY > 80);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header ref={ref} className="nav-shell sticky top-0 z-50 w-full bg-white/85 backdrop-blur">
      {children}
    </header>
  );
}
