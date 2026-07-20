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
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar />
            <main className="mx-auto max-w-3xl px-6 py-24 sm:px-10">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-label text-flame">Tour</p>
                <h1 className="mb-6 break-words font-display text-3xl font-semibold tracking-tight text-ink">{slug}</h1>
                <div className="rounded-lg border border-line bg-bone p-8">
                    <p className="leading-relaxed text-stone">
                        This is a placeholder tour detail page. Ticketing, occurrences, and checkout
                        will be ported from <code className="font-mono text-flame">empiria-shop</code> once the
                        Supabase project and Supabase Auth are set up.
                    </p>
                    <Link
                        href="/"
                        className="mt-6 inline-block rounded-lg border border-ink px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-bone"
                    >
                        ← Back to all tours
                    </Link>
                </div>
            </main>
            <Footer />
        </div>
    );
}
