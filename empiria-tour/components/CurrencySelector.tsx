"use client"

import { useState, useEffect } from "react"

const CURRENCIES = [
    { code: "cad", label: "CAD", symbol: "CA$" },
    { code: "usd", label: "USD", symbol: "$" },
    { code: "eur", label: "EUR", symbol: "€" },
]

export default function CurrencySelector({ defaultCurrency }: { defaultCurrency?: string }) {
    const [currency, setCurrency] = useState(defaultCurrency || "cad")
    const [open, setOpen] = useState(false)

    useEffect(() => {
        // Read from localStorage on mount
        const stored = localStorage.getItem("preferred_currency")
        if (stored && CURRENCIES.some(c => c.code === stored)) {
            setCurrency(stored)
        } else if (defaultCurrency) {
            setCurrency(defaultCurrency)
        }
    }, [defaultCurrency])

    const handleSelect = (code: string) => {
        setCurrency(code)
        localStorage.setItem("preferred_currency", code)
        setOpen(false)
    }

    const current = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-label text-bone/60 transition-colors hover:bg-white/10 hover:text-bone"
                aria-label="Select currency"
            >
                <span className="font-bold text-bone/80">{current.symbol}</span>
                <span>{current.label}</span>
                <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 min-w-[128px] rounded-lg bg-ink py-1 ring-1 ring-white/10 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)] z-50">
                        {CURRENCIES.map(c => (
                            <button
                                key={c.code}
                                onClick={() => handleSelect(c.code)}
                                className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] uppercase tracking-label transition-colors hover:bg-white/5 ${
                                    c.code === currency ? 'text-flame' : 'text-bone/70 hover:text-bone'
                                }`}
                            >
                                <span className="w-7 text-bone/50">{c.symbol}</span>
                                <span>{c.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
