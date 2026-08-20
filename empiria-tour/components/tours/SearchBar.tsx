'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export type DestinationOption = { path: string; name: string; depth: number };

/**
 * The segmented search control — Where / When / Who in one frame.
 *
 * Airbnb's division of labour, drawn as a squared plate with hairline dividers
 * rather than a pill: three separate hit targets, one border that lights to
 * flame when anything inside has focus.
 *
 * Three decisions that differ from Airbnb:
 *  - "When" is a MONTH, not a date range. People shop for tours by "sometime in
 *    September", and fixed departures mean an exact-date picker mostly returns
 *    nothing. The results page widens a month into a range.
 *  - Destination is a select rather than a typeahead. The catalogue is a curated
 *    tree of tens of places, not millions of listings; a list is faster than
 *    guessing what someone meant by "greece".
 *  - No infant field. Infants do not change what a search returns, only what a
 *    booking costs, so that belongs on the package page.
 */
export default function SearchBar({
  destinations,
  initial,
  compact = false,
  tone = 'light',
}: {
  destinations: DestinationOption[];
  initial?: { destination?: string; month?: string; travellers?: number };
  compact?: boolean;
  /** 'dark' sits the control on an ink plate — used by the hero. */
  tone?: 'light' | 'dark';
}) {
  const router = useRouter();
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [month, setMonth] = useState(initial?.month ?? '');
  const [travellers, setTravellers] = useState(initial?.travellers ?? 2);

  // Eighteen months forward is the horizon a tour operator realistically sells.
  const months = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      out.push({
        value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      });
    }
    return out;
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (destination) params.set('destination', destination);
    if (month) params.set('month', month);
    if (travellers && travellers !== 2) params.set('travellers', String(travellers));
    router.push(`/tours${params.toString() ? `?${params}` : ''}`);
  }

  const segLabel = 'block font-mono text-[10px] uppercase tracking-label text-stone';
  const segInput =
    'w-full cursor-pointer bg-transparent text-[15px] text-ink outline-none';

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Find a tour"
      className={`search-bar flex w-full flex-col md:flex-row md:items-stretch ${
        compact ? 'p-1.5' : 'p-2'
      } ${tone === 'dark' ? 'shadow-lift-panel' : ''}`}
    >
      <div className="search-seg flex-1 px-4 py-3 md:px-5">
        <label className={segLabel} htmlFor="search-where">Where</label>
        <select
          id="search-where"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className={segInput}
        >
          <option value="">Anywhere</option>
          {destinations.map((d) => (
            <option key={d.path} value={d.path}>
              {'  '.repeat(d.depth)}
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="search-seg flex-1 px-4 py-3 md:px-5">
        <label className={segLabel} htmlFor="search-when">When</label>
        <select
          id="search-when"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={segInput}
        >
          <option value="">Any month</option>
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="search-seg px-4 py-3 md:w-44 md:px-5">
        <label className={segLabel} htmlFor="search-who">Who</label>
        <select
          id="search-who"
          value={travellers}
          onChange={(e) => setTravellers(Number(e.target.value))}
          className={segInput}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? 'traveller' : 'travellers'}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end p-2 md:p-1.5">
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-field bg-flame px-6 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember md:w-auto"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="md:sr-only lg:not-sr-only">Search</span>
        </button>
      </div>
    </form>
  );
}
