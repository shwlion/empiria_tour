'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { APEX_URL } from '@/lib/urls';

const LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: '/', label: 'Tours' },
  { href: `${APEX_URL}/about`, label: 'About', external: true },
];

/**
 * Mobile-only nav dropdown (hamburger) for the floating pill navbar.
 * Rendered below the `sm` breakpoint; desktop keeps the inline links.
 */
export default function MobileNav() {
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
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [open]);

  const itemClass =
    'px-5 py-3 font-mono text-[11px] uppercase tracking-label text-bone/70 hover:bg-white/5 hover:text-bone transition-colors';

  return (
    <div ref={wrapperRef} className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-bone/80 hover:bg-white/10 transition-colors"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-3 rounded-xl bg-ink/95 backdrop-blur-md shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 overflow-hidden">
          <div className="flex flex-col py-2">
            {LINKS.map((link) =>
              link.external ? (
                <a key={link.href} href={link.href} onClick={() => setOpen(false)} className={itemClass}>
                  {link.label}
                </a>
              ) : (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={itemClass}>
                  {link.label}
                </Link>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
