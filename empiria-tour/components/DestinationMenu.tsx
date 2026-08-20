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
}: {
  destinations: DestinationOption[];
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

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-bone/60 transition-colors hover:text-bone"
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
          className="absolute left-0 top-full z-50 mt-3 max-h-[70vh] min-w-[240px] overflow-y-auto rounded-card border border-white/10 bg-ink py-2 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]"
        >
          {destinations.map((d) => (
            <Link
              key={d.path}
              role="menuitem"
              href={`/tours?destination=${encodeURIComponent(d.path)}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-[14px] text-bone/70 transition-colors hover:bg-white/5 hover:text-bone"
              style={{ paddingLeft: `${16 + d.depth * 16}px` }}
            >
              {d.depth > 0 && (
                <span className="mr-2 text-flame/60" aria-hidden="true">
                  ·
                </span>
              )}
              {d.name}
            </Link>
          ))}
          <div className="my-2 border-t border-white/10" />
          <Link
            href="/tours"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 font-mono text-[10px] uppercase tracking-label text-flame transition-colors hover:bg-white/5"
          >
            Everywhere
          </Link>
        </div>
      )}
    </div>
  );
}
