import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';

/**
 * STUB — dedicated (crawlable/SEO) city page.
 *
 * In the shop, this server-fetches published events in the city and renders the
 * EventCard grid. Port that once the schema exists. The home grid's smart-search
 * suggestions link here, so the route must resolve.
 */
export default async function CityPage({
    params,
}: {
    params: Promise<{ city: string }>;
}) {
    const { city } = await params;
    const name = city.replace(/-/g, ' ');

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <Navbar />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
                <h1 className="text-3xl font-extrabold text-[#F15A29] capitalize mb-4">Tours in {name}</h1>
                <p className="text-gray-700">
                    Placeholder city page. Fetch and render tours in this city here.
                </p>
                <Link href="/" className="inline-block mt-6 text-sm font-medium text-[#F15A29] hover:underline">
                    ← Browse all tours
                </Link>
            </main>
            <Footer />
        </div>
    );
}
