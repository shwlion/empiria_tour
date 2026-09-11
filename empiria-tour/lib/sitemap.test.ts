import { buildSitemap, STATIC_ROUTES, PAGE_SLUGS } from './sitemap';
import { absoluteUrl } from './seo';

// Expectations are built with absoluteUrl rather than a literal host: TOUR_URL
// comes from NEXT_PUBLIC_TOUR_URL, so a hardcoded domain would pass on a
// developer's machine and fail in CI, or the reverse.
const at = (path: string) => absoluteUrl(path);

/**
 * What belongs in the sitemap, and — the part worth asserting — what does not.
 *
 *   bun run lib/sitemap.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};
const ok = (name: string, got: boolean) => eq(name, got, true);

const NOW = new Date('2026-09-11T00:00:00.000Z');
const empty = { packages: [], posts: [], pages: [], now: NOW };
const urls = (input: Parameters<typeof buildSitemap>[0]) => buildSitemap(input).map((e) => e.url);

// ── the floor ───────────────────────────────────────────────────────────────
eq(
  'with no content at all, the routes that exist regardless still ship',
  urls(empty),
  STATIC_ROUTES.map(at)
);
ok('every url is absolute', urls(empty).every((u) => /^https?:\/\//.test(u)));

// ── static pages appear only when they have a row ───────────────────────────
eq(
  'a page with no row is not listed, because it 404s',
  urls({ ...empty, pages: [] }).filter((u) => u.endsWith('/terms')),
  []
);
eq(
  'a page with a row is listed',
  urls({ ...empty, pages: [{ slug: 'terms', updated_at: null }] }).filter((u) => u.endsWith('/terms')),
  [at('/terms')]
);
eq(
  'all seven of Exhibit A B6 are recognised slugs',
  [...PAGE_SLUGS],
  ['terms', 'privacy', 'booking-conditions', 'cancellation', 'about', 'contact', 'faq']
);
eq(
  'pages come out in B6 order, not the order the rows arrived in',
  urls({ ...empty, pages: [{ slug: 'faq' }, { slug: 'about' }, { slug: 'terms' }] })
    .filter((u) => !STATIC_ROUTES.map(at).includes(u)),
  [at('/terms'), at('/about'), at('/faq')]
);
eq(
  'a slug that is not one of the seven is ignored',
  urls({ ...empty, pages: [{ slug: 'secret-internal-page' }] }),
  urls(empty)
);

// ── tours and posts ─────────────────────────────────────────────────────────
eq(
  'a published tour is listed under /tours/',
  urls({ ...empty, packages: [{ slug: 'kyoto-in-autumn', updated_at: '2026-08-01T10:00:00Z' }] }).at(-1),
  at('/tours/kyoto-in-autumn')
);
eq(
  'a published post is listed under /blog/',
  urls({ ...empty, posts: [{ slug: 'why-we-walk', updated_at: null }] }).at(-1),
  at('/blog/why-we-walk')
);
eq(
  'a row with an empty slug is dropped rather than emitting a bare /tours/',
  urls({ ...empty, packages: [{ slug: '' }] }),
  urls(empty)
);

// ── the exclusions that matter ──────────────────────────────────────────────
const everything = urls({
  packages: [{ slug: 'a' }],
  posts: [{ slug: 'b' }],
  pages: PAGE_SLUGS.map((slug) => ({ slug })),
  now: NOW,
});
for (const forbidden of ['/account', '/booking/', '/book/', '/login', '/auth/', '/api/', '/city/', '/category/']) {
  ok(`nothing under ${forbidden} is ever listed`, !everything.some((u) => u.includes(forbidden)));
}

// ── timestamps ──────────────────────────────────────────────────────────────
const dated = buildSitemap({ ...empty, packages: [{ slug: 'a', updated_at: '2026-08-01T10:00:00Z' }] });
eq('updated_at becomes lastModified', dated.at(-1)!.lastModified.toISOString(), '2026-08-01T10:00:00.000Z');

const undated = buildSitemap({ ...empty, packages: [{ slug: 'a', updated_at: null }] });
eq('a missing timestamp falls back to now', undated.at(-1)!.lastModified.toISOString(), NOW.toISOString());

const garbled = buildSitemap({ ...empty, packages: [{ slug: 'a', updated_at: 'not a date' }] });
eq('an unparseable timestamp falls back rather than emitting Invalid Date', garbled.at(-1)!.lastModified.toISOString(), NOW.toISOString());

// ── duplicates ──────────────────────────────────────────────────────────────
eq(
  'the same slug twice is listed once',
  urls({ ...empty, packages: [{ slug: 'a' }, { slug: 'a' }] }).filter((u) => u.endsWith('/tours/a')).length,
  1
);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
