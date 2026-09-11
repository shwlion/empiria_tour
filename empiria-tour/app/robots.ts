import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/**
 * robots.txt.
 *
 * The disallow list is the same boundary the sitemap draws, stated the other
 * way round: anything that needs a session, plus the two redirect routes, which
 * have no canonical claim and would only spend crawl budget arriving at
 * `/tours` by a longer road.
 *
 * `/booking/` matters most. A booking is reachable by reference to anyone
 * holding the link — that is deliberate, so a traveller who booked signed-out
 * can still find it — but reachable-by-link and listed-in-a-search-index are
 * very different things.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/account/', '/booking/', '/book/', '/login', '/auth/', '/api/', '/city/', '/category/'],
        },
        // No `host`. The directive is Yandex's, Google ignores it, and Next
        // renders whatever it is given — `absoluteUrl('/')` emitted
        // "Host: https://tour.empiria.events/", which is a URL where the
        // directive wants a bare domain. A line that is both ignored and
        // malformed is better deleted than corrected.
        sitemap: absoluteUrl('/sitemap.xml'),
    };
}
