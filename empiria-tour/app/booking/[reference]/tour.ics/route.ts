import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getBookingForViewer } from '@/lib/booking';
import { getUser } from '@/lib/auth';
import { isClosed } from '@/lib/bookingStatus';
import { buildIcs, icsFilename } from '@/lib/calendar';
import { absoluteUrl } from '@/lib/seo';

/**
 * The trip, as a calendar file.
 *
 * The route Apple Calendar and Outlook take. Neither has a prefilled-event URL
 * the way Google does — handing the client a `.ics` is the only way in, which
 * is why this exists as a route rather than a link the component could build
 * for itself.
 *
 * Authorisation is `getBookingForViewer`'s, which is the booking page's and the
 * receipt's: either the signed-in user owns this booking, or the caller holds
 * the session token the hold was created under. A reference alone is not
 * authorisation, and a reference that exists but is not yours 404s exactly like
 * one that does not.
 *
 * A closed booking 404s too. `isClosed` is the same predicate that files a trip
 * under Past in the account list, and putting a cancelled trip into somebody's
 * diary is the calendar version of a link that 404s: worse than its absence.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const jar = await cookies();
  const user = await getUser();

  const booking = await getBookingForViewer(
    reference,
    jar.get('empiria_booking_session')?.value ?? null,
    user?.id ?? null
  );
  if (!booking || isClosed(booking.status)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // Part D and §2.3: state the facts of the booking and nothing that reads as
  // terms. What may or must be said is Empiria's to decide, not ours to draft.
  const details = [
    `Booking reference ${booking.reference}.`,
    booking.departure.startTime
      ? `Departs ${booking.departure.startTime.slice(0, 5)}, local time.`
      : null,
  ].filter(Boolean) as string[];

  const body = buildIcs({
    uid: booking.reference,
    // The booking's own creation time, never `now` — that is what makes the
    // same booking render byte-identically on every request.
    stamp: booking.createdAt,
    title: `${booking.package.title} — Empiria Tours`,
    description: details.join('\n'),
    location: booking.package.meetingPoint,
    startsOn: booking.departure.startsOn,
    endsOn: booking.departure.endsOn,
    url: booking.package.slug ? absoluteUrl(`/tours/${booking.package.slug}`) : null,
  });

  const bytes = new TextEncoder().encode(body);

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Length': String(bytes.byteLength),
      // Always an attachment: an inline `.ics` renders as a wall of text in a
      // browser tab, where downloading it is what hands it to the calendar app.
      'Content-Disposition': `attachment; filename="${icsFilename(booking.reference)}"`,
      // Somebody's travel dates. It must not sit in a shared cache, and the
      // same `noindex` the receipt carries applies for the same reason.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
