import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck } from 'lucide-react';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import TourCard from '@/components/tours/TourCard';
import SearchPill, { type DestinationOption } from '@/components/tours/SearchPill';
import { absoluteUrl } from '@/lib/seo';
import { formatPrice } from '@/lib/money';
import {
    getCategories,
    getCollections,
    getDefaultCurrency,
    getDestinationTiles,
    getDestinationTree,
    getDisclosures,
    getFeaturedPackages,
    getPlatformSettings,
    searchPackages,
    type DestinationNode,
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

/** Flatten the destination tree into an indented list for the Where select. */
function flatten(nodes: DestinationNode[], depth = 0): DestinationOption[] {
    return nodes.flatMap((n) => [
        { path: n.path, name: n.name, depth },
        ...flatten(n.children, depth + 1),
    ]);
}

function SectionHead({
    eyebrow, title, href, linkLabel,
}: { eyebrow: string; title: string; href?: string; linkLabel?: string }) {
    return (
        <div className="mb-6 flex items-end justify-between gap-6">
            <div>
                <p className="font-mono text-[10px] uppercase tracking-label text-flame">{eyebrow}</p>
                <h2 className="mt-2 font-display text-[26px] leading-tight text-ink sm:text-[30px]">{title}</h2>
            </div>
            {href && (
                <Link
                    href={href}
                    className="hidden shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-stone transition-colors hover:text-flame sm:flex"
                >
                    {linkLabel ?? 'See all'}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
            )}
        </div>
    );
}

export default async function TourHome({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; currency?: string }>;
}) {
    const { category: activeCategory, currency: currencyParam } = await searchParams;

    const defaultCurrency = await getDefaultCurrency();
    const currency = currencyParam?.toUpperCase() ?? defaultCurrency;

    // Everything degrades to empty when Supabase is unset, so the shell still renders.
    const [featured, results, categories, collections, tree, tiles, settings, footerNotices] =
        await Promise.all([
            getFeaturedPackages(currency, 6),
            searchPackages({ categorySlug: activeCategory, sort: 'popularity', perPage: 24 }, currency),
            getCategories(),
            getCollections(),
            getDestinationTree(),
            getDestinationTiles(currency, 6),
            getPlatformSettings(),
            getDisclosures('footer'),
        ]);

    const destinationOptions = flatten(tree);
    const hasCatalogue = results.total > 0 || featured.length > 0;

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar />

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="mx-auto w-full max-w-6xl px-5 pb-4 pt-10 sm:pt-16">
                <div className="max-w-2xl">
                    <p className="font-mono text-[10px] uppercase tracking-label text-flame">
                        Small groups · Real departures
                    </p>
                    <h1 className="mt-4 font-display text-[38px] leading-[1.05] tracking-tight text-ink sm:text-[54px]">
                        Trips that are worth
                        <br />
                        the time off.
                    </h1>
                    <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-stone">
                        Guided journeys through Greece, Italy and beyond — sixteen travellers at most,
                        prices shown all in, and every departure date real rather than indicative.
                    </p>
                </div>

                <div className="route-rule mt-8 h-px w-full opacity-60" aria-hidden="true" />

                <div className="mt-8">
                    <SearchPill destinations={destinationOptions} />
                </div>
            </section>

            {/* ── Featured ─────────────────────────────────────────────────── */}
            {featured.length > 0 && (
                <section className="mx-auto w-full max-w-6xl px-5 py-14">
                    <SectionHead
                        eyebrow="Chosen by us"
                        title="Where we would go first"
                        href="/tours"
                        linkLabel="All tours"
                    />
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {featured.map((p, i) => (
                            <TourCard key={p.id} pkg={p} priority={i < 3} />
                        ))}
                    </div>
                </section>
            )}

            {/* ── Destinations ─────────────────────────────────────────────── */}
            {tiles.length > 0 && (
                <section className="mx-auto w-full max-w-6xl px-5 py-14">
                    <SectionHead eyebrow="By place" title="Start with somewhere" />
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {tiles.map((d) => (
                            <Link
                                key={d.id}
                                href={`/tours?destination=${encodeURIComponent(d.path)}`}
                                className="group card-lift overflow-hidden rounded-card bg-bone ring-1 ring-line"
                            >
                                <div className="relative aspect-[16/10] w-full overflow-hidden">
                                    {d.heroImage ? (
                                        <Image
                                            src={d.heroImage}
                                            alt=""
                                            fill
                                            sizes="(max-width: 640px) 100vw, 33vw"
                                            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                        />
                                    ) : (
                                        <div className="img-fallback h-full w-full" />
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4">
                                        <h3 className="font-display text-[20px] text-bone">{d.name}</h3>
                                        <p className="font-mono text-[10px] uppercase tracking-label text-bone/70">
                                            {d.packageCount} {d.packageCount === 1 ? 'trip' : 'trips'}
                                            {d.fromPriceCents != null && (
                                                <> · from {formatPrice(d.fromPriceCents, currency)}</>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {d.description && (
                                    <p className="line-clamp-2 p-4 text-[14px] leading-relaxed text-stone">
                                        {d.description}
                                    </p>
                                )}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Collections ──────────────────────────────────────────────── */}
            {collections.length > 0 && (
                <section className="mx-auto w-full max-w-6xl px-5 py-6">
                    <div className="flex flex-wrap gap-3">
                        {collections.map((c) => (
                            <Link
                                key={c.id}
                                href={`/tours?collection=${c.slug}`}
                                className="rounded-full border border-line bg-bone px-4 py-2 text-[14px] text-ink transition-colors hover:border-flame hover:text-flame"
                            >
                                {c.name}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Everything, filtered by category ─────────────────────────── */}
            <section id="tours" className="mx-auto w-full max-w-6xl px-5 py-14">
                <SectionHead
                    eyebrow={activeCategory ? 'Filtered' : 'Everything'}
                    title={activeCategory
                        ? categories.find((c) => c.slug === activeCategory)?.name ?? 'Tours'
                        : 'The whole catalogue'}
                    href="/tours"
                    linkLabel="Search and filter"
                />

                {categories.length > 0 && (
                    <div className="rail mb-7 -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                        <Link
                            href="/#tours"
                            className={`shrink-0 rounded-full border px-4 py-2 text-[14px] transition-colors ${
                                !activeCategory
                                    ? 'border-ink bg-ink text-bone'
                                    : 'border-line bg-bone text-ink hover:border-flame hover:text-flame'
                            }`}
                        >
                            All
                        </Link>
                        {categories.map((c) => (
                            <Link
                                key={c.id}
                                href={`/?category=${c.slug}#tours`}
                                className={`shrink-0 rounded-full border px-4 py-2 text-[14px] transition-colors ${
                                    activeCategory === c.slug
                                        ? 'border-ink bg-ink text-bone'
                                        : 'border-line bg-bone text-ink hover:border-flame hover:text-flame'
                                }`}
                            >
                                {c.name}
                            </Link>
                        ))}
                    </div>
                )}

                {results.packages.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {results.packages.map((p) => (
                            <TourCard key={p.id} pkg={p} />
                        ))}
                    </div>
                ) : (
                    <div className="rounded-card border border-dashed border-line bg-bone p-10 text-center">
                        <p className="font-display text-[20px] text-ink">
                            {hasCatalogue ? 'Nothing in that category yet' : 'The catalogue is on its way'}
                        </p>
                        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-stone">
                            {hasCatalogue
                                ? 'Try another category, or browse everything.'
                                : 'Trips are being added now. Check back shortly.'}
                        </p>
                        <Link
                            href="/tours"
                            className="mt-5 inline-block rounded-full bg-flame px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
                        >
                            Browse everything
                        </Link>
                    </div>
                )}
            </section>

            {/* ── Trust band (A2) ──────────────────────────────────────────── */}
            <section className="border-y border-line bg-bone">
                <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:grid-cols-3">
                    <div>
                        <ShieldCheck className="h-5 w-5 text-flame" aria-hidden="true" />
                        <h3 className="mt-3 font-display text-[17px] text-ink">Registered and accountable</h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                            {settings?.company_name ?? 'Empiria'}
                            {settings?.registration_number
                                ? ` · Registration ${settings.registration_number}`
                                : ''}
                            {settings?.statutory_notice ? ` — ${settings.statutory_notice}` : ''}
                        </p>
                    </div>
                    <div>
                        <h3 className="font-display text-[17px] text-ink">All-in pricing</h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                            Taxes and fees are broken out before you pay. The number you agree to is the
                            number charged.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-display text-[17px] text-ink">Talk to a person</h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                            {settings?.contact_email ?? 'Contact details to follow.'}
                            {settings?.contact_phone ? ` · ${settings.contact_phone}` : ''}
                        </p>
                    </div>
                </div>

                {footerNotices.length > 0 && (
                    <div className="mx-auto w-full max-w-6xl px-5 pb-10">
                        {footerNotices.map((n) => (
                            <p key={n.id} className="text-[12.5px] leading-relaxed text-stone">
                                {n.body}
                            </p>
                        ))}
                    </div>
                )}
            </section>

            <Footer />
        </div>
    );
}
