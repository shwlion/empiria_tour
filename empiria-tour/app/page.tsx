import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HomeContent from '@/app/components/HomeContent';
import { absoluteUrl } from '@/lib/seo';

export const metadata: Metadata = {
    title: 'Empiria Tour — Discover Cultural Tours & Book Experiences',
    description:
        'Discover and book guided cultural tours and unforgettable experiences across Canada and beyond.',
    alternates: { canonical: '/' },
    openGraph: {
        title: 'Empiria Tour — Discover Cultural Tours & Book Experiences',
        description:
            'Discover and book guided cultural tours and unforgettable experiences.',
        url: absoluteUrl('/'),
        type: 'website',
    },
};

interface EventRow {
    id: string;
    title: string;
    slug: string;
    cover_image_url?: string;
    venue_name?: string;
    city?: string;
    currency?: string;
    timezone?: string;
    categories?: { name: string } | null;
    ticket_tiers?: { price: number }[];
    event_occurrences?: { starts_at: string }[];
    _nextFutureTs?: number | null;
}

export default async function TourHome({
    searchParams,
}: {
    searchParams: Promise<{ category?: string }>;
}) {
    const { category: activeCategory } = await searchParams;
    const supabase = getSupabaseAdmin();

    let featuredEvents: EventRow[] = [];
    let events: EventRow[] = [];
    let categories: { id: string; name: string; slug: string }[] = [];

    // The design shell renders without a database. Once SUPABASE_URL + SUPABASE_KEY
    // point at your new Supabase project (and the tables exist), this populates
    // the hero slideshow + events grid exactly like the shop.
    if (supabase) {
        try {
            const { data: rawFeatured } = await supabase
                .from('events')
                .select(`
          id, title, slug, cover_image_url, timezone,
          venue_name, city, currency,
          categories (name),
          event_occurrences (starts_at)
        `)
                .eq('status', 'published')
                .eq('visibility', 'public')
                .eq('is_featured', true)
                .eq('event_type', 'event')
                .order('created_at', { ascending: false })
                .limit(5);
            featuredEvents = (rawFeatured || []) as unknown as EventRow[];

            const { data: realEvents } = await supabase
                .from('events')
                .select(`
          id, title, slug, cover_image_url, timezone,
          venue_name, city, currency, entry_type,
          categories (name),
          ticket_tiers (price),
          event_occurrences (starts_at)
        `)
                .eq('status', 'published')
                .eq('visibility', 'public')
                .eq('event_type', 'event')
                .order('created_at', { ascending: false })
                .limit(500);

            const now = Date.now();
            events = ((realEvents || []) as unknown as EventRow[]).map((e) => {
                const occs = [...(e.event_occurrences || [])].sort(
                    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
                );
                const nextFuture = occs.find((o) => new Date(o.starts_at).getTime() >= now);
                return {
                    ...e,
                    event_occurrences: occs,
                    _nextFutureTs: nextFuture ? new Date(nextFuture.starts_at).getTime() : null,
                };
            });

            // Order by event DATE, not created_at: soonest UPCOMING first, past last.
            events.sort((a, b) => {
                if (a._nextFutureTs != null && b._nextFutureTs != null) return a._nextFutureTs - b._nextFutureTs;
                if (a._nextFutureTs != null) return -1;
                if (b._nextFutureTs != null) return 1;
                const aLast = a.event_occurrences?.[a.event_occurrences.length - 1]?.starts_at;
                const bLast = b.event_occurrences?.[b.event_occurrences.length - 1]?.starts_at;
                return new Date(bLast || 0).getTime() - new Date(aLast || 0).getTime();
            });

            const { data: cats } = await supabase
                .from('categories')
                .select('id, name, slug')
                .eq('is_active', true)
                .eq('show_on_landing', true)
                .order('name');
            categories = (cats || []) as { id: string; name: string; slug: string }[];
        } catch {
            // Schema not ready yet — fall through with empty data so the shell renders.
        }
    }

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar overlay />
            <HomeContent
                events={events}
                featuredEvents={featuredEvents}
                categories={categories}
                activeCategory={activeCategory ?? null}
            />
            <Footer />
        </div>
    );
}
