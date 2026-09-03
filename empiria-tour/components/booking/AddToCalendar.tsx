import { CalendarPlus, Download } from 'lucide-react';
import { googleCalendarUrl } from '@/lib/calendar';
import { absoluteUrl } from '@/lib/seo';

/**
 * Put the trip in the traveller's own diary.
 *
 * Deliberately not a client component. Both destinations are links — Google
 * takes a prefilled URL, Apple and Outlook take the `.ics` the sibling route
 * serves — so there is nothing here a browser has to compute, and no reason to
 * ship JavaScript for two anchors.
 *
 * The caller decides whether to render this at all; a cancelled trip does not
 * belong in anybody's calendar. See the booking page.
 */
export default function AddToCalendar({
  reference,
  packageTitle,
  packageSlug,
  meetingPoint,
  startsOn,
  endsOn,
  startTime,
  createdAt,
}: {
  reference: string;
  packageTitle: string;
  packageSlug: string;
  meetingPoint: string | null;
  startsOn: string;
  endsOn: string | null;
  startTime: string | null;
  createdAt: string;
}) {
  // A departure with no date cannot be a calendar entry, and an entry with a
  // wrong date is worse than none.
  if (!startsOn) return null;

  // Kept identical to the route's, so the two destinations describe the same
  // trip. Facts only — what wording is legally required is Empiria's call.
  const description = [
    `Booking reference ${reference}.`,
    startTime ? `Departs ${startTime.slice(0, 5)}, local time.` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const google = googleCalendarUrl({
    uid: reference,
    stamp: createdAt,
    title: `${packageTitle} — Empiria Tours`,
    description,
    location: meetingPoint,
    startsOn,
    endsOn,
    url: packageSlug ? absoluteUrl(`/tours/${packageSlug}`) : null,
  });

  const link =
    'inline-flex items-center gap-2 rounded-field border border-line bg-bone px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:border-flame hover:text-flame';

  return (
    <section className="mt-8">
      <h2 className="font-mono text-[11px] uppercase tracking-label text-stone">
        Add it to your calendar
      </h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <a href={google} target="_blank" rel="noopener noreferrer" className={link}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          Google Calendar
        </a>
        <a href={`/booking/${reference}/tour.ics`} className={link}>
          <Download className="h-4 w-4" aria-hidden="true" />
          Apple Calendar or Outlook
        </a>
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-stone">
        Saved as an all-day entry for the length of the trip
        {startTime ? `, departing ${startTime.slice(0, 5)} local time` : ''}.
      </p>
    </section>
  );
}
