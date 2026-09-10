'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { DestinationOption } from '@/components/tours/SearchBar';

/**
 * A1: "destination menu is driven by published destinations".
 *
 * A flat, indented list rather than nested fly-outs. The tree is only two or
 * three levels deep and cascading submenus are a well-known accessibility and
 * touch problem for the sake of looking clever. Indentation carries the same
 * information and every row is one click.
 */
export default function DestinationMenu({
  destinations,
  tone = 'dark',
}: {
  destinations: DestinationOption[];
  /** Matches the navbar it sits in: ink plate or white bar. */
  tone?: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (destinations.length === 0) return null;

  // Each tone is a complete set so the dark plate stays exactly as it was.
  const t =
    tone === 'light'
      ? {
          trigger: 'min-h-[44px] rounded-full px-2 text-[13px] font-medium text-ink/70 hover:bg-ink/5 hover:text-ink',
          panel: 'border-line bg-white shadow-lift-panel',
          item: 'text-stone hover:bg-sand/40 hover:text-ink',
          dot: 'text-ember/60',
          divider: 'border-sand',
          all: 'text-ember hover:bg-sand/40',
        }
      : {
          trigger: 'text-[11px] uppercase tracking-label text-bone/60 hover:text-bone',
          panel: 'border-white/10 bg-ink shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]',
          item: 'text-bone/70 hover:bg-white/5 hover:text-bone',
          dot: 'text-flame/60',
          divider: 'border-white/10',
          all: 'text-flame hover:bg-white/5',
        };

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 font-mono transition-colors ${t.trigger}`}
      >
        Destinations
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute left-0 top-full z-50 mt-3 max-h-[70vh] min-w-[240px] overflow-y-auto rounded-xl border py-2 ${t.panel}`}
        >
          {destinations.map((d) => (
            <Link
              key={d.path}
              role="menuitem"
              href={`/tours?destination=${encodeURIComponent(d.path)}`}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-[14px] transition-colors ${t.item}`}
              style={{ paddingLeft: `${16 + d.depth * 16}px` }}
            >
              {d.depth > 0 && (
                <span className={`mr-2 ${t.dot}`} aria-hidden="true">
                  ·
                </span>
              )}
              {d.name}
            </Link>
          ))}
          <div className={`my-2 border-t ${t.divider}`} />
          <Link
            href="/tours"
            onClick={() => setOpen(false)}
            className={`block px-4 py-2 font-mono text-[10px] uppercase tracking-label transition-colors ${t.all}`}
          >
            Everywhere
          </Link>
        </div>
      )}
    </div>
  );
}
