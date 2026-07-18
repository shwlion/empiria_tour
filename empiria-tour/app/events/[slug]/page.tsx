import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';

/**
 * STUB — tour detail page.
 *
 * In the shop, this server-fetches the event + ticket tiers + occurrences and
 * renders the ticket/seatmap widgets. Port that logic here once the Supabase
 * schema + Supabase Auth are wired up. For now it just proves the route + design.
 */
export default async function TourDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;

    return (
        <div className="min-h-screen bg-white font-sans text-slate-900">
            <Navbar />
            <main className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
                <p className="text-sm font-semibold text-[#F15A29] uppercase tracking-widest mb-2">Tour</p>
                <h1 className="text-3xl font-extrabold text-slate-900 mb-4 break-words">{slug}</h1>
                <div className="rounded-2xl border border-gray-100 shadow-sm p-8 bg-white">
                    <p className="text-gray-700">
                        This is a placeholder tour detail page. Ticketing, occurrences, and checkout
                        will be ported from <code className="text-[#F15A29]">empiria-shop</code> once the
                        Supabase project and Supabase Auth are set up.
                    </p>
                    <Link
                        href="/"
                        className="inline-block mt-6 px-6 py-2.5 rounded-full border border-[#F15A29] text-[#F15A29] font-semibold text-sm hover:bg-[#F15A29] hover:text-white transition-colors"
                    >
                        ← Back to all tours
                    </Link>
                </div>
            </main>
            <Footer />
        </div>
    );
}
