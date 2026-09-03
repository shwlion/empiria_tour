import { buildIcs, googleCalendarUrl, icsFilename, type CalendarEvent } from './calendar';

/**
 * The calendar entry a traveller puts in their own diary.
 *
 *   bun run lib/calendar.test.ts
 *
 * Pure, for the same reason `lib/pricing.ts` and `lib/pdf/receipt.ts` are: no
 * database, no network, no clock. A departure is a day and not an instant —
 * the rule `lib/money.ts` already follows — so every entry here is all-day,
 * and the one genuinely sharp edge is that iCalendar's DTEND for an all-day
 * event is EXCLUSIVE. Get it wrong and every traveller's calendar shows the
 * trip ending a day early, which nobody reports because it looks like their
 * calendar misbehaving rather than us.
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};
const ok = (name: string, cond: boolean, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `\n        ${detail}`}`);
};

const fixture: CalendarEvent = {
  uid: 'ABC123',
  stamp: '2026-09-03T10:20:30.000Z',
  title: 'Highlands & Islands',
  description: 'Reference ABC123.',
  location: 'Waverley Station, Edinburgh',
  startsOn: '2026-11-14',
  endsOn: '2026-11-22',
  url: 'https://tour.empiria.events/tours/highlands-and-islands',
};

/** Undo RFC 5545 line folding so a property reads as one string. */
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, '');
const linesOf = (s: string) => unfold(s).split('\r\n');
const prop = (s: string, name: string) =>
  linesOf(s).find((l) => l.startsWith(name + ':') || l.startsWith(name + ';')) ?? '';

// ── Structure ───────────────────────────────────────────────────────────────
{
  const ics = buildIcs(fixture);
  eq('opens BEGIN:VCALENDAR', linesOf(ics)[0], 'BEGIN:VCALENDAR');
  ok('closes END:VCALENDAR', ics.trimEnd().endsWith('END:VCALENDAR'));
  ok('carries VERSION:2.0', linesOf(ics).includes('VERSION:2.0'));
  eq('wraps exactly one VEVENT', linesOf(ics).filter((l) => l === 'BEGIN:VEVENT').length, 1);
  ok('every line ends CRLF', /\r\n$/.test(ics) && !/[^\r]\n/.test(ics), 'a bare LF is present');
}

// ── DTEND is exclusive. The whole reason this file exists. ──────────────────
{
  const ics = buildIcs(fixture);
  eq('DTSTART is the first day', prop(ics, 'DTSTART'), 'DTSTART;VALUE=DATE:20261114');
  eq('DTEND is the day AFTER the last day', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20261123');
}
{
  const ics = buildIcs({ ...fixture, endsOn: null });
  eq('open-ended departure spans one day', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20261115');
}
{
  const ics = buildIcs({ ...fixture, endsOn: '2026-11-14' });
  eq('same-day departure spans one day', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20261115');
}
{
  // An ends_on before starts_on is bad data, not a negative-length trip.
  const ics = buildIcs({ ...fixture, endsOn: '2026-11-01' });
  eq('an end before the start falls back to one day', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20261115');
}
{
  const ics = buildIcs({ ...fixture, startsOn: '2026-12-28', endsOn: '2026-12-31' });
  eq('rolls over the year', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20270101');
}
{
  const ics = buildIcs({ ...fixture, startsOn: '2028-02-20', endsOn: '2028-02-28' });
  eq('leap year keeps 29 Feb', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20280229');
}
{
  const ics = buildIcs({ ...fixture, startsOn: '2027-02-20', endsOn: '2027-02-28' });
  eq('non-leap year rolls to 1 Mar', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20270301');
}
{
  // starts_on arrives as a date, but a timestamptz would not be a crash.
  const ics = buildIcs({ ...fixture, startsOn: '2026-11-14T00:00:00+00:00', endsOn: '2026-11-22T00:00:00+00:00' });
  eq('tolerates a full timestamp', prop(ics, 'DTEND'), 'DTEND;VALUE=DATE:20261123');
}

// ── Escaping. Supplied content is not trusted to be well-behaved. ───────────
{
  const ics = buildIcs({
    ...fixture,
    title: 'Wine, cheese; and a \\ backslash',
    description: 'Line one\nLine two',
    location: 'Nowhere, Somewhere; Anywhere',
  });
  const summary = prop(ics, 'SUMMARY');
  ok('escapes the comma', summary.includes('Wine\\,'), summary);
  ok('escapes the semicolon', summary.includes('cheese\\;'), summary);
  ok('escapes the backslash', summary.includes('a \\\\ backslash'), summary);
  ok('turns a newline into an escaped n', prop(ics, 'DESCRIPTION').includes('Line one\\nLine two'));
  ok('escapes in LOCATION too', prop(ics, 'LOCATION').includes('Nowhere\\, Somewhere\\; Anywhere'), prop(ics, 'LOCATION'));
  ok('leaves no unescaped comma in SUMMARY', !/[^\\],/.test(summary), summary);
  ok('leaves no unescaped semicolon in the SUMMARY value', !/[^\\];/.test(summary.slice('SUMMARY:'.length)), summary);
}
{
  // A CRLF in supplied text must not become a real line break.
  const ics = buildIcs({ ...fixture, description: 'One\r\nTwo\rThree' });
  ok('collapses CRLF and CR alike', prop(ics, 'DESCRIPTION').includes('One\\nTwo\\nThree'), prop(ics, 'DESCRIPTION'));
  eq('injected text cannot forge a property', linesOf(ics).filter((l) => l.startsWith('SUMMARY:')).length, 1);
}

// ── Folding. A long title silently truncates in Outlook otherwise. ──────────
{
  const long =
    'A very long tour title that runs well past the seventy-five octet limit the specification imposes on any single content line';
  const ics = buildIcs({ ...fixture, title: long });
  const raw = ics.split('\r\n').filter(Boolean);
  eq('no line exceeds 75 octets', raw.filter((l) => Buffer.byteLength(l, 'utf8') > 75), []);
  ok('continuation lines begin with a space', raw.some((l) => l.startsWith(' ')));
  ok('unfolds back to the original title', unfold(ics).includes(long));
}
{
  // Folding counts octets, not characters — a split mid-sequence corrupts it.
  const wide = '日本語'.repeat(40);
  const ics = buildIcs({ ...fixture, title: wide });
  eq('multi-byte text folds to 75 octets', ics.split('\r\n').filter((l) => Buffer.byteLength(l, 'utf8') > 75), []);
  ok('multi-byte text survives unfolding', unfold(ics).includes(wide));
  ok('no replacement character', !ics.includes('�'));
}

// ── Determinism. The argument that lets receipts be rendered, not stored. ───
{
  ok('same booking renders byte-identically', buildIcs(fixture) === buildIcs(fixture));
  ok('UID is carried, not invented', prop(buildIcs(fixture), 'UID').includes('ABC123'));
  eq('DTSTAMP comes from the booking, not the clock', prop(buildIcs(fixture), 'DTSTAMP'), 'DTSTAMP:20260903T102030Z');
}

// ── Google's template URL. Same exclusive-end rule. ─────────────────────────
{
  const u = new URL(googleCalendarUrl(fixture));
  eq('points at Google', u.host + u.pathname, 'calendar.google.com/calendar/render');
  eq('is a TEMPLATE action', u.searchParams.get('action'), 'TEMPLATE');
  eq('dates use the exclusive end', u.searchParams.get('dates'), '20261114/20261123');
  eq('carries the title unescaped', u.searchParams.get('text'), 'Highlands & Islands');
  eq('carries the location', u.searchParams.get('location'), 'Waverley Station, Edinburgh');
  ok('mentions the reference in details', (u.searchParams.get('details') ?? '').includes('ABC123'));
}
{
  const u = new URL(googleCalendarUrl({ ...fixture, endsOn: null }));
  eq('open-ended spans one day for Google too', u.searchParams.get('dates'), '20261114/20261115');
}
{
  const u = new URL(googleCalendarUrl({ ...fixture, location: null, description: undefined }));
  eq('omits an absent location', u.searchParams.get('location'), null);
}

// ── Filename, mirroring receiptFilename. ────────────────────────────────────
eq('filename is filesystem-safe', icsFilename('A1B2-C3'), 'empiria-tour-a1b2c3.ics');
eq('filename lowercases', icsFilename('XYZ789'), 'empiria-tour-xyz789.ics');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
