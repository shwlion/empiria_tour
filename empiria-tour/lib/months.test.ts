import { monthToRange, upcomingMonths, monthOption } from './months';

/**
 * The month strip's arithmetic.
 *
 *   bun run lib/months.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};

eq('a month becomes its first and last day', monthToRange('2027-02'), { departingFrom: '2027-02-01', departingTo: '2027-02-28' });
eq('leap years are counted', monthToRange('2028-02'), { departingFrom: '2028-02-01', departingTo: '2028-02-29' });
eq('a 31-day month', monthToRange('2027-07'), { departingFrom: '2027-07-01', departingTo: '2027-07-31' });
eq('garbage is ignored', monthToRange('next-month'), {});
eq('a thirteenth month is ignored', monthToRange('2027-13'), {});
eq('nothing is ignored', monthToRange(undefined), {});

const months = upcomingMonths(new Date(Date.UTC(2027, 10, 15)), 3);
eq('starts with the month we are in and rolls the year', months.map((m) => m.value), ['2027-11', '2027-12', '2028-01']);
eq('labels are full', months[0].label, 'November 2027');
eq('twelve by default', upcomingMonths(new Date(Date.UTC(2027, 0, 1))).length, 12);

/*
  The year is omitted only for the CURRENT calendar year, not merely for the
  first month in the list.

  The strip is now built from real departures, so the list can start any time
  — with everything selling in 2027 and today in 2026, the old rule dropped the
  year from every chip and left "May" meaning a date eighteen months out.
*/
const now = new Date(Date.UTC(2026, 8, 10));
eq('this year needs no year', monthOption('2026-11', now).short, 'Nov');
eq('next year says so', monthOption('2027-05', now).short, 'May ’27');
eq('a later year says so too', monthOption('2028-01', now).short, 'Jan ’28');
eq('a full label always carries the year', monthOption('2027-05', now).label, 'May 2027');
eq('the value round-trips', monthOption('2027-05', now).value, '2027-05');

// upcomingMonths keeps the same rule, so the two cannot disagree.
eq(
  'a run starting this year',
  upcomingMonths(now, 5).map((m) => m.short),
  ['Sep', 'Oct', 'Nov', 'Dec', 'Jan ’27']
);
eq(
  'a run starting in a later year still shows it',
  upcomingMonths(new Date(Date.UTC(2027, 4, 1)), 2, 'en-CA', now).map((m) => m.short),
  ['May ’27', 'Jun ’27']
);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
