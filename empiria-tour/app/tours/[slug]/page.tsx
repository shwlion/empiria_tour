import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Check, Clock, MapPin, Minus, Users, AlertTriangle } from 'lucide-react';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import PricePanel from '@/components/tours/PricePanel';
import { absoluteUrl } from '@/lib/seo';
import { formatPrice } from '@/lib/money';
import { getDefaultCurrency, getDisclosures, getPackageBySlug } from '@/lib/catalogue';

type Props = {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ currency?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const currency = await getDefaultCurrency();
    const pkg = await getPackageBySlug(slug, currency);
    if (!pkg) return { title: 'Tour not found — Empiria Tours' };

    const title = `${pkg.title} — Empiria Tours`;
    const description = pkg.summary ?? undefined;
    return {
        title,
        description,
        alternates: { canonical: `/tours/${pkg.slug}` },
        openGraph: {
            title,
            description,
            url: absoluteUrl(`/tours/${pkg.slug}`),
            type: 'website',
            images: pkg.heroImage ? [{ url: pkg.heroImage }] : undefined,
        },
    };
}

export default async function TourDetail({ params, searchParams }: Props) {
    const { slug } = await params;
    const { currency: currencyParam } = await searchParams;

    const defaultCurrency = await getDefaultCurrency();
    const currency = currencyParam?.toUpperCase() ?? defaultCurrency;

    const pkg = await getPackageBySlug(slug, currency);
    if (!pkg) notFound();

    const notices = await getDisclosures('package_page', pkg.id);
    const facts = [
        pkg.durationLabel && { icon: Clock, label: 'Length', value: pkg.durationLabel },
        pkg.destination && { icon: MapPin, label: 'Where', value: pkg.destination.name },
        pkg.physicalRating && { icon: Users, label: 'Effort', value: pkg.physicalRating },
        pkg.minimumAge != null && pkg.minimumAge > 0
            ? { icon: AlertTriangle, label: 'Minimum age', value: `${pkg.minimumAge}` }
            : null,
    ].filter(Boolean) as { icon: typeof Clock; label: string; value: string }[];

    // A4 wants structured data for packages (Part F, SEO).
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'TouristTrip',
        name: pkg.title,
        description: pkg.summary ?? undefined,
        url: absoluteUrl(`/tours/${pkg.slug}`),
        image: pkg.heroImage ?? undefined,
        touristType: pkg.category?.name,
        offers: pkg.fromPriceCents != null && {
            '@type': 'Offer',
            price: (pkg.fromPriceCents / 100).toFixed(2),
            priceCurrency: pkg.currency,
            availability: pkg.bookableDepartures > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/SoldOut',
        },
        itinerary: pkg.itinerary.length > 0 && {
            '@type': 'ItemList',
            numberOfItems: pkg.itinerary.length,
            itemListElement: pkg.itinerary.map((d) => ({
                '@type': 'ListItem', position: d.position, name: d.title,
            })),
        },
    };

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar currency={currency} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="mx-auto w-full max-w-6xl px-5 pt-8">
                <nav aria-label="Breadcrumb" className="mb-4 font-mono text-[10px] uppercase tracking-label text-stone">
                    <Link href="/tours" className="hover:text-flame">Tours</Link>
                    {pkg.destination && (
                        <>
                            <span className="mx-2" aria-hidden="true">/</span>
                            <Link
                                href={`/tours?destination=${encodeURIComponent(pkg.destination.path)}`}
                                className="hover:text-flame"
                            >
                                {pkg.destination.name}
                            </Link>
                        </>
                    )}
                </nav>

                <h1 className="max-w-3xl font-display text-[32px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[44px]">
                    {pkg.title}
                </h1>
                {pkg.summary && (
                    <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-stone">{pkg.summary}</p>
                )}

                <div className="relative mt-7 aspect-[21/9] w-full overflow-hidden rounded-card">
                    {pkg.heroImage ? (
                        <Image src={pkg.heroImage} alt="" fill priority sizes="100vw" className="object-cover" />
                    ) : (
                        <div className="img-fallback h-full w-full" />
                    )}
                </div>

                {pkg.gallery.length > 0 && (
                    <div className="rail mt-3 flex gap-3 overflow-x-auto pb-1">
                        {pkg.gallery.map((src, i) => (
                            <div key={i} className="relative h-24 w-36 shrink-0 overflow-hidden rounded-field">
                                <Image src={src} alt="" fill sizes="144px" className="object-cover" />
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Body + price panel ───────────────────────────────────────── */}
            <section className="mx-auto w-full max-w-6xl px-5 py-12">
                <div className="grid gap-12 lg:grid-cols-[1fr_360px]">
                    <div className="min-w-0">
                        {facts.length > 0 && (
                            <dl className="mb-10 grid grid-cols-2 gap-5 border-y border-line py-6 sm:grid-cols-4">
                                {facts.map((f) => (
                                    <div key={f.label}>
                                        <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-stone">
                                            <f.icon className="h-3.5 w-3.5" aria-hidden="true" />
                                            {f.label}
                                        </dt>
                                        <dd className="mt-1.5 text-[15px] text-ink">{f.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}

                        {pkg.overview && (
                            <div className="mb-12">
                                <h2 className="font-display text-[24px] font-semibold tracking-tight text-ink">About this trip</h2>
                                <p className="mt-4 whitespace-pre-line text-[16px] leading-relaxed text-stone">
                                    {pkg.overview}
                                </p>
                            </div>
                        )}

                        {pkg.itinerary.length > 0 && (
                            <div className="mb-12">
                                <h2 className="font-display text-[24px] font-semibold tracking-tight text-ink">Day by day</h2>
                                <ol className="mt-6 flex flex-col">
                                    {pkg.itinerary.map((d, i) => (
                                        <li key={d.position} className="relative flex gap-5 pb-8 last:pb-0">
                                            {i < pkg.itinerary.length - 1 && (
                                                <span
                                                    className="absolute left-[15px] top-9 h-full w-px bg-line"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-chip bg-ink font-mono text-[11px] text-bone">
                                                {d.position}
                                            </span>
                                            <div className="min-w-0 flex-1 pt-0.5">
                                                <h3 className="font-display text-[17px] font-semibold text-ink">{d.title}</h3>
                                                {d.description && (
                                                    <p className="mt-1.5 text-[15px] leading-relaxed text-stone">
                                                        {d.description}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}

                        {(pkg.included.length > 0 || pkg.excluded.length > 0) && (
                            <div className="mb-12 grid gap-8 sm:grid-cols-2">
                                {pkg.included.length > 0 && (
                                    <div>
                                        <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">What&rsquo;s included</h2>
                                        <ul className="mt-4 flex flex-col gap-2.5">
                                            {pkg.included.map((t, i) => (
                                                <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-stone">
                                                    <Check className="mt-1 h-4 w-4 shrink-0 text-flame" aria-hidden="true" />
                                                    {t}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {pkg.excluded.length > 0 && (
                                    <div>
                                        <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">Not included</h2>
                                        <ul className="mt-4 flex flex-col gap-2.5">
                                            {pkg.excluded.map((t, i) => (
                                                <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-stone">
                                                    <Minus className="mt-1 h-4 w-4 shrink-0 text-stone/60" aria-hidden="true" />
                                                    {t}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {pkg.roomTypes.length > 0 && (
                            <div className="mb-12">
                                <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">Where you stay</h2>
                                <ul className="mt-4 flex flex-col gap-3">
                                    {pkg.roomTypes.map((r) => (
                                        <li key={r.id} className="flex items-start justify-between gap-4 rounded-field border border-line bg-bone p-4">
                                            <span>
                                                <span className="block text-[15px] text-ink">{r.name}</span>
                                                {r.description && (
                                                    <span className="block text-[13.5px] leading-snug text-stone">{r.description}</span>
                                                )}
                                            </span>
                                            <span className="shrink-0 text-[13.5px] text-stone">
                                                {r.priceAdjustmentCents === 0
                                                    ? 'Included'
                                                    : `+${formatPrice(r.priceAdjustmentCents, pkg.currency)} pp`}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(pkg.meetingPoint || pkg.whatToBring) && (
                            <div className="mb-12">
                                <h2 className="font-display text-[19px] font-semibold tracking-tight text-ink">Practical information</h2>
                                <dl className="mt-4 flex flex-col gap-4">
                                    {pkg.meetingPoint && (
                                        <div>
                                            <dt className="font-mono text-[10px] uppercase tracking-label text-stone">Meeting point</dt>
                                            <dd className="mt-1 text-[15px] text-ink">{pkg.meetingPoint}</dd>
                                        </div>
                                    )}
                                    {pkg.whatToBring && (
                                        <div>
                                            <dt className="font-mono text-[10px] uppercase tracking-label text-stone">What to bring</dt>
                                            <dd className="mt-1 text-[15px] leading-relaxed text-ink">{pkg.whatToBring}</dd>
                                        </div>
                                    )}
                                </dl>
                            </div>
                        )}

                        {/* Part D: point-of-sale disclosure and the cancellation terms. */}
                        {(notices.length > 0 || pkg.cancellationPolicy) && (
                            <div className="rounded-card border border-line bg-bone p-6">
                                {pkg.cancellationPolicy && (
                                    <>
                                        <h2 className="font-display text-[17px] font-semibold text-ink">
                                            {pkg.cancellationPolicy.name}
                                        </h2>
                                        <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-stone">
                                            {pkg.cancellationPolicy.body}
                                        </p>
                                    </>
                                )}
                                {notices.map((n) => (
                                    <p key={n.id} className="mt-4 text-[13px] leading-relaxed text-stone">
                                        {n.body}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>

                    <aside className="lg:sticky lg:top-28 lg:self-start">
                        <PricePanel pkg={pkg} />
                    </aside>
                </div>
            </section>

            <Footer />
        </div>
    );
}
