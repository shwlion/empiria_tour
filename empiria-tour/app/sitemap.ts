import type { MetadataRoute } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildSitemap, PAGE_SLUGS, type SitemapRow } from '@/lib/sitemap';

/**
 * Part F's XML sitemap, served at /sitemap.xml.
 *
 * Revalidated rather than static: publishing a tour or a post should reach the
 * sitemap without a redeploy, and an hour is well inside the window any crawler
 * cares about.
 *
 * With no database configured this still serves — the four routes that exist
 * regardless of content. A sitemap that 500s is worse than a short one, because
 * a crawler remembers the error for longer than it would have remembered four
 * URLs.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const db = getSupabaseAdmin();
    if (!db) return buildSitemap({ packages: [], posts: [], pages: [] });

    const [packages, posts, pages] = await Promise.all([
        db.from('packages').select('slug, updated_at').eq('status', 'published'),
        db.from('blog_posts').select('slug, updated_at').eq('status', 'published'),
        db.from('static_pages').select('slug, updated_at').in('slug', [...PAGE_SLUGS]),
    ]);

    return buildSitemap({
        packages: (packages.data ?? []) as SitemapRow[],
        posts: (posts.data ?? []) as SitemapRow[],
        pages: (pages.data ?? []) as SitemapRow[],
    });
}
