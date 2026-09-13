import type { Metadata } from 'next';
import CinemaScroll from '@/components/blog/CinemaScroll';
import { getPublishedPosts } from '@/lib/blog';
import { absoluteUrl } from '@/lib/seo';
import './cinema.css';

/**
 * The journal — a cinematic scroll story whose slider cards are the posts.
 *
 * The composition, its copy and every value are a specification reproduced
 * verbatim (components/blog/CinemaScroll.tsx, app/blog/cinema.css). What this
 * page decides is only what feeds it: the latest page of published posts,
 * newest first. A card opens its post at /blog/[slug], which is unchanged.
 *
 * No Navbar or Footer: the story carries its own header inside the sticky
 * stage, and the site's sticky bar above a 100vh sticky stage would fight it.
 */

// Posts are written and taken down from two consoles, so this page must not be
// frozen at build time. Five minutes matches the policy pages.
export const revalidate = 300;

const TITLE = 'Mostar city';
const DESCRIPTION = 'A cinematic three-screen scroll story for Mostar city.';

export const metadata: Metadata = {
  // `absolute`, or the root template appends " · Empiria Tours" and the
  // specification's title is no longer the specification's title.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  icons: { icon: 'data:,' },
  alternates: { canonical: absoluteUrl('/blog') },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/blog'),
    type: 'website',
  },
};

export default async function BlogIndex() {
  const { posts } = await getPublishedPosts(1);
  return <CinemaScroll posts={posts} />;
}
