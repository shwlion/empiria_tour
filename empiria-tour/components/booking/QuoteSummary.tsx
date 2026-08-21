'use client';

import Image from 'next/image';
import { formatPrice, formatDateRange } from '@/lib/money';
import type { Quote } from '@/lib/pricing';
import type { BookingContext } from '@/lib/booking';
import HoldTimer from './HoldTimer';

/**
 * The itemised total, kept beside the form the whole way through.
 *
 * Part D asks for the all-in price with taxes and fees broken out, and A4 for a
 * panel that recalculates as the selection changes. Both are satisfied by never
 * hiding it: the number moves in front of the traveller as they change things,
 * rather than appearing for the first time on a payment screen.
 *
 * Every line here comes from the same `quote()` the server will recompute
 * before writing, so what is shown and what is charged are the same arithmetic.
 */
export default function QuoteSummary({
  context,
  quote,
  expiresAt,
  onExpire,
  onRefresh,
}: {
  context: BookingContext;
  quote: Quote;
  expiresAt: string | null;
  onExpire: () => void;
  onRefresh: () => void;
}) {
  const { currency } = context;

  return (
    <div className="rounded-card border border-line bg-bone shadow-lift-panel">
      <div className="flex gap-3 border-b border-line p-4">
        {context.package.heroImage && (
          <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-field">
            <Image
              src={context.package.heroImage}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0">
          {context.package.destination && (
            <p className="truncate font-mono text-[10px] uppercase tracking-label text-flame">
              {context.package.destination}
            </p>
          )}
          <p className="mt-0.5 line-clamp-2 text-[14px] font-medium leading-snug text-ink">
            {context.package.title}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-stone">
            {formatDateRange(context.departure.startsOn, context.departure.endsOn)}
          </p>
        </div>
      </div>

      <div className="p-4">
        <ul className="flex flex-col gap-2">
          {quote.lines.map((l, i) => (
            <li key={`${l.kind}-${i}`} className="flex items-baseline justify-between gap-4 text-[14px]">
              <span className="text-ink">
                {l.label}
                {l.detail && <span className="ml-1.5 text-[12.5px] text-stone">{l.detail}</span>}
              </span>
              <span
                className={`shrink-0 tabular-nums ${l.amountCents < 0 ? 'text-flame' : 'text-ink'}`}
              >
                {formatPrice(l.amountCents, currency)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
          <span className="font-display text-[16px] font-semibold text-ink">Total</span>
          <span className="font-display text-[22px] tabular-nums text-ink">
            {formatPrice(quote.totalCents, currency)}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-stone">
          All in for {quote.seats} {quote.seats === 1 ? 'traveller' : 'travellers'}
          {quote.headcount > quote.seats &&
            ` plus ${quote.headcount - quote.seats} ${
              quote.headcount - quote.seats === 1 ? 'infant' : 'infants'
            }`}
          . Taxes and fees are itemised above.
        </p>

        {quote.depositDueCents > 0 && (
          <div className="mt-4 rounded-field bg-paper p-3">
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-ink">Due at booking</span>
              <span className="font-display text-[17px] tabular-nums text-flame">
                {formatPrice(quote.depositDueCents, currency)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between text-[13px] text-stone">
              <span>
                Balance
                {quote.balanceDueOn && ` by ${formatDateRange(quote.balanceDueOn, null)}`}
              </span>
              <span className="tabular-nums">{formatPrice(quote.balanceCents, currency)}</span>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-3">
          <HoldTimer expiresAt={expiresAt} onExpire={onExpire} onRefresh={onRefresh} />
        </div>
      </div>
    </div>
  );
}
