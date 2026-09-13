import { APEX_URL, SHOP_URL } from '@/lib/urls';

/**
 * What's on at Empiria Events — the sister product — for the home page's
 * promotional section (Exhibit A A2: "promotional placement featuring Empiria
 * live events").
 *
 * Read from the Events platform's own public endpoint,
 * `${APEX_URL}/api/events/by-culture?culture=All`, not from its database.
 * This repository never touches the Empiria-01 project; the API is the
 * boundary the Events platform already publishes for its landing page, it
 * returns only what that page shows to the public, and it needs no
 * credentials. If it is unreachable this returns nothing and the section
 * shows its words and its link without cards — the link is the point.
 *
 * `normaliseEvents` and `formatEventDate` are pure and tested; only
 * `getUpcomingEvents` touches the network.
 */

export type EventCard = {
  id: string;
  title: string;
  city: string | null;
  venue: string | null;
  /** ISO timestamp of the next occurrence, or null for an undated listing. */
  startsAt: string | null;
  timezone: string | null;
  coverImage: string | null;
  /** The event's page on the Events shop. */
  url: string;
};

type RawEvent = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  city?: unknown;
  venue_name?: unknown;
  timezone?: unknown;
  cover_image_url?: unknown;
  event_occurrences?: unknown;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The API's rows, as cards. Anything without an id, a slug and a title is
 * dropped: a card that cannot link to its event is an advertisement for
 * nothing. Cover images are kept only from the storage host next/image is
 * allowed to load, so a bad URL cannot break the build of the page.
 */
export function normaliseEvents(payload: unknown, now: Date = new Date()): EventCard[] {
  const rows = Array.isArray((payload as { events?: unknown })?.events)
    ? ((payload as { events: RawEvent[] }).events)
    : [];
  const out: EventCard[] = [];
  for (const row of rows) {
    const id = str(row.id);
    const slug = str(row.slug);
    const title = str(row.title);
    if (!id || !slug || !title) continue;

    const occurrences = Array.isArray(row.event_occurrences) ? (row.event_occurrences as { starts_at?: unknown }[]) : [];
    const upcoming = occurrences
      .map((o) => str(o?.starts_at))
      .filter((s): s is string => !!s && !Number.isNaN(Date.parse(s)) && Date.parse(s) >= now.getTime())
      .sort((a, b) => Date.parse(a) - Date.parse(b));

    const cover = str(row.cover_image_url);
    const coverOk = cover && /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(cover);

    out.push({
      id,
      title,
      city: titleCase(str(row.city)),
      venue: str(row.venue_name),
      startsAt: upcoming[0] ?? null,
      timezone: str(row.timezone),
      coverImage: coverOk ? cover : null,
      url: `${SHOP_URL}/events/${encodeURIComponent(slug)}`,
    });
  }
  // Dated events first, soonest first; undated ones after, in the order given.
  return out.sort((a, b) => {
    if (a.startsAt && b.startsAt) return Date.parse(a.startsAt) - Date.parse(b.startsAt);
    if (a.startsAt) return -1;
    if (b.startsAt) return 1;
    return 0;
  });
}

/** "scarborough" → "Scarborough". The Events data is typed by organisers. */
function titleCase(city: string | null): string | null {
  if (!city) return null;
  return city.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/**
 * "Sat, Oct 17 · 7:30 p.m." in the event's own timezone — a Toronto dinner
 * at 7:30 must not read as 11:30 to a Toronto visitor because the server is
 * in UTC. An unknown zone falls back to UTC rather than throwing.
 */
export function formatEventDate(iso: string | null, timezone: string | null, locale = 'en-CA'): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone ?? 'UTC' }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).formatToParts(date);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = `${get('weekday')}, ${get('month')} ${get('day')}`;
  // The day period is composed here, not taken from the formatter: Bun's ICU
  // says "PM" where a browser's says "p.m." — the same disagreement that made
  // lib/money.ts write formatDateRange by hand. One spelling, every runtime.
  const period = /^a/i.test(get('dayPeriod')) ? ' a.m.' : /^p/i.test(get('dayPeriod')) ? ' p.m.' : '';
  const time = `${get('hour')}:${get('minute')}${period}`;
  return `${day} · ${time}`;
}

/** Distinct cities among the cards, in order of first appearance. */
export function citiesOf(events: EventCard[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of events) {
    if (e.city && !seen.has(e.city)) {
      seen.add(e.city);
      out.push(e.city);
    }
  }
  return out;
}

/** Where a city chip goes: the shop's search, which is how the Events landing page links a culture. */
export function cityUrl(city: string): string {
  return `${SHOP_URL}?search=${encodeURIComponent(city)}`;
}

export async function getUpcomingEvents(limit = 6): Promise<EventCard[]> {
  try {
    const response = await fetch(`${APEX_URL}/api/events/by-culture?culture=All`, {
      // Fifteen minutes: an event listing tolerates being that stale, and the
      // home page must not pay a network round trip per visitor.
      next: { revalidate: 900 },
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return [];
    return normaliseEvents(await response.json()).slice(0, limit);
  } catch (error) {
    // The home page renders without the cards; the section keeps its link.
    console.error('[events] could not reach the Events API', error);
    return [];
  }
}
