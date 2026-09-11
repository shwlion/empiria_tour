import { absoluteUrl } from '@/lib/seo';

/**
 * The XML sitemap Part F asks for, split into a pure builder and a reader.
 *
 * The builder is here and takes rows; `app/sitemap.ts` fetches them. That split
 * is the same one `lib/pricing.ts` and `lib/deck.ts` make, and for the same
 * reason: the interesting part is which URLs belong in the file and which
 * emphatically do not, and that part should be assertable without a database.
 *
 * Three things are deliberately absent:
 *
 *  - **`/city/[city]` and `/category/[slug]`.** Both are redirects to `/tours`
 *    with a query string. A sitemap is a list of canonical addresses, and a
 *    redirect has no claim to be one.
 *  - **Anything behind a session** — `/account`, `/booking/[reference]`,
 *    `/login`, `/auth/*`. A booking reference in a sitemap is a booking
 *    reference in a search index.
 *  - **Static pages with no row.** `PolicyPage` calls `notFound()` when the
 *    row is missing, and all seven are empty today. Listing a 404 in a sitemap
 *    is the same mistake as linking one in a footer, which this project already
 *    decided not to make.
 */

/** A row that carries its own address and the last time it changed. */
export type SitemapRow = { slug: string; updated_at?: string | null };

export type SitemapInput = {
    /** Published packages. */
    packages: SitemapRow[];
    /** Published blog posts. */
    posts: SitemapRow[];
    /** Static pages that actually have a row. */
    pages: SitemapRow[];
    /** Fallback for entries with no timestamp of their own. */
    now?: Date;
};

export type SitemapEntry = { url: string; lastModified: Date };

/**
 * Routes that exist regardless of content. `/blog` is included because it
 * renders an empty state rather than a 404, unlike a missing static page.
 */
export const STATIC_ROUTES = ['/', '/tours', '/partners', '/blog'] as const;

/**
 * The seven pages Exhibit A B6 names. The first four have routes today; about,
 * contact and FAQ are the rest of that list. Order is the order B6 gives them.
 */
export const PAGE_SLUGS = [
    'terms',
    'privacy',
    'booking-conditions',
    'cancellation',
    'about',
    'contact',
    'faq',
] as const;

/** Parse a timestamp, falling back rather than emitting an Invalid Date. */
function when(value: string | null | undefined, fallback: Date): Date {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function buildSitemap(input: SitemapInput): SitemapEntry[] {
    const now = input.now ?? new Date();
    const entries: SitemapEntry[] = [];
    const seen = new Set<string>();

    const push = (path: string, lastModified: Date) => {
        const url = absoluteUrl(path);
        if (seen.has(url)) return;
        seen.add(url);
        entries.push({ url, lastModified });
    };

    for (const route of STATIC_ROUTES) push(route, now);

    // Only pages with a row: the rest 404.
    const bySlug = new Map(input.pages.map((p) => [p.slug, p]));
    for (const slug of PAGE_SLUGS) {
        const page = bySlug.get(slug);
        if (page) push(`/${slug}`, when(page.updated_at, now));
    }

    for (const pkg of input.packages) {
        if (pkg.slug) push(`/tours/${pkg.slug}`, when(pkg.updated_at, now));
    }

    for (const post of input.posts) {
        if (post.slug) push(`/blog/${post.slug}`, when(post.updated_at, now));
    }

    return entries;
}
