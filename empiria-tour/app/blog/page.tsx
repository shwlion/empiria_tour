import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import CinemaScroll from '@/components/blog/CinemaScroll';
import { getPublishedPosts } from '@/lib/blog';
import { getCatalogueCounts } from '@/lib/catalogue';
import { absoluteUrl } from '@/lib/seo';
import './cinema.css';

/**
 * The journal — a cinematic scroll story whose slider cards are the posts.
 *
 * The composition and every value in it are a specification reproduced
 * verbatim (components/blog/CinemaScroll.tsx, app/blog/cinema.css). What this
 * page decides is what feeds it: the latest page of published posts, newest
 * first, and two live catalogue counts for the copy. A card opens its post at
 * /blog/[slug], which is unchanged.
 *
 * The site's dark navbar sits over the story. It is fixed to the viewport, so
 * it stays at the top through the whole scroll, and `overlay` drops the
 * in-flow spacer the inner pages use — the hero belongs under it. No footer:
 * the page ends on the posts, which is where it should end.
 */

// Posts are written and taken down from two consoles, so this page must not be
// frozen at build time. Five minutes matches the policy pages.
export const revalidate = 300;

const TITLE = 'Journal — Empiria Tours';
const DESCRIPTION = 'Notes from the road, written by the people who run the trips.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl('/blog') },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl('/blog'),
    type: 'website',
  },
};

export default async function BlogIndex() {
  const [{ posts }, counts] = await Promise.all([getPublishedPosts(1), getCatalogueCounts()]);
  return (
    <>
      {/* The wrapper is how the composition measures the navbar: the cards'
          row must clear it, and the plate's height is the navbar's to change. */}
      <div className="cinema-nav">
        <Navbar tone="dark" overlay />
      </div>
      <CinemaScroll posts={posts} counts={counts} />
    </>
  );
}
