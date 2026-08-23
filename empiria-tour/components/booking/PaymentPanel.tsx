'use client';

import { useState, useTransition } from 'react';
import { CreditCard, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { formatPrice, formatDateRange } from '@/lib/money';
import { startCheckoutAction, abandonBookingAction } from '@/app/booking/[reference]/actions';

/**
 * A6 — what is owed, and the button that pays it.
 *
 * Where a package allows a deposit, both amounts are offered side by side with
 * the consequence of each spelled out. Part D wants the all-in figure visible
 * at the point of payment, so the balance and its due date sit next to the
 * smaller number rather than appearing afterwards.
 *
 * Nothing here is told the outcome by the browser. Coming back from Stripe
 * shows "we are confirming", and the page says paid only once the webhook has
 * said so.
 */
export default function PaymentPanel({
  reference,
  status,
  currency,
  totalCents,
  amountPaidCents,
  depositDueCents,
  balanceDueOn,
  leadEmail,
  configured,
  testMode,
  justReturned,
  cancelled,
}: {
  reference: string;
  status: string;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  depositDueCents: number;
  balanceDueOn: string | null;
  leadEmail: string;
  configured: boolean;
  testMode: boolean;
  justReturned: boolean;
  cancelled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const outstanding = totalCents - amountPaidCents;
  const depositOffered = amountPaidCents === 0 && depositDueCents > 0 && depositDueCents < totalCents;

  function pay(kind: 'deposit' | 'full' | 'balance') {
    setError(null);
    startTransition(async () => {
      const result = await startCheckoutAction(reference, kind);
      if (result.ok) {
        window.location.href = result.url;
        return;
      }
      setError(result.message);
    });
  }

  function abandon() {
    setError(null);
    startTransition(async () => {
      const result = await abandonBookingAction(reference);
      if (result.ok) {
        window.location.reload();
        return;
      }
      setError(result.message);
    });
  }

  // ── settled states ──────────────────────────────────────────────────────
  if (status === 'cancelled' || status === 'refunded') return null;

  if (outstanding <= 0) {
    return (
      <div className="mt-10 rounded-card border border-line bg-bone p-5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-flame">
          <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
          Paid
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">
          {formatPrice(totalCents, currency)} received. Nothing further is owed.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-stone">
          Your receipt is on its way to {leadEmail}.
        </p>
      </div>
    );
  }

  // ── waiting on the webhook ──────────────────────────────────────────────
  if (justReturned && amountPaidCents === 0) {
    return (
      <div className="mt-10 rounded-card border border-line bg-bone p-5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-flame">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Confirming
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">
          Your card has been submitted and we are waiting for the bank to confirm it. This is
          usually seconds.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-stone">
          Refresh this page in a moment. Your places are held either way, and you will get an email
          the instant it clears. Nothing is charged twice if you reload.
        </p>
      </div>
    );
  }

  // ── nothing to pay with ─────────────────────────────────────────────────
  if (!configured) {
    return (
      <div className="mt-10 rounded-card border border-line bg-bone p-5">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-flame">
          <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
          Payment
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">
          {formatPrice(depositOffered ? depositDueCents : outstanding, currency)} is due to confirm
          these places.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-stone">
          Card payment is not switched on for this site yet. Our team will contact you at{' '}
          <span className="text-ink">{leadEmail}</span> to take payment and confirm. Quote your
          reference and nothing else is needed.
        </p>
      </div>
    );
  }

  // ── the live payment panel ──────────────────────────────────────────────
  return (
    <div className="mt-10 rounded-card border border-line bg-bone p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-flame">
          <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
          {amountPaidCents > 0 ? 'Balance outstanding' : 'Payment'}
        </p>
        {testMode && (
          <span className="rounded-chip bg-ember/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-label text-ember">
            Test mode — no real card is charged
          </span>
        )}
      </div>

      {cancelled && !error && (
        <p className="mt-3 flex gap-2 rounded-field bg-paper p-3 text-[13.5px] leading-relaxed text-stone">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>You came back without paying. Nothing was charged and your places are still held.</span>
        </p>
      )}

      {amountPaidCents > 0 && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-stone">
          {formatPrice(amountPaidCents, currency)} received of {formatPrice(totalCents, currency)}.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {depositOffered && (
          <button
            type="button"
            onClick={() => pay('deposit')}
            disabled={pending}
            className="flex flex-1 flex-col items-start gap-1 rounded-field bg-flame px-5 py-3.5 text-left transition-colors hover:bg-ember disabled:cursor-not-allowed disabled:bg-stone/40"
          >
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-label text-white">
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Pay {formatPrice(depositDueCents, currency)} now
            </span>
            <span className="text-[12px] leading-snug text-white/80">
              {formatPrice(totalCents - depositDueCents, currency)} due
              {balanceDueOn ? ` by ${formatDateRange(balanceDueOn, null)}` : ' before you travel'}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => pay(amountPaidCents > 0 ? 'balance' : 'full')}
          disabled={pending}
          className={[
            'flex flex-1 flex-col items-start gap-1 rounded-field px-5 py-3.5 text-left transition-colors disabled:cursor-not-allowed',
            depositOffered
              ? 'border border-line text-ink hover:border-flame hover:text-flame disabled:text-stone/50'
              : 'bg-flame text-white hover:bg-ember disabled:bg-stone/40',
          ].join(' ')}
        >
          <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-label">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Pay {formatPrice(outstanding, currency)}
            {depositOffered ? ' in full' : ' now'}
          </span>
          <span className={`text-[12px] leading-snug ${depositOffered ? 'text-stone' : 'text-white/80'}`}>
            {depositOffered ? 'Nothing further to pay' : 'Confirms your places immediately'}
          </span>
        </button>
      </div>

      {error && (
        <p className="mt-3 flex gap-2 rounded-field bg-paper p-3 text-[13.5px] leading-relaxed text-ember">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {notice && <p className="mt-3 text-[13.5px] text-stone">{notice}</p>}

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-stone">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Card details are handled by Stripe and never reach this site.
      </p>

      {status === 'pending_payment' && amountPaidCents === 0 && (
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            abandon();
          }}
          disabled={pending}
          className="mt-4 text-[12.5px] text-stone underline underline-offset-4 transition-colors hover:text-ember disabled:cursor-not-allowed"
        >
          Cancel this booking and release the places
        </button>
      )}
    </div>
  );
}
