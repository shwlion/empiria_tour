import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { loadReceipt } from '@/lib/receipt';
import { renderReceipt, receiptFilename } from '@/lib/pdf/receipt';
import { getUser } from '@/lib/auth';

/**
 * The receipt, as a PDF.
 *
 * Rendered on demand rather than stored. Every fact it states is already
 * immutable in the database — price lines are written once, payment rows are
 * append-only, acknowledgement wording is snapshotted at the point it was
 * agreed — so a bucket would hold a second copy of things that cannot change,
 * and would need a migration and RLS to do it. `renderReceipt` is deterministic
 * for a given booking, which is what makes the two equivalent.
 *
 * Authorisation is `loadReceipt`'s, which is the booking page's: either the
 * signed-in user owns this booking or the caller holds the session token that
 * created it. A reference alone is not authorisation, and a reference that
 * exists but is not yours 404s exactly like one that does not.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const jar = await cookies();
  const user = await getUser();

  const data = await loadReceipt(
    reference,
    jar.get('empiria_booking_session')?.value ?? null,
    user?.id ?? null
  );
  if (!data) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const bytes = renderReceipt(data);
  const filename = receiptFilename(data.reference);

  // Inline by default so it previews in the browser; `?download=1` for the
  // save-file behaviour, which is what the booking page's link asks for.
  const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      // A receipt is somebody's payment record. It must not sit in a shared
      // cache, and `noindex` keeps it out of search even though the URL is
      // unguessable and authorised anyway.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
