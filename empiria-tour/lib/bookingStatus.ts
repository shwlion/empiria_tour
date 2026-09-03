/**
 * The one vocabulary for what a booking's `status` column means to a traveller.
 *
 * Pure, so it is safe on both server and client — the same reason `lib/money.ts`
 * lives apart from `lib/catalogue.ts`.
 *
 * The booking page keeps its own longer copy: a heading and a sentence of
 * reassurance are a different job from a word in a list. What must not diverge
 * is the word itself, which is why the short form lives here and the receipt and
 * the account list both read it rather than each carrying a copy.
 */

/** The status word, as shown to a traveller. */
export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  balance_due: 'Balance outstanding',
  paid_in_full: 'Paid in full',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  travelled: 'Trip complete',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/**
 * Whether a status means the booking is over, one way or another.
 *
 * Drives the split between "Upcoming" and "Past" in the account list. A
 * cancelled trip belongs under Past however far in the future its departure
 * was: the date stopped being a plan the moment it was cancelled.
 */
export function isClosed(status: string): boolean {
  return status === 'cancelled' || status === 'refunded' || status === 'travelled';
}
