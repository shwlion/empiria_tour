/**
 * Money formatting, safe on both server and client.
 *
 * Lives apart from `lib/catalogue.ts` deliberately: that module is server-only
 * and throws if it is ever evaluated in a browser, so a client component cannot
 * import anything from it at runtime — including a pure formatter.
 */

/** Cents in, localised currency string out. `null` renders as an em dash. */
export function formatPrice(
  cents: number | null | undefined,
  currency: string,
  locale = 'en-CA'
): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // Travel prices are round numbers far more often than not; showing
    // "$2,150" rather than "$2,150.00" is quieter and just as precise.
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** A departure date as travellers read it: "4 May 2027". */
export function formatDepartureDate(iso: string | null | undefined, locale = 'en-CA'): string {
  if (!iso) return '';
  // Parse as a plain calendar date. A departure is a day, not an instant, and
  // `new Date('2027-05-04')` would otherwise shift by the viewer's timezone.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * A departure's dates, collapsing whatever the two ends share:
 * "May 1 – 8, 2027", "May 28 – Jun 4, 2027", "Dec 28, 2027 – Jan 4, 2028".
 *
 * `Intl.formatRange` does the collapsing, and it has to: which parts may be
 * elided, and in what order, is a property of the locale. This previously
 * hand-assembled the range by taking the day off the start and the full date
 * off the end, which reads correctly only in a day-first locale — in `en-CA`,
 * which is the default here, it produced "1–May 8, 2027".
 */
export function formatDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  locale = 'en-CA'
): string {
  if (!startIso) return '';
  if (!endIso) return formatDepartureDate(startIso, locale);

  // Plain calendar dates, as everywhere else in this file: a departure is a day,
  // not an instant, and parsing it as one would shift it by the viewer's offset.
  const parse = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).formatRange(parse(startIso), parse(endIso));
}

/** "3 left" / "Sold out" / null when there is nothing worth saying. */
export function seatsLabel(seatsAvailable: number, threshold = 4): string | null {
  if (seatsAvailable <= 0) return 'Sold out';
  if (seatsAvailable <= threshold) return `${seatsAvailable} left`;
  return null;
}
