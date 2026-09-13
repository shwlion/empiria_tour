'use client';

import { useEffect } from 'react';
import { purchaseParams, track } from '@/lib/analytics';

/**
 * Part F: the `purchase` conversion, sent once when the traveller comes back
 * from Checkout. Rendered by the confirmation page only on the return from
 * Stripe (`?paid=1`), and remembered per reference in sessionStorage so a
 * refresh of that page does not count the sale twice. The reference also
 * travels as GA's transaction id, which lets a provider de-duplicate on its
 * side as well.
 *
 * Whether money actually arrived is the webhook's to say, not this file's:
 * this is a measurement of conversions, never a record of payment.
 */
export default function PurchaseEvent({
  reference,
  currency,
  totalCents,
  packageSlug,
  packageTitle,
  seats,
}: {
  reference: string;
  currency: string;
  totalCents: number;
  packageSlug: string;
  packageTitle: string;
  seats: number;
}) {
  useEffect(() => {
    const key = `empiria_purchase_${reference}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* no storage: send once per page view, the best that can be done */
    }
    const sent = track(
      'purchase',
      purchaseParams({ reference, currency, totalCents, packageId: packageSlug, packageName: packageTitle, seats })
    );
    if (sent) {
      try {
        sessionStorage.setItem(key, '1');
      } catch {
        /* nothing to remember it in */
      }
    }
  }, [reference, currency, totalCents, packageSlug, packageTitle, seats]);

  return null;
}
