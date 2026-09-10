'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export type CurrencyChoice = { code: string; symbol: string; name: string };

/**
 * Currency selector.
 *
 * Empiria charges in the currency being browsed, so this is not a display
 * convenience — it changes which set of prices the server reads. That makes the
 * URL the right home for it: shareable, server-rendered, and impossible to
 * disagree with what was actually charged.
 *
 * The previous version kept the choice in localStorage and read it back in an
 * effect, which meant the first paint showed one currency and the second showed
 * another. Prices that flicker are worse than prices that reload.
 *
 * The existing query string is read from `window.location` inside the click
 * handler rather than with `useSearchParams()`. Nothing here *renders* from the
 * query — it is only needed at the moment of navigation — and this component
 * sits in the navbar, so a render-time dependency on search params would opt
 * every page on the site out of static prerendering (or demand a Suspense
 * boundary around the whole navbar to compensate).
 */
export default function CurrencySelector({
    currencies,
    current,
    tone = 'dark',
}: {
    currencies: CurrencyChoice[];
    current: string;
    /** Matches the navbar it sits in: ink plate or white bar. */
    tone?: 'light' | 'dark';
}) {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();

    if (currencies.length < 2) return null;
    const active = currencies.find((c) => c.code === current) ?? currencies[0];

    // Each tone is a complete set so the dark plate stays exactly as it was.
    const t =
        tone === 'light'
            ? {
                  trigger: 'min-h-[44px] rounded-full text-[13px] font-medium text-ink/70 hover:bg-ink/5 hover:text-ink',
                  symbol: 'font-semibold text-ink/80',
                  panel: 'rounded-xl border border-line bg-white shadow-lift-panel',
                  item: 'text-stone hover:bg-sand/40 hover:text-ink',
                  itemActive: 'text-ember hover:bg-sand/40',
                  itemSymbol: 'text-stone/70',
              }
            : {
                  trigger: 'rounded-lg text-[11px] uppercase tracking-label text-bone/60 hover:bg-white/10 hover:text-bone',
                  symbol: 'font-bold text-bone/80',
                  panel: 'rounded-lg bg-ink shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10',
                  item: 'text-bone/70 hover:bg-white/5 hover:text-bone',
                  itemActive: 'text-flame hover:bg-white/5',
                  itemSymbol: 'text-bone/50',
              };

    function choose(code: string) {
        setOpen(false);
        const next = new URLSearchParams(window.location.search);
        next.set('currency', code);
        router.push(`${pathname}?${next}`);
        router.refresh();
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={`Currency: ${active.name}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 font-mono transition-colors ${t.trigger}`}
            >
                <span className={t.symbol}>{active.symbol}</span>
                <span>{active.code}</span>
                <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
                    <ul
                        role="listbox"
                        className={`absolute right-0 top-full z-50 mt-2 min-w-[168px] py-1 ${t.panel}`}
                    >
                        {currencies.map((c) => (
                            <li key={c.code} role="option" aria-selected={c.code === active.code}>
                                <button
                                    type="button"
                                    onClick={() => choose(c.code)}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-label transition-colors ${
                                        c.code === active.code ? t.itemActive : t.item
                                    }`}
                                >
                                    <span className={`w-7 ${t.itemSymbol}`}>{c.symbol}</span>
                                    <span>{c.code}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
