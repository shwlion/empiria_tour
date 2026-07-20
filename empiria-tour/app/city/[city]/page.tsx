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
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar />
            <main className="mx-auto max-w-7xl px-6 py-24 sm:px-10">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-label text-flame">City</p>
                <h1 className="mb-4 font-display text-3xl font-semibold capitalize tracking-tight text-ink sm:text-4xl">Tours in {name}</h1>
                <p className="text-stone">
                    Placeholder city page. Fetch and render tours in this city here.
                </p>
                <Link href="/" className="mt-6 inline-block font-mono text-[11px] uppercase tracking-wider text-flame hover:underline">
                    ← Browse all tours
                </Link>
            </main>
            <Footer />
        </div>
    );
}
