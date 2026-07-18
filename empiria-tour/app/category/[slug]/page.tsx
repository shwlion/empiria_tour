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
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <Navbar />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
                <h1 className="text-3xl font-extrabold text-[#F15A29] capitalize mb-4">{title} Tours</h1>
                <p className="text-gray-700">
                    Placeholder category page. Fetch and render tours for this category here.
                </p>
                <Link href="/" className="inline-block mt-6 text-sm font-medium text-[#F15A29] hover:underline">
                    ← Browse all tours
                </Link>
            </main>
            <Footer />
        </div>
    );
}
