import Image from 'next/image';
import { ArrowRight, ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
import { SHOP_URL } from '@/lib/urls';
import { citiesOf, cityUrl, formatEventDate, type EventCard } from '@/lib/events';

/**
 * "Looking for something different?" — Empiria Events on the Tours home page.
 *
 * Exhibit A A2's "promotional placement featuring Empiria live events", in its
 * live form: the cards are real, upcoming, public events read from the Events
 * platform's own API (lib/events.ts), and every link leaves for the Events
 * shop in a new tab — a visitor browsing tours should not lose a hold on
 * seats by following an evening out.
 *
 * With no events to show (the API down, or nothing upcoming) the section
 * keeps its words, its city chips disappear, and the one link that always
 * works stays: this is an advertisement, and an advertisement with no cards
 * is still an advertisement. It never renders an empty grid.
 *
 * B6's admin-managed placement — headline, copy, image, schedule, active
 * state — is a separate item still to build; when it lands, its copy can
 * replace the lines below and its schedule can gate the whole section.
 */
export default function EventsSpotlight({ events }: { events: EventCard[] }) {
  const cities = citiesOf(events).slice(0, 6);
  const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16" aria-labelledby="events-spotlight-title">
      <div data-reveal className="mb-6 flex items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[12px] font-medium uppercase tracking-label text-ember">Empiria Events</p>
          <h2
            id="events-spotlight-title"
            className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]"
          >
            Looking for something different?
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-stone">
            Find out what&rsquo;s on near you, or in a city you&rsquo;re heading to &mdash; concerts,
            dinners and festivals from the same people who run the trips.
          </p>
        </div>
        <a
          href={SHOP_URL}
          {...external}
          className="hidden shrink-0 items-center gap-1.5 font-mono text-[13px] font-medium text-stone transition-colors hover:text-ember sm:flex"
        >
          All events
          <span className="arrow"><ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
        </a>
      </div>

      {cities.length > 0 && (
        <div data-reveal className="mb-8 flex flex-wrap gap-2.5" aria-label="Cities with events">
          {cities.map((city) => (
            <a
              key={city}
              href={cityUrl(city)}
              {...external}
              className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-chip border border-line bg-white px-5 py-2.5 font-mono text-[13px] font-medium text-ink transition-colors hover:border-ember hover:text-ember"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {city}
            </a>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
          {events.map((event) => {
            const when = formatEventDate(event.startsAt, event.timezone);
            const where = [event.venue, event.city].filter(Boolean).join(' · ');
            return (
              <div key={event.id} data-reveal className="h-full">
                <a href={event.url} {...external} className="group block h-full">
                  <article className="card-hover flex h-full flex-col overflow-hidden rounded-card border border-line bg-bone shadow-lift-card">
                    <div className="relative aspect-[4/3] w-full overflow-hidden">
                      {event.coverImage ? (
                        <Image
                          src={event.coverImage}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="img-fallback flex h-full w-full items-center justify-center">
                          <span className="font-mono text-[10px] uppercase tracking-label text-stone/70">Empiria Events</span>
                        </div>
                      )}
                      {when && (
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-chip bg-white/92 px-3 py-1.5 font-mono text-[11px] font-medium text-ink shadow-sm backdrop-blur">
                          <CalendarDays className="h-3.5 w-3.5 text-ember" aria-hidden="true" />
                          {when}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-flame">
                        {event.title}
                      </h3>
                      {where && (
                        <p className="line-clamp-1 flex items-center gap-1.5 text-[13px] text-stone">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {where}
                        </p>
                      )}
                      <p className="mt-auto flex items-center gap-1 pt-3 font-mono text-[11px] uppercase tracking-label text-stone">
                        Tickets on Empiria Events
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </p>
                    </div>
                  </article>
                </a>
              </div>
            );
          })}
        </div>
      )}

      <div data-reveal className={`${events.length > 0 ? 'mt-8' : ''} sm:hidden`}>
        <a
          href={SHOP_URL}
          {...external}
          className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-[13px] font-medium text-ember"
        >
          All events <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
