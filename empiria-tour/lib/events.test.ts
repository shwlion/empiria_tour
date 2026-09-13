import { normaliseEvents, formatEventDate, citiesOf, cityUrl } from './events';
import { SHOP_URL } from './urls';

/**
 * The Events API's rows → cards for the home page.
 *
 *   bun run lib/events.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const NOW = new Date('2026-09-13T12:00:00Z');
const cover = 'https://ccotwfkcqghuykpzshjn.supabase.co/storage/v1/object/public/Covers/x.jpg';

// ── the shape the live API returns ──────────────────────────────────────────
const payload = {
  events: [
    { id: 'a', slug: 'greek-night', title: 'Greek Night', city: 'scarborough', venue_name: 'The Hall', timezone: 'America/Toronto',
      cover_image_url: cover, event_occurrences: [{ starts_at: '2026-10-17T23:30:00+00:00' }] },
    { id: 'b', slug: 'kabarnos', title: 'Kabarnos in Toronto', city: 'Toronto', venue_name: null, timezone: 'America/Toronto',
      cover_image_url: 'https://evil.example/x.jpg', event_occurrences: [{ starts_at: '2026-11-29T00:00:00+00:00' }] },
    { id: 'c', slug: 'undated', title: 'Someday', city: 'Vaughan', venue_name: null, timezone: null, cover_image_url: null, event_occurrences: [] },
    { id: 'd', slug: 'past', title: 'Already happened', city: 'Toronto', venue_name: null, timezone: null, cover_image_url: null,
      event_occurrences: [{ starts_at: '2026-01-01T00:00:00+00:00' }] },
    { id: 'e', title: 'No slug', city: 'Toronto', event_occurrences: [] },
    { slug: 'no-id', title: 'No id' },
  ],
};
const cards = normaliseEvents(payload, NOW);

eq('rows without an id or a slug are dropped', cards.map((c) => c.id), ['a', 'b', 'c', 'd']);
eq('dated first, soonest first, undated after', cards.map((c) => c.title), ['Greek Night', 'Kabarnos in Toronto', 'Someday', 'Already happened']);
eq('a past occurrence does not count as upcoming', cards[3].startsAt, null);
eq('the city is title-cased', cards[0].city, 'Scarborough');
eq('the url is the shop event page', cards[0].url, `${SHOP_URL}/events/greek-night`);
eq('a cover on the trusted storage host is kept', cards[0].coverImage, cover);
eq('a cover anywhere else is dropped', cards[1].coverImage, null);
eq('venue comes through', [cards[0].venue, cards[1].venue], ['The Hall', null]);

// ── garbage in ──────────────────────────────────────────────────────────────
eq('not an object → nothing', normaliseEvents(null, NOW), []);
eq('no events key → nothing', normaliseEvents({ error: 'x' }, NOW), []);
eq('events not an array → nothing', normaliseEvents({ events: 'x' }, NOW), []);

// ── dates in the event\'s own zone ───────────────────────────────────────────
eq('a Toronto evening reads as a Toronto evening', formatEventDate('2026-10-17T23:30:00+00:00', 'America/Toronto'), 'Sat, Oct 17 · 7:30 p.m.');
eq('an unknown zone falls back to UTC rather than throwing', formatEventDate('2026-10-17T23:30:00+00:00', 'Mars/Olympus'), 'Sat, Oct 17 · 11:30 p.m.');
eq('no date, no string', formatEventDate(null, 'America/Toronto'), null);
eq('a garbled date, no string', formatEventDate('yesterday', 'America/Toronto'), null);

// ── cities ──────────────────────────────────────────────────────────────────
eq('distinct cities in first-seen order', citiesOf(cards), ['Scarborough', 'Toronto', 'Vaughan']);
eq('a city chip searches the shop', cityUrl('Scarborough'), `${SHOP_URL}?search=Scarborough`);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
