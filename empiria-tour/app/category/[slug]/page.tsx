import { redirect } from 'next/navigation';

/**
 * Browse is one page with facets, not a page per facet.
 *
 * `/category/culinary` now resolves to the results page with that filter
 * applied, which keeps a single implementation of sorting, pagination and the
 * empty state. The trade-off is a query string where a clean path would read
 * better for SEO — worth revisiting in the Part F pass as
 * `/destinations/[...path]` and `/collections/[slug]` landing pages.
 */
export default async function CategoryRedirect({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    redirect(`/tours?category=${encodeURIComponent(slug)}`);
}
