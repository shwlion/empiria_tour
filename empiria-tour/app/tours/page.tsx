import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { X } from 'lucide-react';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import TourCard from '@/components/tours/TourCard';
import SearchBar, { type DestinationOption } from '@/components/tours/SearchBar';
import FilterRail, { SortSelect } from '@/components/tours/FilterRail';
import { absoluteUrl } from '@/lib/seo';
import { monthToRange } from '@/lib/months';
import {
    getCategories,
    getCollections,
    getCurrencies,
    getDefaultCurrency,
    getDestinationByPath,
    getDestinationTree,
    searchPackages,
    type DestinationNode,
    type SearchFilters,
} from '@/lib/catalogue';

export const metadata: Metadata = {
    title: 'All tours — Empiria Tours',
    description: 'Search every Empiria trip by destination, month, length and price.',
    alternates: { canonical: '/tours' },
    openGraph: { title: 'All tours — Empiria Tours', url: absoluteUrl('/tours'), type: 'website' },
};

type Params = Record<string, string | undefined>;

function flatten(nodes: DestinationNode[], depth = 0): DestinationOption[] {
    return nodes.flatMap((n) => [
        { path: n.path, name: n.name, depth },
        ...flatten(n.children, depth + 1),
    ]);
}

function toFilters(p: Params): SearchFilters {
    const [minD, maxD] = (p.duration ?? '').split('-').map((n) => Number(n) || undefined);
    return {
        destinationPath: p.destination || undefined,
        categorySlug: p.category || undefined,
        collectionSlug: p.collection || undefined,
        travellers: p.travellers ? Number(p.travellers) : undefined,
        minDurationDays: minD,
        maxDurationDays: maxD,
        maxPriceCents: p.maxPrice ? Number(p.maxPrice) * 100 : undefined,
        query: p.q || undefined,
        sort: (p.sort as SearchFilters['sort']) || 'popularity',
        page: p.page ? Number(p.page) : 1,
        perPage: 12,
        ...monthToRange(p.month),
    };
}

/** Removable chips for whatever is currently narrowing the results. */
function ActiveFilters({ params, labels }: { params: Params; labels: Record<string, string> }) {
    const shown = Object.entries(params).filter(
        ([k, v]) => v && !['sort', 'page', 'currency'].includes(k)
    );
    if (shown.length === 0) return null;

    const without = (key: string) => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v && k !== key) next.set(k, v);
        return `/tours${next.toString() ? `?${next}` : ''}`;
    };

    return (
        <div className="mb-6 flex flex-wrap items-center gap-2">
            {shown.map(([k, v]) => (
                <Link
                    key={k}
                    href={without(k)}
                    className="group flex items-center gap-1.5 rounded-chip border border-line bg-bone py-1.5 pl-3 pr-2 font-mono text-[11px] uppercase tracking-label text-ink transition-colors hover:border-flame hover:text-flame"
                >
                    {labels[`${k}:${v}`] ?? labels[k] ?? v}
                    <X className="h-3.5 w-3.5 text-stone transition-colors group-hover:text-flame" aria-hidden="true" />
                    <span className="sr-only">Remove filter</span>
                </Link>
            ))}
            <Link href="/tours" className="ml-1 font-mono text-[10px] uppercase tracking-label text-stone underline-offset-4 hover:text-flame hover:underline">
                Clear all
            </Link>
        </div>
    );
}

export default async function ToursPage({
    searchParams,
}: {
    searchParams: Promise<Params>;
}) {
    const params = await searchParams;

    const defaultCurrency = await getDefaultCurrency();
    const currency = params.currency?.toUpperCase() ?? defaultCurrency;
    const filters = toFilters(params);

    const [results, categories, collections, tree, currencies, destination] = await Promise.all([
        searchPackages(filters, currency),
        getCategories(),
        getCollections(),
        getDestinationTree(),
        getCurrencies(),
        params.destination ? getDestinationByPath(params.destination) : Promise.resolve(null),
    ]);

    const destinationOptions = flatten(tree);
    const symbol = currencies.find((c) => c.code === currency)?.symbol ?? '$';

    // Human labels for the chips, so a chip reads "Greece" not "greece/cyclades".
    const labels: Record<string, string> = {
        ...Object.fromEntries(destinationOptions.map((d) => [`destination:${d.path}`, d.name])),
        ...Object.fromEntries(categories.map((c) => [`category:${c.slug}`, c.name])),
        ...Object.fromEntries(collections.map((c) => [`collection:${c.slug}`, c.name])),
        ...(params.month
            ? {
                  [`month:${params.month}`]: new Date(`${params.month}-01T00:00:00Z`).toLocaleDateString(
                      'en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
              }
            : {}),
        ...(params.travellers ? { [`travellers:${params.travellers}`]: `${params.travellers} travellers` } : {}),
        ...(params.maxPrice ? { [`maxPrice:${params.maxPrice}`]: `Under ${symbol}${Number(params.maxPrice).toLocaleString()}` } : {}),
        ...(params.duration ? { [`duration:${params.duration}`]: `${params.duration.replace('-', '–')} days` } : {}),
        ...(params.q ? { [`q:${params.q}`]: `“${params.q}”` } : {}),
    };

    const totalPages = Math.max(1, Math.ceil(results.total / results.perPage));
    const pageHref = (n: number) => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v && k !== 'page') next.set(k, v);
        if (n > 1) next.set('page', String(n));
        return `/tours${next.toString() ? `?${next}` : ''}`;
    };

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar currency={currency} />

            <section className="mx-auto w-full max-w-6xl px-5 pt-8">
                <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]">
                    {destination ? destination.name : 'Every trip we run'}
                </h1>
                {destination?.description && (
                    <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-stone">
                        {destination.description}
                    </p>
                )}
                <div className="mt-6">
                    <Suspense fallback={<div className="h-20" />}>
                        <SearchBar
                            compact
                            destinations={destinationOptions}
                            initial={{
                                destination: params.destination,
                                month: params.month,
                                travellers: params.travellers ? Number(params.travellers) : 2,
                            }}
                        />
                    </Suspense>
                </div>
            </section>

            <section className="mx-auto w-full max-w-6xl px-5 py-10">
                <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
                    <aside className="lg:sticky lg:top-28 lg:self-start">
                        <Suspense fallback={<div className="h-96" />}>
                            <FilterRail
                                destinations={destinationOptions}
                                categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
                                collections={collections.map((c) => ({ slug: c.slug, name: c.name }))}
                                currencySymbol={symbol}
                            />
                        </Suspense>
                    </aside>

                    <div>
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                            <p className="font-mono text-[11px] uppercase tracking-label text-stone">
                                {results.total} {results.total === 1 ? 'trip' : 'trips'}
                                {results.total > results.perPage && (
                                    <> · page {results.page} of {totalPages}</>
                                )}
                            </p>
                            <Suspense fallback={null}>
                                <SortSelect />
                            </Suspense>
                        </div>

                        <ActiveFilters params={params} labels={labels} />

                        {results.packages.length > 0 ? (
                            <>
                                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                                    {results.packages.map((p, i) => (
                                        <TourCard key={p.id} pkg={p} priority={i < 3} />
                                    ))}
                                </div>

                                {totalPages > 1 && (
                                    <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                                            <Link
                                                key={n}
                                                href={pageHref(n)}
                                                aria-current={n === results.page ? 'page' : undefined}
                                                className={`min-w-10 rounded-chip border px-3 py-2 text-center font-mono text-[12px] transition-colors ${
                                                    n === results.page
                                                        ? 'border-ink bg-ink text-bone'
                                                        : 'border-line bg-bone text-ink hover:border-flame hover:text-flame'
                                                }`}
                                            >
                                                {n}
                                            </Link>
                                        ))}
                                    </nav>
                                )}
                            </>
                        ) : (
                            /* A3: empty state with suggested alternatives, not a dead end. */
                            <div className="rounded-card border border-dashed border-line bg-bone p-10 text-center">
                                <p className="font-display text-[21px] font-semibold text-ink">Nothing matches all of that</p>
                                <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-stone">
                                    Departures are fixed dates, so narrowing by month and party size together
                                    can rule everything out. Try widening one of them.
                                </p>
                                <div className="mt-6 flex flex-wrap justify-center gap-2">
                                    {params.month && (
                                        <Link href={pageHref(1).replace(/[?&]month=[^&]*/, '')} className="rounded-chip border border-line bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-label transition-colors hover:border-flame hover:text-flame">
                                            Any month
                                        </Link>
                                    )}
                                    {params.destination && (
                                        <Link href="/tours" className="rounded-chip border border-line bg-paper px-4 py-2 font-mono text-[11px] uppercase tracking-label transition-colors hover:border-flame hover:text-flame">
                                            Anywhere
                                        </Link>
                                    )}
                                    <Link href="/tours" className="rounded-field bg-flame px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember">
                                        Show everything
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
