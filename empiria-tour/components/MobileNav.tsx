'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import type { DestinationOption } from '@/components/tours/SearchBar';

/**
 * Mobile-only nav dropdown (hamburger) for the floating navbar.
 * Rendered below the `sm` breakpoint; desktop keeps the inline links plus the
 * destination menu.
 *
 * Destinations appear here too — A1 wants the menu available, and hiding it on
 * the breakpoint where browsing actually happens would be an odd reading of it.
 */
export default function MobileNav({
  destinations = [],
  tone = 'dark',
}: {
  destinations?: DestinationOption[];
  /** Matches the navbar it sits in: ink plate or white bar. */
  tone?: 'light' | 'dark';
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close when tapping/clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Each tone is a complete set so the dark plate stays exactly as it was.
  const t =
    tone === 'light'
      ? {
          trigger: 'text-ink/70 hover:bg-ink/5 hover:text-ink',
          panel: 'rounded-xl border border-line bg-white shadow-lift-panel',
          item: 'text-stone hover:bg-sand/40 hover:text-ink',
          head: 'text-ember',
          divider: 'border-sand',
        }
      : {
          trigger: 'text-bone/80 hover:bg-white/10',
          panel: 'rounded-xl bg-ink/95 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-md',
          item: 'text-bone/70 hover:bg-white/5 hover:text-bone',
          head: 'text-flame',
          divider: 'border-white/10',
        };

  const itemClass = `px-5 py-3 font-mono text-[11px] uppercase tracking-label transition-colors ${t.item}`;

  return (
    <div ref={wrapperRef} className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${t.trigger}`}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className={`absolute left-0 right-0 top-full mt-3 max-h-[70vh] overflow-y-auto ${t.panel}`}>
          <div className="flex flex-col py-2">
            <Link href="/tours" onClick={() => setOpen(false)} className={itemClass}>
              All tours
            </Link>

            <Link href="/blog" onClick={() => setOpen(false)} className={itemClass}>
              Journal
            </Link>

            {destinations.length > 0 && (
              <>
                <span className={`mt-2 px-5 py-2 font-mono text-[10px] uppercase tracking-label ${t.head}`}>
                  Destinations
                </span>
                {destinations.map((d) => (
                  <Link
                    key={d.path}
                    href={`/tours?destination=${encodeURIComponent(d.path)}`}
                    onClick={() => setOpen(false)}
                    className={`py-2.5 text-[14px] transition-colors ${t.item}`}
                    style={{ paddingLeft: `${20 + d.depth * 14}px`, paddingRight: '20px' }}
                  >
                    {d.name}
                  </Link>
                ))}
              </>
            )}

            <div className={`my-2 border-t ${t.divider}`} />
            {/* A7. This pointed at /bookings, which never existed — the one
                place the "no link that 404s" rule had already been broken.
                Anonymous visitors are sent to sign in and land back here. */}
            <Link href="/account/bookings" onClick={() => setOpen(false)} className={itemClass}>
              My bookings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
