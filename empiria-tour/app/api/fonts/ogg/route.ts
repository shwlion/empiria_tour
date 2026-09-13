import { NextResponse } from 'next/server';

/**
 * The journal's display face, served same-origin.
 *
 * The specification loads "Ogg Medium" from a CloudFront URL, and that host
 * answers without an Access-Control-Allow-Origin header (and as
 * application/octet-stream). Browsers refuse a cross-origin @font-face file
 * without that header, so loaded directly the face never applies and the
 * headline falls back to a system serif — on any origin, not just ours.
 *
 * This route fetches the file from the spec's URL on the server and hands it
 * to the browser from our own origin, where no CORS check applies. The bytes
 * still come from the remote address, nothing is stored in the repo, and the
 * CSS is the only thing that points here. Cached for a day upstream and a
 * year in the browser: the file is immutable in practice.
 */

const SOURCE =
  'https://dcym8fthxf5uu.cloudfront.net/fonts/247a073c-29f5-4a89-aa3a-741020f346fc/OggText-Medium.woff2';

export const revalidate = 86400;

export async function GET() {
  const upstream = await fetch(SOURCE, { next: { revalidate } });
  if (!upstream.ok) {
    return NextResponse.json({ error: 'The font could not be fetched.' }, { status: 502 });
  }
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': 'font/woff2',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
