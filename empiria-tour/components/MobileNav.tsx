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
}: {
  destinations?: DestinationOption[];
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

  const itemClass =
    'px-5 py-3 font-mono text-[11px] uppercase tracking-label text-bone/70 transition-colors hover:bg-white/5 hover:text-bone';

  return (
    <div ref={wrapperRef} className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-bone/80 transition-colors hover:bg-white/10"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-3 max-h-[70vh] overflow-y-auto rounded-xl bg-ink/95 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 backdrop-blur-md">
          <div className="flex flex-col py-2">
            <Link href="/tours" onClick={() => setOpen(false)} className={itemClass}>
              All tours
            </Link>

            {destinations.length > 0 && (
              <>
                <span className="mt-2 px-5 py-2 font-mono text-[10px] uppercase tracking-label text-flame">
                  Destinations
                </span>
                {destinations.map((d) => (
                  <Link
                    key={d.path}
                    href={`/tours?destination=${encodeURIComponent(d.path)}`}
                    onClick={() => setOpen(false)}
                    className="py-2.5 text-[14px] text-bone/70 transition-colors hover:bg-white/5 hover:text-bone"
                    style={{ paddingLeft: `${20 + d.depth * 14}px`, paddingRight: '20px' }}
                  >
                    {d.name}
                  </Link>
                ))}
              </>
            )}

            <div className="my-2 border-t border-white/10" />
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
