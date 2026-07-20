'use client';

import { Compass } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCurrencySymbol } from '@/lib/utils';
import { EventCard } from './EventCard';

const PAGE_SIZE = 12;

// City slug rule (kept in sync with the /city/[citySlug] pages): lowercase,
// trim, strip diacritics, collapse non-alphanumerics to single hyphens.
function toCitySlug(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

interface Event {
    id: string;
    title: string;
    slug: string;
    cover_image_url?: string;
    venue_name?: string;
    city?: string;
    currency?: string;
    categories?: { name: string } | null;
    ticket_tiers?: { price: number }[];
    event_occurrences?: { starts_at: string }[];
    start_at?: string;
    timezone?: string;
    organizer_name?: string;
    organizer_avatar_url?: string | null;
    co_host_count?: number;
    entry_type?: string;
}

interface EventsGridProps {
    events: Event[];
    query: string;
    setQuery: (q: string) => void;
    categories: { id: string; name: string; slug: string }[];
    activeCategory: string | null;
}

export default function EventsGrid({ events, query, categories, activeCategory }: EventsGridProps) {
    // Category filtering happens CLIENT-SIDE for an instant, smooth experience —
    // clicking a pill filters the events already on the page (no navigation).
    // Initialized from ?category= so shared/old links still open pre-filtered.
    // The dedicated /category/[slug] pages exist separately for SEO.
    const [selectedSlug, setSelectedSlug] = useState<string | null>(activeCategory);
    const selectedCategoryName = selectedSlug
        ? categories.find((c) => c.slug === selectedSlug)?.name ?? null
        : null;

    const filtered = events.filter((event) => {
        // Category filter (match on the event's category name).
        if (selectedCategoryName && event.categories?.name !== selectedCategoryName) return false;
        // Search filter.
        if (query.trim()) {
            const q = query.toLowerCase();
            return (
                event.title?.toLowerCase().includes(q) ||
                event.venue_name?.toLowerCase().includes(q) ||
                event.city?.toLowerCase().includes(q) ||
                event.categories?.name?.toLowerCase().includes(q)
            );
        }
        return true;
    });

    // Smart search suggestions: when the search text matches a known city
    // and/or category name (case-insensitive substring, min 3 chars), offer
    // direct links to the dedicated crawlable browse pages.
    const suggestionQuery = query.trim().toLowerCase();
    let cityMatch: { name: string; slug: string } | null = null;
    let categoryMatch: { name: string; slug: string } | null = null;
    if (suggestionQuery.length >= 3) {
        // Dedupe cities case-insensitively by slug (first casing wins).
        const citiesBySlug = new Map<string, string>();
        for (const e of events) {
            const city = e.city?.trim();
            if (!city) continue;
            const slug = toCitySlug(city);
            if (slug && !citiesBySlug.has(slug)) citiesBySlug.set(slug, city);
        }
        for (const [slug, name] of citiesBySlug) {
            const lower = name.toLowerCase();
            if (lower.includes(suggestionQuery) || suggestionQuery.includes(lower)) {
                cityMatch = { name, slug };
                break;
            }
        }
        for (const cat of categories) {
            const lower = cat.name.toLowerCase();
            if (lower.includes(suggestionQuery) || suggestionQuery.includes(lower)) {
                categoryMatch = { name: cat.name, slug: cat.slug };
                break;
            }
        }
    }

    // Paginate client-side: show PAGE_SIZE at a time, reveal more on demand.
    // Reset to the first page whenever the search query or category changes.
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query, selectedSlug]);
    const visible = filtered.slice(0, visibleCount);
    const hasMore = filtered.length > visibleCount;

    const eyebrow = query.trim()
        ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}`
        : selectedCategoryName
            ? 'Category'
            : 'Upcoming';
    const heading = query.trim()
        ? `“${query}”`
        : selectedCategoryName
            ? `${selectedCategoryName} tours`
            : 'Upcoming tours';

    return (
        <div className="w-full bg-paper">
            {/* Events Grid */}
            <div className="max-w-7xl mx-auto px-6 sm:px-10 py-20 text-left">
                <div className="mb-10 flex flex-col gap-6 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                        <div className="mb-3 flex items-center gap-3">
                            <span className="h-2 w-2 rotate-45 bg-flame" aria-hidden="true" />
                            <span className="font-mono text-[11px] uppercase tracking-label text-stone">
                                {eyebrow}
                            </span>
                        </div>
                        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                            {heading}
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[{ name: 'All', slug: null as string | null }, ...categories].map((cat) => {
                            const isActive = cat.slug === null ? !selectedSlug : cat.slug === selectedSlug;
                            return (
                                <button
                                    key={cat.name}
                                    type="button"
                                    onClick={() => setSelectedSlug(cat.slug)}
                                    className={`rounded-md border px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                                        isActive
                                            ? 'border-ink bg-ink text-bone'
                                            : 'border-line bg-transparent text-stone hover:border-flame hover:text-flame'
                                    }`}
                                >
                                    {cat.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Internal link to the dedicated (crawlable, SEO) category page. */}
                {selectedSlug && selectedCategoryName && (
                    <div className="-mt-4 mb-8">
                        <Link
                            href={`/category/${selectedSlug}`}
                            className="font-mono text-[11px] uppercase tracking-wider text-flame hover:underline"
                        >
                            View the full {selectedCategoryName} page →
                        </Link>
                    </div>
                )}

                {/* Smart suggestion links to the dedicated city/category browse pages. */}
                {(cityMatch || categoryMatch) && (
                    <div className="mb-8 flex flex-wrap items-center gap-3 rounded-lg border border-flame/25 bg-flame/5 px-4 py-3">
                        <span className="font-mono text-[10px] uppercase tracking-label text-stone">Jump to</span>
                        {cityMatch && (
                            <Link
                                href={`/city/${cityMatch.slug}`}
                                className="rounded-md border border-flame bg-bone px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-flame transition-colors hover:bg-flame hover:text-white"
                            >
                                All tours in {cityMatch.name} →
                            </Link>
                        )}
                        {categoryMatch && (
                            <Link
                                href={`/category/${categoryMatch.slug}`}
                                className="rounded-md border border-flame bg-bone px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-flame transition-colors hover:bg-flame hover:text-white"
                            >
                                All {categoryMatch.name} tours →
                            </Link>
                        )}
                    </div>
                )}

                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center py-24 text-center">
                        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-line">
                            <Compass className="h-7 w-7 text-flame" />
                        </div>
                        {query.trim() ? (
                            <>
                                <h3 className="font-display text-2xl font-semibold text-ink">No tours match &ldquo;{query}&rdquo;</h3>
                                <p className="mt-2 font-mono text-[12px] uppercase tracking-wide text-stone">Try a different search term</p>
                            </>
                        ) : selectedCategoryName ? (
                            <>
                                <h3 className="font-display text-2xl font-semibold text-ink">No {selectedCategoryName} tours yet</h3>
                                <p className="mt-2 font-mono text-[12px] uppercase tracking-wide text-stone">Try another category</p>
                            </>
                        ) : (
                            <>
                                <h3 className="font-display text-2xl font-semibold text-ink">No tours on the map yet</h3>
                                <p className="mt-2 font-mono text-[12px] uppercase tracking-wide text-stone">New journeys are being charted — check back soon</p>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {visible.map((event) => {
                            const prices = event.ticket_tiers?.map((t) => t.price) || [];
                            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
                            const currency = event.currency || 'cad';
                            const symbol = getCurrencySymbol(currency);

                            const occs = [...(event.event_occurrences || [])].sort(
                                (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
                            );
                            const startAt = occs[0]?.starts_at || event.start_at || undefined;

                            return (
                                <EventCard
                                    key={event.id}
                                    id={event.id}
                                    title={event.title}
                                    slug={event.slug}
                                    coverImageUrl={event.cover_image_url}
                                    venueName={event.venue_name}
                                    city={event.city}
                                    category={event.categories?.name}
                                    startAt={startAt}
                                    timezone={event.timezone}
                                    minPrice={minPrice}
                                    currencySymbol={symbol}
                                    organizerName={event.organizer_name}
                                    organizerAvatarUrl={event.organizer_avatar_url}
                                    coHostCount={event.co_host_count}
                                    entryType={event.entry_type}
                                />
                            );
                        })}
                    </div>
                    {hasMore && (
                        <div className="mt-12 flex justify-center">
                            <button
                                type="button"
                                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                                className="rounded-lg border border-ink px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-ink transition-colors hover:bg-ink hover:text-bone"
                            >
                                Load more tours
                            </button>
                        </div>
                    )}
                    </>
                )}

            </div>
        </div>
    );
}
