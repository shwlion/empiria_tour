'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import type { DestinationOption } from './SearchBar';

export type FilterOption = { slug: string; name: string };

/**
 * A3 filter rail.
 *
 * Every control writes straight to the URL, because Exhibit A A3 requires filter
 * and sort state to be shareable and bookmarkable. There is no local state to
 * fall out of sync — the URL is the state, and the server re-renders from it.
 */
export default function FilterRail({
  destinations,
  categories,
  collections,
  currencySymbol,
}: {
  destinations: DestinationOption[];
  categories: FilterOption[];
  collections: FilterOption[];
  currencySymbol: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete('page'); // any filter change returns to the first page
      router.push(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
    },
    [params, pathname, router]
  );

  const get = (k: string) => params.get(k) ?? '';

  const months = (() => {
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
  })();

  const field =
    'w-full rounded-field border border-line bg-bone px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-flame';
  const legend = 'mb-2 block font-mono text-[10px] uppercase tracking-label text-stone';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label className={legend} htmlFor="f-destination">Destination</label>
        <select
          id="f-destination" className={field}
          value={get('destination')}
          onChange={(e) => setParam('destination', e.target.value || null)}
        >
          <option value="">Anywhere</option>
          {destinations.map((d) => (
            <option key={d.path} value={d.path}>
              {' '.repeat(d.depth * 2)}{d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={legend} htmlFor="f-month">Departing</label>
        <select
          id="f-month" className={field}
          value={get('month')}
          onChange={(e) => setParam('month', e.target.value || null)}
        >
          <option value="">Any month</option>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div>
        <label className={legend} htmlFor="f-travellers">Travellers</label>
        <select
          id="f-travellers" className={field}
          value={get('travellers')}
          onChange={(e) => setParam('travellers', e.target.value || null)}
        >
          <option value="">Any party size</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n} value={n}>{n} {n === 1 ? 'traveller' : 'travellers'}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={legend} htmlFor="f-duration">Trip length</label>
        <select
          id="f-duration" className={field}
          value={get('duration')}
          onChange={(e) => setParam('duration', e.target.value || null)}
        >
          <option value="">Any length</option>
          <option value="1-4">Up to 4 days</option>
          <option value="5-7">5 to 7 days</option>
          <option value="8-14">8 to 14 days</option>
          <option value="15-99">15 days or more</option>
        </select>
      </div>

      <div>
        <label className={legend} htmlFor="f-maxprice">
          Maximum price per person ({currencySymbol})
        </label>
        <select
          id="f-maxprice" className={field}
          value={get('maxPrice')}
          onChange={(e) => setParam('maxPrice', e.target.value || null)}
        >
          <option value="">No maximum</option>
          {[1000, 1500, 2000, 2500, 3000, 4000, 6000].map((n) => (
            <option key={n} value={n}>Under {currencySymbol}{n.toLocaleString()}</option>
          ))}
        </select>
      </div>

      {categories.length > 0 && (
        <fieldset>
          <legend className={legend}>Category</legend>
          <div className="flex flex-col gap-1.5">
            {categories.map((c) => {
              const on = get('category') === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setParam('category', on ? null : c.slug)}
                  className={`rounded-chip border px-3 py-2 text-left text-[14px] transition-colors ${
                    on ? 'border-ink bg-ink text-bone' : 'border-transparent text-ink hover:border-line hover:bg-bone'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {collections.length > 0 && (
        <fieldset>
          <legend className={legend}>Collection</legend>
          <div className="flex flex-col gap-1.5">
            {collections.map((c) => {
              const on = get('collection') === c.slug;
              return (
                <button
                  key={c.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setParam('collection', on ? null : c.slug)}
                  className={`rounded-chip border px-3 py-2 text-left text-[14px] transition-colors ${
                    on ? 'border-ink bg-ink text-bone' : 'border-transparent text-ink hover:border-line hover:bg-bone'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** Sort control — separate so it can sit above the results rather than in the rail. */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-label text-stone">Sort</span>
      <select
        value={params.get('sort') ?? 'popularity'}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          if (e.target.value === 'popularity') next.delete('sort');
          else next.set('sort', e.target.value);
          next.delete('page');
          router.push(`${pathname}${next.toString() ? `?${next}` : ''}`, { scroll: false });
        }}
        className="rounded-field border border-line bg-bone px-3 py-2 text-[14px] text-ink outline-none focus:border-flame"
      >
        <option value="popularity">Recommended</option>
        <option value="price_asc">Price, low to high</option>
        <option value="price_desc">Price, high to low</option>
        <option value="departure">Departing soonest</option>
        <option value="duration">Shortest first</option>
      </select>
    </label>
  );
}
