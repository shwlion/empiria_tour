/**
 * Reading the blog.
 *
 * Every function here is the storefront's view: published posts only. A draft
 * is visible to its author and to administrators, and both reach it through
 * their own console — not through this module. `/blog/[slug]` 404s on anything
 * unpublished whoever is asking, the same way a booking reference that is not
 * yours 404s rather than confirming it exists.
 *
 * See docs/BLOG.md.
 */

import { getSupabaseAdmin } from './supabase';
import { blogBodyToText } from './blogMarkdown';
import { truncate } from './seo';

/**
 * The same page size `searchPackages` defaults to, so the two grids feel like
 * one site rather than two.
 */
export const BLOG_PAGE_SIZE = 12;

export type BlogAuthor = { id: string; name: string };

export type BlogCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  heroImage: string | null;
  publishedAt: string | null;
  author: BlogAuthor;
};

export type BlogPost = BlogCard & {
  body: string;
  packageId: string | null;
  destination: { name: string; path: string } | null;
};

/** Shape of the join we ask PostgREST for, in one place. */
const CARD_SELECT = `
  id, slug, title, excerpt, hero_image, published_at, body,
  author:users!blog_posts_author_id_fkey ( id, full_name ),
  destination:destinations ( name, path ),
  package_id
`;

type Row = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image: string | null;
  published_at: string | null;
  body: string;
  package_id: string | null;
  author: { id: string; full_name: string | null } | null;
  destination: { name: string; path: string } | null;
};

/**
 * The excerpt is authored and optional. Left empty it falls back to the start
 * of the body rendered down to plain text — one definition of "the short
 * version of this", shared with the meta description rather than a second one
 * that drifts from it.
 */
function excerptOf(row: Row): string {
  if (row.excerpt?.trim()) return row.excerpt.trim();
  return truncate(blogBodyToText(row.body), 160);
}

function toCard(row: Row): BlogCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: excerptOf(row),
    heroImage: row.hero_image,
    publishedAt: row.published_at,
    // A post always has an author (author_id is not null, on delete restrict),
    // but a closed account is anonymised rather than deleted.
    author: { id: row.author?.id ?? '', name: row.author?.full_name?.trim() || 'Empiria Tours' },
  };
}

export async function getPublishedPosts(
  page = 1
): Promise<{ posts: BlogCard[]; total: number; page: number; pages: number }> {
  const db = getSupabaseAdmin();
  const empty = { posts: [], total: 0, page: 1, pages: 0 };
  if (!db) return empty;

  const current = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const from = (current - 1) * BLOG_PAGE_SIZE;

  const { data, error, count } = await db
    .from('blog_posts')
    .select(CARD_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, from + BLOG_PAGE_SIZE - 1);

  if (error || !data) return empty;

  const total = count ?? data.length;
  return {
    posts: (data as unknown as Row[]).map(toCard),
    total,
    page: current,
    pages: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)),
  };
}

/** Null for a draft, an unpublished post, or a slug that does not exist. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const db = getSupabaseAdmin();
  if (!db || !slug) return null;

  const { data, error } = await db
    .from('blog_posts')
    .select(CARD_SELECT)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as Row;
  return {
    ...toCard(row),
    body: row.body,
    packageId: row.package_id,
    destination: row.destination,
  };
}

/** Slugs of published posts, for the sitemap and for static params. */
export async function getPublishedSlugs(): Promise<string[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db.from('blog_posts').select('slug').eq('status', 'published');
  return (data ?? []).map((r) => r.slug);
}

/**
 * Title to slug: lowercased, non-alphanumerics collapsed to hyphens, then
 * deduplicated with a numeric suffix.
 *
 * Editable while a post is a draft and frozen the moment it first publishes —
 * a slug that changes is a link that breaks, and the people holding that link
 * are the readers the post was written for. The freeze is enforced by a
 * trigger in migration 0013, not here, so both consoles inherit it.
 */
export function slugify(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return base || 'post';
}

/** The first free slug of `base`, `base-2`, `base-3`… */
export async function uniqueSlug(title: string, exceptId?: string): Promise<string> {
  const db = getSupabaseAdmin();
  const base = slugify(title);
  if (!db) return base;

  const { data } = await db.from('blog_posts').select('id, slug').like('slug', `${base}%`);
  const taken = new Set((data ?? []).filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}
