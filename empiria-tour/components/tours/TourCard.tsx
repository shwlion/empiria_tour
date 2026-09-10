import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock, CalendarDays, ArrowRight } from 'lucide-react';
import { formatPrice, formatDepartureDate } from '@/lib/money';
import type { PackageCard } from '@/lib/catalogue';

/**
 * A tour card — a drawn box, not a floating pill.
 *
 * Structure follows the Airbnb pattern (image up top, facts beneath, price on
 * the baseline). Surface and motion are the field-guide identity, carried over
 * from the original EventCard: hairline border, squared corners, and on hover
 * the whole box rises 4px, its border lights to flame, and a deep soft shadow
 * appears underneath. The image pushes to 105% behind it.
 *
 * What changed from EventCard is the CONTENT, not the styling. That card was
 * built around a single instant — a date box with a clock time, a ticket price,
 * an organizer. A tour has a duration and a next departure instead.
 */
export default function TourCard({
  pkg,
  priority = false,
}: {
  pkg: PackageCard;
  priority?: boolean;
}) {
  const soldOut = pkg.bookableDepartures === 0;

  return (
    <Link href={`/tours/${pkg.slug}`} className="group block h-full">
      <article className="card-hover flex h-full flex-col overflow-hidden rounded-card border border-line bg-bone shadow-lift-card">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {pkg.heroImage ? (
            <Image
              src={pkg.heroImage}
              alt=""
              fill
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="img-fallback flex h-full w-full items-center justify-center">
              <span className="font-mono text-[10px] uppercase tracking-label text-stone/70">
                {pkg.destination?.name ?? 'Empiria Tours'}
              </span>
            </div>
          )}

          {/* The postcard's stamp: the next real departure, on the photo. */}
          {pkg.nextDepartureOn && !soldOut && (
            <span className="stamp absolute left-3 top-3 z-10 rounded-md bg-lemon px-3 py-1.5 font-mono text-[11px] font-semibold text-ink shadow">
              {formatDepartureDate(pkg.nextDepartureOn)}
            </span>
          )}
          {pkg.category && (
            <span className="absolute bottom-3 left-3 z-10 rounded-chip bg-ink/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-bone backdrop-blur-sm">
              {pkg.category.name}
            </span>
          )}
          {soldOut && (
            <span className="absolute right-3 top-3 z-10 rounded-chip bg-flame px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-label text-white">
              Sold out
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          {pkg.destination && (
            <p className="flex items-center gap-1.5 text-[13px] text-stone">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pkg.destination.name}</span>
            </p>
          )}

          <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-flame">
            {pkg.title}
          </h3>

          {pkg.summary && (
            <p className="line-clamp-2 text-[14px] leading-relaxed text-stone">{pkg.summary}</p>
          )}

          {/* Facts as small bordered markers — the field-guide box vocabulary. */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {pkg.durationLabel && (
              <span className="flex items-center gap-1.5 rounded-chip border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-label text-stone">
                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                {pkg.durationLabel}
              </span>
            )}
            {pkg.nextDepartureOn && !soldOut && (
              <span className="flex items-center gap-1.5 rounded-chip border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-label text-stone">
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
                {formatDepartureDate(pkg.nextDepartureOn)}
              </span>
            )}
          </div>

          <div className="mt-auto pt-3">
            <div className="mb-3 border-t border-line" />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-ink">
                <span className="font-mono text-[10px] uppercase tracking-label text-stone">From </span>
                <span className="font-display text-[19px] font-semibold text-flame">
                  {formatPrice(pkg.fromPriceCents, pkg.currency)}
                </span>
                <span className="ml-1 text-[12.5px] text-stone">pp</span>
              </p>
              <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-wide text-flame group-hover:underline">
                {pkg.bookableDepartures > 0
                  ? `${pkg.bookableDepartures} ${pkg.bookableDepartures === 1 ? 'date' : 'dates'}`
                  : 'View'}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
