'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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
 */
export default function CurrencySelector({
    currencies,
    current,
}: {
    currencies: CurrencyChoice[];
    current: string;
}) {
    const [open, setOpen] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();

    if (currencies.length < 2) return null;
    const active = currencies.find((c) => c.code === current) ?? currencies[0];

    function choose(code: string) {
        setOpen(false);
        const next = new URLSearchParams(params.toString());
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
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-label text-bone/60 transition-colors hover:bg-white/10 hover:text-bone"
            >
                <span className="font-bold text-bone/80">{active.symbol}</span>
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
                        className="absolute right-0 top-full z-50 mt-2 min-w-[168px] rounded-lg bg-ink py-1 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10"
                    >
                        {currencies.map((c) => (
                            <li key={c.code} role="option" aria-selected={c.code === active.code}>
                                <button
                                    type="button"
                                    onClick={() => choose(c.code)}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-label transition-colors hover:bg-white/5 ${
                                        c.code === active.code ? 'text-flame' : 'text-bone/70 hover:text-bone'
                                    }`}
                                >
                                    <span className="w-7 text-bone/50">{c.symbol}</span>
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
