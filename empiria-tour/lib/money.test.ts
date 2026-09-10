import { formatDateRange, formatDepartureDate, formatPrice, seatsLabel } from './money';

/**
 * Money and date formatting.
 *
 *   bun run lib/money.test.ts
 *
 * The date range matters more than it looks: it is rendered on the server and
 * again in the browser, and the two ICU builds disagreed about spacing around
 * the dash, so every tour page hydrated with a text mismatch. The strings
 * pinned here are the ones both sides must now produce.
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};

eq('same month collapses to one month and year', formatDateRange('2027-05-01', '2027-05-08'), 'May 1–8, 2027');
eq('different months share the year', formatDateRange('2027-05-28', '2027-06-04'), 'May 28 – Jun 4, 2027');
eq('different years spell both out', formatDateRange('2027-12-28', '2028-01-04'), 'Dec 28, 2027 – Jan 4, 2028');
eq('no end date is just the start', formatDateRange('2027-05-01', null), 'May 1, 2027');
eq('no start date is nothing', formatDateRange(null, '2027-05-08'), '');
eq('a timestamp is treated as its calendar day', formatDateRange('2027-05-01T23:30:00Z', '2027-05-08'), 'May 1–8, 2027');
eq('no thin spaces or odd dashes sneak in', /[  —]/.test(formatDateRange('2027-05-01', '2027-05-08')), false);

eq('a departure date', formatDepartureDate('2027-05-04'), 'May 4, 2027');
eq('a round price drops the cents', formatPrice(215000, 'CAD'), '$2,150');
eq('an uneven price keeps them', formatPrice(215050, 'CAD'), '$2,150.50');
eq('no price is a dash', formatPrice(null, 'CAD'), '—');
eq('euros', formatPrice(145000, 'EUR'), '€1,450');

eq('sold out at zero', seatsLabel(0), 'Sold out');
eq('scarce below the threshold', seatsLabel(3), '3 left');
eq('quiet when plentiful', seatsLabel(9), null);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
