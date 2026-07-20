'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { formatEventDateTime, tzAbbreviation, DEFAULT_TZ } from '@/lib/datetime';

interface FeaturedEvent {
  id: string;
  title: string;
  slug: string;
  cover_image_url?: string;
  venue_name?: string;
  city?: string;
  currency?: string;
  categories?: { name: string } | null;
  event_occurrences?: { starts_at: string }[];
  organizer_name?: string;
  /** Event's IANA timezone — the slide date/time renders in this zone with its label. */
  timezone?: string;
}

interface FeaturedHeroProps {
  featuredEvents: FeaturedEvent[];
  query: string;
  setQuery: (q: string) => void;
}

/** The signature: a dashed itinerary threading three "stops" across the plate. */
function RouteThread({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 620"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path
        d="M -40 470 C 250 360 380 540 640 400 C 900 260 1060 470 1480 190"
        strokeWidth="2"
        strokeDasharray="10 12"
        className="route-drift stroke-flame"
      />
      {[
        [250, 396],
        [640, 400],
        [1120, 300],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="12" strokeWidth="1.5" className="stroke-flame" />
          <circle cx={cx} cy={cy} r="4.5" className="fill-flame" />
        </g>
      ))}
    </svg>
  );
}

export default function FeaturedHero({ featuredEvents, query, setQuery }: FeaturedHeroProps) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const hasSlides = featuredEvents.length > 0;
  const total = featuredEvents.length;

  const next = useCallback(() => {
    if (total <= 1) return;
    setCurrent((prev) => (prev + 1) % total);
  }, [total]);

  const prev = useCallback(() => {
    if (total <= 1) return;
    setCurrent((prev) => (prev - 1 + total) % total);
  }, [total]);

  // Auto-rotate every 6 seconds, pause on hover
  useEffect(() => {
    if (paused || total <= 1) return;
    const timer = setInterval(next, 6000);
    return () => clearInterval(timer);
  }, [paused, next, total]);

  const currentEvent = hasSlides ? featuredEvents[current] : null;
  const eventStartIso = currentEvent?.event_occurrences?.[0]?.starts_at ?? null;
  const eventTz = currentEvent?.timezone || DEFAULT_TZ;
  // "Sat, Nov 29" (date only) + " at 7:00 PM EST" (time + tz label).
  const eventDateLabel = eventStartIso
    ? formatEventDateTime(eventStartIso, eventTz, {
        withWeekday: true,
        withYear: false,
        withTime: false,
        longMonth: false,
      })
    : '';
  // Time + tz portion built directly so we don't repeat the date: "7:00 PM EST".
  const eventTimeLabel = eventStartIso
    ? `${new Date(eventStartIso).toLocaleTimeString('en-US', {
        timeZone: eventTz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })} ${tzAbbreviation(eventStartIso, eventTz)}`
    : '';

  const runSearch = () => {
    if (query.trim()) {
      document.getElementById('events-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      className="relative min-h-screen w-full overflow-hidden bg-ink"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Slide backgrounds with cross-fade */}
      {hasSlides ? (
        featuredEvents.map((event, i) => (
          <div
            key={event.id}
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{ opacity: i === current ? 1 : 0 }}
          >
            {event.cover_image_url ? (
              <img src={event.cover_image_url} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-soot via-ink to-ink" />
            )}
          </div>
        ))
      ) : (
        /* Shell plate — no banner asset yet. The dashed route + coordinates carry
           the hero on their own until featured tours (with cover images) exist. */
        <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_15%_-10%,#2b2118_0%,#17130f_55%,#0f0c09_100%)]" />
      )}

      {/* Legibility wash — heavier at the bottom where the caption sits */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/70" />

      {/* Ambient itinerary line — the signature. Bolder on the empty shell. */}
      <RouteThread className={`absolute inset-0 h-full w-full ${hasSlides ? 'opacity-25' : 'opacity-60'}`} />

      {/* Printed-plate frame + corner register ticks */}
      <div className="pointer-events-none absolute inset-3 z-10 border border-white/10 sm:inset-6">
        <span className="absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-flame" />
        <span className="absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-flame" />
        <span className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-flame" />
        <span className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-flame" />
      </div>

      {/* Right-edge coordinate — wayfinding detail (Empiria HQ, Toronto) */}
      <span className="pointer-events-none absolute right-7 top-1/2 z-10 hidden origin-right -translate-y-1/2 rotate-90 font-mono text-[10px] uppercase tracking-label text-white/35 lg:block">
        43.6532&deg; N &middot; 79.3832&deg; W
      </span>

      {/* Thesis column */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 pb-48 pt-28 sm:px-10">
        <div className="max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-flame" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-label text-flame">
              Empiria Tour
            </span>
            <span className="h-px w-8 bg-white/20" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-label text-white/45">
              Guided cultural journeys
            </span>
          </div>

          <h1 className="font-display text-[2.75rem] font-semibold leading-[0.98] tracking-tight text-bone sm:text-6xl lg:text-7xl">
            Go where the
            <br />
            <span className="text-flame">guidebook</span> stops.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Cultural tours and hand-built experiences across Canada and beyond &mdash;
            led by the people who actually live there.
          </p>

          {/* Search — an editorial field, not a floating pill */}
          <div className="mt-10 max-w-xl">
            <label
              htmlFor="hero-search"
              className="mb-3 block font-mono text-[10px] uppercase tracking-label text-white/40"
            >
              Find a tour
            </label>
            <div className="flex items-stretch gap-3">
              <div className="flex flex-1 items-center gap-3 border-b-2 border-white/25 pb-3 transition-colors focus-within:border-flame">
                <Search className="h-5 w-5 flex-shrink-0 text-white/50" />
                <input
                  id="hero-search"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Search tours, cities, cultures…"
                  className="w-full min-w-0 truncate bg-transparent text-[15px] text-bone outline-none placeholder:text-white/40"
                />
              </div>
              <button
                onClick={runSearch}
                className="flex-shrink-0 self-start rounded-lg bg-flame px-6 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Featured-tour caption band */}
      {hasSlides && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10 sm:px-10 sm:pb-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-white/15 pt-6 sm:flex-row sm:items-end sm:justify-between">
            {/* Current featured event */}
            <div className="min-w-0 max-w-xl text-bone">
              <div className="mb-2 flex items-center gap-3">
                <span className="font-mono text-[11px] font-bold uppercase tracking-label text-flame">
                  N&deg;{String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                </span>
                {currentEvent?.categories?.name && (
                  <>
                    <span className="h-px w-6 bg-white/25" aria-hidden="true" />
                    <span className="font-mono text-[11px] uppercase tracking-label text-white/60">
                      {currentEvent.categories.name}
                    </span>
                  </>
                )}
              </div>
              <Link href={`/events/${currentEvent?.slug}`} className="group">
                <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight text-bone transition-colors group-hover:text-flame sm:text-3xl">
                  {currentEvent?.title}
                </h2>
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-wide text-white/55">
                {eventStartIso && (
                  <span>
                    {eventDateLabel} &middot; {eventTimeLabel}
                  </span>
                )}
                {currentEvent?.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {currentEvent.city}
                    {currentEvent.venue_name ? `, ${currentEvent.venue_name}` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Controls + segmented progress */}
            {total > 1 && (
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured tours">
                  {featuredEvents.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      aria-label={`Go to featured tour ${i + 1}`}
                      aria-selected={i === current}
                      role="tab"
                      className={`h-[3px] rounded-full transition-all duration-300 ${
                        i === current ? 'w-8 bg-flame' : 'w-4 bg-white/25 hover:bg-white/50'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={prev}
                    aria-label="Previous featured tour"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-bone transition-colors hover:border-flame hover:text-flame"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={next}
                    aria-label="Next featured tour"
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-bone transition-colors hover:border-flame hover:text-flame"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll cue — only on the shell, where the caption band is absent */}
      {!hasSlides && (
        <div className="absolute bottom-10 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-white/40">Scroll</span>
          <span className="h-8 w-px animate-pulse bg-white/30" aria-hidden="true" />
        </div>
      )}
    </section>
  );
}
