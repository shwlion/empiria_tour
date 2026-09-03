/**
 * The trip, as a calendar entry.
 *
 * Pure and dependency-free, like `lib/pdf/` and the mailer. That is not a style
 * preference: §5.7 forbids a GPL/AGPL/LGPL dependency without written consent,
 * and every ics library worth adding would be one more licence to clear for a
 * file format that is thirty lines of string building.
 *
 * Two decisions worth not re-deriving:
 *
 * **Entries are all-day.** `departures` carries `starts_on` and `ends_on` as
 * dates and `start_time` as a bare time, and there is no timezone column
 * anywhere in the Tours schema. Turning that into an instant means guessing a
 * zone, and a guess is wrong for every tour that does not leave from the zone
 * guessed. An all-day entry is right in every calendar on earth, which a timed
 * one would not be. `start_time` goes in the description as text instead.
 *
 * **DTEND is exclusive.** RFC 5545 §3.6.1: for a DATE-valued DTEND the value is
 * the first day *not* in the event. A trip ending 22 Nov emits 23 Nov. Getting
 * this wrong shows every traveller their trip ending a day early, and nobody
 * reports it, because it reads as their calendar misbehaving rather than us.
 *
 * Output is deterministic for a given booking — UID and DTSTAMP are carried in,
 * never generated — which is the same property that lets `renderReceipt` be
 * rendered on demand rather than stored.
 */

const CRLF = '\r\n';

/** RFC 5545 §3.1: a content line is at most 75 octets, excluding the CRLF. */
const OCTET_LIMIT = 75;

const PRODID = '-//Empiria World Inc.//Empiria Tours//EN';

export type CalendarEvent = {
  /** Stable identity for the entry. The booking reference. */
  uid: string;
  /** ISO instant used for DTSTAMP. Pass the booking's `createdAt`, not `now`. */
  stamp: string;
  title: string;
  description?: string | null;
  location?: string | null;
  /** Inclusive first day, `YYYY-MM-DD`. */
  startsOn: string;
  /** Inclusive last day, `YYYY-MM-DD`. Null or absent means a single day. */
  endsOn?: string | null;
  /** Canonical public URL for the trip. */
  url?: string | null;
};

const encoder = new TextEncoder();
const octets = (s: string): number => encoder.encode(s).length;

/** `YYYY-MM-DD` (or a longer timestamp) to the `YYYYMMDD` iCalendar DATE form. */
function basicDate(day: string): string {
  return day.slice(0, 10).replace(/-/g, '');
}

/**
 * Shift a calendar day by whole days. Built on `Date.UTC` rather than the local
 * constructor for the reason `lib/money.ts:56` gives: a departure is a day, and
 * parsing it as an instant shifts it by the reader's offset.
 */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The exclusive DTEND: the day after the last day of the trip.
 *
 * An `ends_on` that is absent, or that precedes `starts_on`, is treated as a
 * single-day trip. The latter is bad data rather than a negative-length trip,
 * and a calendar entry that ends before it begins is rejected outright by some
 * clients and drawn as a blank by others.
 */
export function exclusiveEnd(startsOn: string, endsOn?: string | null): string {
  const start = startsOn.slice(0, 10);
  const end = endsOn?.slice(0, 10);
  const last = end && end >= start ? end : start;
  return basicDate(addDays(last, 1));
}

/**
 * RFC 5545 §3.3.11 text escaping.
 *
 * Backslash first, or the escapes introduced below would be escaped in turn.
 * Every newline form collapses to the literal two characters `\n`, which also
 * means supplied text cannot forge a property line of its own.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line to 75 octets, continuation lines prefixed with a space.
 *
 * Iterating the string yields whole code points, so a multi-byte character is
 * never split across the boundary — a byte-wise fold produces mojibake in
 * exactly the calendars least likely to be tested against. The leading space on
 * a continuation counts toward its own 75.
 */
function fold(line: string): string {
  if (octets(line) <= OCTET_LIMIT) return line;

  const out: string[] = [];
  let current = '';
  let width = 0;

  for (const char of line) {
    const size = octets(char);
    if (width + size > OCTET_LIMIT) {
      out.push(current);
      current = ' ';
      width = 1;
    }
    current += char;
    width += size;
  }
  out.push(current);

  return out.join(CRLF);
}

/** An ISO instant as the iCalendar UTC form, `YYYYMMDDTHHMMSSZ`. */
function timestamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '19700101T000000Z';
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * A complete VCALENDAR holding one all-day VEVENT.
 *
 * `TRANSP:TRANSPARENT` because an all-day entry that marks the traveller busy
 * blanks out a week or more of their availability to everyone who can see their
 * calendar — which is not what adding a trip to a diary is asking for.
 */
export function buildIcs(event: CalendarEvent): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}@empiria.events`,
    `DTSTAMP:${timestamp(event.stamp)}`,
    `DTSTART;VALUE=DATE:${basicDate(event.startsOn)}`,
    `DTEND;VALUE=DATE:${exclusiveEnd(event.startsOn, event.endsOn)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.url) lines.push(`URL:${escapeText(event.url)}`);

  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join(CRLF) + CRLF;
}

/**
 * Google Calendar's prefilled-event URL.
 *
 * Google takes the same exclusive end as the ics, so the two agree by
 * construction rather than by a second implementation of the rule.
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${basicDate(event.startsOn)}/${exclusiveEnd(event.startsOn, event.endsOn)}`,
  });

  const details = [event.description, event.url].filter(Boolean).join('\n\n');
  if (details) params.set('details', details);
  if (event.location) params.set('location', event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** `empiria-tour-abc123.ics`. Mirrors `receiptFilename`. */
export function icsFilename(reference: string): string {
  return `empiria-tour-${reference.toLowerCase().replace(/[^a-z0-9]/g, '')}.ics`;
}
