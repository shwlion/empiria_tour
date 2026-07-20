import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';

/**
 * STUB — dedicated (crawlable/SEO) category page.
 *
 * In the shop, this server-fetches published events for the category and renders
 * the same EventCard grid. Port that once the schema exists. The home grid links
 * here, so the route must resolve.
 */
export default async function CategoryPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const title = slug.replace(/-/g, ' ');

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar />
            <main className="mx-auto max-w-7xl px-6 py-24 sm:px-10">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-label text-flame">Category</p>
                <h1 className="mb-4 font-display text-3xl font-semibold capitalize tracking-tight text-ink sm:text-4xl">{title} tours</h1>
                <p className="text-stone">
                    Placeholder category page. Fetch and render tours for this category here.
                </p>
                <Link href="/" className="mt-6 inline-block font-mono text-[11px] uppercase tracking-wider text-flame hover:underline">
                    ← Browse all tours
                </Link>
            </main>
            <Footer />
        </div>
    );
}
