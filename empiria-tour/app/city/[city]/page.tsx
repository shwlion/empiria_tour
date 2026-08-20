import { redirect } from 'next/navigation';

/**
 * Destinations are a tree now, not a flat list of cities, so `/city/santorini`
 * has no stable meaning — the same place is `greece/cyclades/santorini`. This
 * keeps old links alive by handing the segment to the results page as a
 * destination filter; a partial match still narrows usefully.
 */
export default async function CityRedirect({
    params,
}: {
    params: Promise<{ city: string }>;
}) {
    const { city } = await params;
    redirect(`/tours?destination=${encodeURIComponent(city)}`);
}
