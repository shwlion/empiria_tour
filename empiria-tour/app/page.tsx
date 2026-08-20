import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HomeContent from '@/app/components/HomeContent';
import { absoluteUrl } from '@/lib/seo';
import {
    getCategories,
    getDefaultCurrency,
    getFeaturedPackages,
    searchPackages,
    type PackageCard,
} from '@/lib/catalogue';

export const metadata: Metadata = {
    title: 'Empiria Tours — Small-group travel, booked properly',
    description:
        'Guided small-group trips through Greece, Italy and beyond. Real departures, all-in pricing, no guesswork.',
    alternates: { canonical: '/' },
    openGraph: {
        title: 'Empiria Tours — Small-group travel, booked properly',
        description: 'Guided small-group trips through Greece, Italy and beyond.',
        url: absoluteUrl('/'),
        type: 'website',
    },
};

/**
 * TEMPORARY ADAPTER.
 *
 * `FeaturedHero`, `EventsGrid` and `EventCard` were copied from empiria-shop and
 * are shaped around a single-datetime event: a date box with a clock time, a
 * ticket price, an organizer. A tour package has a duration and a *next
 * departure* instead. This maps one onto the other so the page renders real
 * catalogue data today, and it is scaffolding — those three components get
 * replaced by tour-native ones in the design pass, and this function goes with
 * them.
 *
 * Known cosmetic artifact until then: the card's time line reads 00:00, because
 * a departure is a date and not an instant.
 */
function asLegacyEventShape(p: PackageCard) {
    return {
        id: p.id,
        title: p.title,
        slug: p.slug,
        cover_image_url: p.heroImage ?? undefined,
        venue_name: p.destination?.name ?? undefined,
        city: undefined,
        currency: p.currency,
        categories: p.category ? { name: p.category.name } : null,
        ticket_tiers: p.fromPriceCents != null ? [{ price: p.fromPriceCents / 100 }] : [],
        event_occurrences: p.nextDepartureOn ? [{ starts_at: `${p.nextDepartureOn}T00:00:00Z` }] : [],
        start_at: p.nextDepartureOn ? `${p.nextDepartureOn}T00:00:00Z` : undefined,
        organizer_name: undefined,
    };
}

export default async function TourHome({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; currency?: string }>;
}) {
    const { category: activeCategory, currency: currencyParam } = await searchParams;

    const defaultCurrency = await getDefaultCurrency();
    const currency = currencyParam?.toUpperCase() ?? defaultCurrency;

    // Every one of these degrades to an empty array when Supabase is unset, so
    // the design shell still renders without a database.
    const [featured, results, categories] = await Promise.all([
        getFeaturedPackages(currency, 5),
        searchPackages(
            { categorySlug: activeCategory, sort: 'popularity', perPage: 48 },
            currency
        ),
        getCategories(),
    ]);

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar overlay />
            <HomeContent
                events={results.packages.map(asLegacyEventShape)}
                featuredEvents={featured.map(asLegacyEventShape)}
                categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
                activeCategory={activeCategory ?? null}
            />
            <Footer />
        </div>
    );
}
