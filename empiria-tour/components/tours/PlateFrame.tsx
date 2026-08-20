/**
 * The printed-plate frame and its dashed itinerary thread — the two signature
 * devices from the original identity, lifted out of FeaturedHero so any surface
 * can use them.
 *
 * `PlateFrame` is the inset hairline box with flame register ticks at each
 * corner. `RouteThread` is the drifting dashed route with three stops. Both are
 * decorative and marked aria-hidden.
 */

export function PlateFrame({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const edge = tone === 'light' ? 'border-white/10' : 'border-ink/10';
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-3 z-10 border sm:inset-6 ${edge}`}
    >
      <span className="absolute -left-px -top-px h-4 w-4 border-l-2 border-t-2 border-flame" />
      <span className="absolute -right-px -top-px h-4 w-4 border-r-2 border-t-2 border-flame" />
      <span className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-flame" />
      <span className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-flame" />
    </div>
  );
}

/** The signature: a dashed itinerary threading three "stops" across the plate. */
export function RouteThread({ className = '' }: { className?: string }) {
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

/** Right-edge coordinate — wayfinding detail (Empiria HQ, Toronto). */
export function EdgeCoordinate() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-7 top-1/2 z-10 hidden origin-right -translate-y-1/2 rotate-90 font-mono text-[10px] uppercase tracking-label text-white/35 lg:block"
    >
      43.6532&deg; N &middot; 79.3832&deg; W
    </span>
  );
}
