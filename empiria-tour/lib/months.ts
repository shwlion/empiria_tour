/**
 * Months, for the "When can you go?" strip and the month filter.
 *
 * Pure and UTC-only, like the date helpers in `lib/money.ts`: a month is a
 * span of calendar days, and the viewer's timezone must never bend which days
 * those are.
 */

export type MonthOption = {
  /** "2027-07" — the value the URL carries. */
  value: string;
  /** "July 2027" — for labels and screen readers. */
  label: string;
  /** "Jul", or "Jan ’28" outside the current year — for a chip. */
  short: string;
  /** How many trips depart that month. Absent when the list is calendar-derived. */
  count?: number;
};

/** "2027-07" → the inclusive date range that covers it. Anything else → nothing. */
export function monthToRange(month?: string | null): { departingFrom?: string; departingTo?: string } {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return {};
  const [y, m] = month.split('-').map(Number);
  if (m < 1 || m > 12) return {};
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    departingFrom: `${month}-01`,
    departingTo: `${month}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * One "YYYY-MM" as a chip.
 *
 * The year is dropped only when the month falls in the *current* calendar
 * year. The older rule dropped it whenever the month matched the first entry
 * in the list, which was harmless while the list always began today — but the
 * strip is now built from real departures, and a list starting in May 2027
 * would have rendered a bare "May" for a date eighteen months out.
 */
export function monthOption(value: string, now: Date = new Date(), locale = 'en-CA'): MonthOption {
  const [y, m] = value.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const label = d.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const mon = d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' });
  const short = y === now.getUTCFullYear() ? mon : `${mon} ’${String(y).slice(2)}`;
  return { value, label, short };
}

/** The next `count` months starting with the one `from` is in. */
export function upcomingMonths(
  from: Date,
  count = 12,
  locale = 'en-CA',
  now: Date = from
): MonthOption[] {
  const out: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push(monthOption(value, now, locale));
  }
  return out;
}
