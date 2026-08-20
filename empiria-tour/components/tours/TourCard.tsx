import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock, CalendarDays } from 'lucide-react';
import { formatPrice, formatDepartureDate } from '@/lib/money';
import type { PackageCard } from '@/lib/catalogue';

/**
 * A tour card.
 *
 * Replaces the shop's EventCard, which was built around a single instant — a
 * date box with a clock time, a ticket price, an organizer. A tour has none of
 * those. What a traveller comparing trips actually needs is: where, how long,
 * what it starts at, and when the next one goes. That is the whole card.
 *
 * Image-forward with the text block beneath, in Airbnb's proportions. The flame
 * appears once, on the price, because that is the number people scan for.
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
    <Link
      href={`/tours/${pkg.slug}`}
      className="group card-lift block rounded-card focus-visible:outline-2"
      aria-label={`${pkg.title}${pkg.destination ? `, ${pkg.destination.name}` : ''}`}
    >
      <article className="overflow-hidden rounded-card bg-bone ring-1 ring-line">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {pkg.heroImage ? (
            <Image
              src={pkg.heroImage}
              alt=""
              fill
              priority={priority}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="img-fallback flex h-full w-full items-center justify-center">
              <span className="font-mono text-[10px] uppercase tracking-label text-stone/70">
                {pkg.destination?.name ?? 'Empiria Tours'}
              </span>
            </div>
          )}

          {pkg.category && (
            <span className="absolute left-3 top-3 rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-bone backdrop-blur-sm">
              {pkg.category.name}
            </span>
          )}
          {soldOut && (
            <span className="absolute right-3 top-3 rounded-full bg-bone/95 px-2.5 py-1 font-mono text-[10px] uppercase tracking-label text-stone">
              Sold out
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 p-4">
          {pkg.destination && (
            <p className="flex items-center gap-1.5 text-[13px] text-stone">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{pkg.destination.name}</span>
            </p>
          )}

          <h3 className="font-display text-[17px] leading-snug text-ink transition-colors group-hover:text-ember">
            {pkg.title}
          </h3>

          {pkg.summary && (
            <p className="line-clamp-2 text-[14px] leading-relaxed text-stone">{pkg.summary}</p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-stone">
            {pkg.durationLabel && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pkg.durationLabel}
              </span>
            )}
            {pkg.nextDepartureOn && !soldOut && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Next {formatDepartureDate(pkg.nextDepartureOn)}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
            <p className="text-ink">
              <span className="font-mono text-[10px] uppercase tracking-label text-stone">From </span>
              <span className="font-display text-[19px] text-flame">
                {formatPrice(pkg.fromPriceCents, pkg.currency)}
              </span>
              <span className="ml-1 text-[12.5px] text-stone">per person</span>
            </p>
            {pkg.bookableDepartures > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-label text-stone">
                {pkg.bookableDepartures} {pkg.bookableDepartures === 1 ? 'date' : 'dates'}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
