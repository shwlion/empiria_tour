import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Clock, Search, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import TourCard from '@/components/tours/TourCard';
import EventsSpotlight from '@/components/home/EventsSpotlight';
import { getUpcomingEvents } from '@/lib/events';
import HomeHero from '@/components/home/HomeHero';
import HeroIntro from '@/components/home/HeroIntro';
import Reveal from '@/components/home/Reveal';
import { type DestinationOption } from '@/components/tours/SearchBar';
import { absoluteUrl } from '@/lib/seo';
import { formatPrice } from '@/lib/money';
import { monthToRange } from '@/lib/months';
import {
    getCategories,
    getCollections,
    getDefaultCurrency,
    getDepartureMonths,
    getDestinationTiles,
    getDestinationTree,
    getDisclosures,
    getFeaturedPackages,
    getPlatformSettings,
    getShowcaseCards,
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
        <div data-reveal className="mb-6 flex items-end justify-between gap-6">
            <div>
                <p className="font-mono text-[12px] font-medium uppercase tracking-label text-ember">{eyebrow}</p>
                <h2 className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">
                    {title}
                </h2>
            </div>
            {href && (
                <Link
                    href={href}
                    className="hidden shrink-0 items-center gap-1.5 font-mono text-[13px] font-medium text-stone transition-colors hover:text-ember sm:flex"
                >
                    {linkLabel ?? 'See all'}
                    <span className="arrow"><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
                </Link>
            )}
        </div>
    );
}

/** A pill chip link — category, collection, active filter. */
function Chip({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className={`flex min-h-[44px] shrink-0 items-center rounded-chip border px-5 py-2.5 font-mono text-[13px] font-medium transition-colors ${
                active
                    ? 'border-ember bg-ember text-white'
                    : 'border-line bg-white text-ink hover:border-ember hover:text-ember'
            }`}
        >
            {children}
        </Link>
    );
}

/**
 * The three steps, in plain words. The hold length comes from settings, so
 * the page never promises a window the database no longer gives.
 */
function HowBookingWorks({ holdMinutes }: { holdMinutes: number }) {
    const steps = [
        {
            icon: Search,
            step: 'Step 1',
            title: 'Find your departure',
            body: 'Search by place, month and party size. Real dates, all-in prices, and how many seats are left.',
        },
        {
            icon: Clock,
            step: 'Step 2',
            title: 'Hold your seats',
            body: `Your places are held for ${holdMinutes} minutes while you fill in who is travelling. The terms are shown before you agree, not after.`,
        },
        {
            icon: ShieldCheck,
            step: 'Step 3',
            title: 'Pay with confidence',
            body: 'Pay a deposit or in full through Stripe, get a reference, and manage the booking any time after.',
        },
    ];
    return (
        <section className="mx-auto w-full max-w-6xl px-5 py-16">
            <SectionHead eyebrow="Simple & safe" title="How booking works" />
            <div className="relative" data-draw>
                {/* The dashed line draws itself between the steps as they arrive. */}
                <svg className="steps-line hidden sm:block" viewBox="0 0 1000 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <path className="draw-base" d="M0 4 H1000" pathLength={1} vectorEffect="non-scaling-stroke" />
                    <path className="draw-mask" d="M0 4 H1000" pathLength={1} vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="relative grid gap-6 sm:grid-cols-3" data-stagger>
                    {steps.map((s) => (
                        <div key={s.step} data-reveal className="rounded-card border border-line bg-white p-6">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ember/10 text-ember">
                                <s.icon className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <p className="mt-4 font-mono text-[12px] font-medium text-[#c9a92a]">{s.step}</p>
                            <h3 className="mt-1 font-display text-[19px] font-bold tracking-tight text-ink">{s.title}</h3>
                            <p className="mt-2 text-[14px] leading-relaxed text-stone">{s.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export default async function TourHome({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; currency?: string; month?: string }>;
}) {
    const { category: activeCategory, currency: currencyParam, month } = await searchParams;

    const defaultCurrency = await getDefaultCurrency();
    const currency = currencyParam?.toUpperCase() ?? defaultCurrency;

    // The strip offers only months something actually departs in, so every
    // chip leads to trips. See getDepartureMonths.
    const months = await getDepartureMonths();
    const activeMonth = months.find((m) => m.value === month) ?? null;

    // Everything degrades to empty when Supabase is unset, so the shell still renders.
    const [featured, results, categories, collections, tree, tiles, settings, footerNotices, showcase, events] =
        await Promise.all([
            getFeaturedPackages(currency, 6),
            searchPackages(
                { categorySlug: activeCategory, sort: 'popularity', perPage: 24, ...monthToRange(activeMonth?.value) },
                currency
            ),
            getCategories(),
            getCollections(),
            getDestinationTree(),
            getDestinationTiles(currency, 6),
            getPlatformSettings(),
            getDisclosures('footer'),
            getShowcaseCards(),
            // The sister product's public API; empty if it is unreachable.
            getUpcomingEvents(6),
        ]);

    const destinationOptions = flatten(tree);
    const hasCatalogue = results.total > 0 || featured.length > 0;
    const catalogueTitle = activeCategory
        ? categories.find((c) => c.slug === activeCategory)?.name ?? 'Tours'
        : activeMonth
          ? `Departing in ${activeMonth.label}`
          : 'The whole catalogue';

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar tone="light" currency={currency} />

            {/* ── Hero: headline and search beside the postcard deck ──────────── */}
            <HomeHero
                cards={showcase}
                intro={
                    <HeroIntro
                        destinations={destinationOptions}
                        months={months}
                        seller={{
                            name: settings?.company_name ?? null,
                            registrationNumber: settings?.registration_number ?? null,
                        }}
                    />
                }
            />

            {/* ── Featured ─────────────────────────────────────────────────── */}
            {featured.length > 0 && (
                <section className="mx-auto w-full max-w-6xl px-5 py-16">
                    <SectionHead
                        eyebrow="Chosen by us"
                        title="Where we would go first"
                        href="/tours"
                        linkLabel="All tours"
                    />
                    {/* A plain grid, like every other card row on this page. This
                        was a pinned horizontal gallery; the sideways scroll was
                        removed at the client's request. */}
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
                        {featured.map((p, i) => (
                            <div key={p.id} data-reveal className="h-full">
                                <TourCard pkg={p} priority={i < 3} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Destinations ─────────────────────────────────────────────── */}
            {tiles.length > 0 && (
                <section className="mx-auto w-full max-w-6xl px-5 py-16">
                    <div className="mb-10 h-px w-full bg-sand" aria-hidden="true" />
                    <SectionHead eyebrow="By place" title="Start with somewhere" />
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
                        {tiles.map((d) => (
                            <div key={d.id} data-reveal className="h-full">
                                <Link
                                    href={`/tours?destination=${encodeURIComponent(d.path)}`}
                                    className="group card-hover flex h-full flex-col overflow-hidden rounded-card border border-line bg-bone shadow-lift-card"
                                >
                                    <div className="relative aspect-[3/2] w-full overflow-hidden">
                                        {d.heroImage ? (
                                            <Image
                                                src={d.heroImage}
                                                alt=""
                                                fill
                                                sizes="(max-width: 640px) 100vw, 33vw"
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="img-fallback h-full w-full" />
                                        )}
                                        <div className="cap absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-5">
                                            <h3 className="font-display text-[22px] font-bold tracking-tight text-white">
                                                {d.name}
                                            </h3>
                                            <p className="font-mono text-[11px] uppercase tracking-label text-white/80">
                                                <span data-count={d.packageCount}>{d.packageCount}</span>{' '}
                                                {d.packageCount === 1 ? 'trip' : 'trips'}
                                                {d.fromPriceCents != null && (
                                                    <> · from {formatPrice(d.fromPriceCents, currency)}</>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    {d.description && (
                                        <p className="line-clamp-2 p-5 text-[14px] leading-relaxed text-stone">
                                            {d.description}
                                        </p>
                                    )}
                                </Link>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Collections ──────────────────────────────────────────────── */}
            {collections.length > 0 && (
                <section className="mx-auto w-full max-w-6xl px-5">
                    <div data-reveal className="flex flex-wrap gap-2">
                        {collections.map((c) => (
                            <Chip key={c.id} href={`/tours?collection=${c.slug}`}>{c.name}</Chip>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Everything, filtered by category or month ────────────────── */}
            <section id="tours" className="mx-auto w-full max-w-6xl px-5 py-16">
                <SectionHead
                    eyebrow={activeCategory || activeMonth ? 'Filtered' : 'Everything'}
                    title={catalogueTitle}
                    href="/tours"
                    linkLabel="Search and filter"
                />

                {categories.length > 0 && (
                    <div data-reveal className="rail mb-7 -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
                        <Chip href={activeMonth ? `/?month=${activeMonth.value}#tours` : '/#tours'} active={!activeCategory}>All</Chip>
                        {categories.map((c) => (
                            <Chip
                                key={c.id}
                                href={`/?category=${c.slug}${activeMonth ? `&month=${activeMonth.value}` : ''}#tours`}
                                active={activeCategory === c.slug}
                            >
                                {c.name}
                            </Chip>
                        ))}
                    </div>
                )}

                {results.packages.length > 0 ? (
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
                        {results.packages.map((p) => (
                            <div key={p.id} data-reveal className="h-full">
                                <TourCard pkg={p} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div data-reveal className="rounded-card border border-dashed border-line bg-bone p-10 text-center">
                        <p className="font-display text-[20px] font-semibold text-ink">
                            {activeMonth
                                ? `Nothing departs in ${activeMonth.label}`
                                : hasCatalogue ? 'Nothing in that category yet' : 'The catalogue is on its way'}
                        </p>
                        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-stone">
                            {activeMonth
                                ? 'Departures are fixed dates. Try the months either side, or any month.'
                                : hasCatalogue
                                  ? 'Try another category, or browse everything.'
                                  : 'Trips are being added now. Check back shortly.'}
                        </p>
                        <Link
                            href={activeMonth ? '/#tours' : '/tours'}
                            className="mt-5 inline-flex min-h-[44px] items-center rounded-full bg-flame px-6 py-2.5 font-mono text-[13px] font-semibold text-white transition-colors hover:bg-ember"
                        >
                            {activeMonth ? 'Any month' : 'Browse everything'}
                        </Link>
                    </div>
                )}
            </section>

            <HowBookingWorks holdMinutes={settings?.hold_minutes ?? 20} />

            {/* ── Empiria Events (A2: promotional placement) ───────────────── */}
            <EventsSpotlight events={events} />

            {/* ── Trust band (A2) ──────────────────────────────────────────── */}
            <section className="mx-auto w-full max-w-6xl px-5">
                <div data-reveal className="grid gap-8 rounded-card border border-line bg-sand/40 px-8 py-10 sm:grid-cols-3">
                    <div>
                        <ShieldCheck className="h-6 w-6 text-ember" aria-hidden="true" />
                        <h3 className="mt-3 font-display text-[18px] font-bold tracking-tight text-ink">
                            Registered and accountable
                        </h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                            {settings?.company_name ?? 'Empiria'}
                            {settings?.registration_number
                                ? ` · Registration ${settings.registration_number}`
                                : ''}
                            {settings?.statutory_notice ? ` — ${settings.statutory_notice}` : ''}
                        </p>
                    </div>
                    <div>
                        <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">All-in pricing</h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                            Taxes and fees are broken out before you pay. The number you agree to is the
                            number charged.
                        </p>
                    </div>
                    <div>
                        <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">Talk to a person</h3>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-stone">
                            {settings?.contact_email ?? 'Contact details to follow.'}
                            {settings?.contact_phone ? ` · ${settings.contact_phone}` : ''}
                        </p>
                    </div>
                </div>

                {footerNotices.length > 0 && (
                    <div className="mx-auto w-full max-w-6xl px-1 pt-8">
                        {footerNotices.map((n) => (
                            <p key={n.id} className="text-[12.5px] leading-relaxed text-stone">
                                {n.body}
                            </p>
                        ))}
                    </div>
                )}
            </section>

            <Footer />
            <Reveal />
        </div>
    );
}
