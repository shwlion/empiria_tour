import { timingSafeEqual } from 'node:crypto';
import { tick } from '@/lib/email/outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The clock Part C needs.
 *
 * Three of the thirteen messages fire before a date rather than after an event,
 * so something has to ask "what has become due?" on a schedule. This is that
 * endpoint: it runs the scan, then drains whatever is now queued — including
 * the event-driven messages the webhook enqueued in the meantime.
 *
 * Both halves are idempotent. The scan writes rows carrying dedupe keys, and
 * the drain claims with `for update skip locked`. Calling this twice a minute,
 * or twice at once, sends nothing twice — which matters, because a cron that
 * cannot overlap is a cron with a single point of failure.
 *
 * POST only, and behind a shared secret. A GET would be followed by every
 * crawler that ever sees the URL.
 */

function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  // No secret configured means the endpoint is closed, not open. A deployment
  // that forgot to set it should do nothing rather than everything.
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const offered = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  // Compare in constant time, and only when the lengths already match —
  // timingSafeEqual throws on a length mismatch, which would itself leak.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return new Response('Not found', { status: 404 });
  }

  const report = await tick();

  // Always 200 unless the caller was wrong. A queue with failures in it is a
  // queue doing its job; a non-2xx here would make a scheduler retry the whole
  // tick and log an incident over one bad address.
  return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
