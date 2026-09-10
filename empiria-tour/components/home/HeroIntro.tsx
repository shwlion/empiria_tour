import type { CSSProperties } from 'react';
import { ShieldCheck } from 'lucide-react';
import SearchBar, { type DestinationOption } from '@/components/tours/SearchBar';

/**
 * The hero's left column when nothing is expanded: the headline, the search
 * plate and the seller line Part D wants visible before any money moves.
 *
 * A server component, passed into `HomeHero` as a slot — so the search plate
 * and the seller identity are rendered from the database on the server, and
 * the client component that owns the takeover never has to know about either.
 * The `--d` custom properties are the load choreography's delays; the classes
 * only hide anything when `html.js` is present (see app/layout.tsx).
 */
const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

export default function HeroIntro({
  destinations,
  months,
  seller,
}: {
  destinations: DestinationOption[];
  /** Months with departures, for the When control. */
  months: { value: string; label: string }[];
  seller: { name: string | null; registrationNumber: string | null };
}) {
  return (
    <>
      <p className="rise-in font-mono text-[12px] font-medium uppercase tracking-label text-ember" style={delay(40)}>
        Small groups · Real departures
      </p>
      <h1
        className="mt-4 font-display text-[44px] font-extrabold leading-[1.02] tracking-tight text-ink sm:text-[60px] xl:text-[68px]"
        style={{ letterSpacing: '-0.03em' }}
      >
        <span className="rise-in block" style={delay(120)}>Somewhere worth</span>
        <span className="rise-in block" style={delay(200)}>the time off.</span>
      </h1>
      <p className="rise-in mt-5 max-w-lg text-[16px] leading-relaxed text-stone sm:text-[17px]" style={delay(320)}>
        Guided journeys through Greece, Italy and beyond — sixteen travellers at most, prices shown
        all in, and every departure date real rather than indicative.
      </p>

      <div className="card-enter mt-8">
        <SearchBar destinations={destinations} months={months} />
      </div>

      {/* Part D: the seller is named next to the first thing that can lead to a sale. */}
      <p className="fade-in mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-stone" style={delay(900)}>
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ember" aria-hidden="true" />
        <span>
          {seller.name ?? 'Empiria'}
          {seller.registrationNumber ? ` · Registration ${seller.registrationNumber}` : ''}
          {' · all-in prices'}
        </span>
      </p>
    </>
  );
}
