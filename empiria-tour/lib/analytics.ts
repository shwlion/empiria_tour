import { readConsent, type ConsentState } from '@/lib/consent';

/**
 * Part F — "page and conversion event tracking with consent management" —
 * the conversion half, as a seam.
 *
 * `track(name, params)` is what the site calls. Where the event goes is
 * decided by what is on the page, and nothing is on the page until two
 * things are true: the visitor accepted analytics (the banner, lib/consent.ts)
 * and Empiria set a provider id (`NEXT_PUBLIC_GTM_ID` or `NEXT_PUBLIC_GA_ID`,
 * mounted by components/Analytics.tsx). Until both hold, every call returns
 * false and does nothing — no queue, no shadow record, nothing that could
 * later be mistaken for consent.
 *
 * Page views are deliberately not sent from here. GA4's enhanced measurement
 * counts history changes on its own and a GTM container has a trigger for
 * them; a second `page_view` from this file would double every navigation.
 *
 * The event names and shapes are GA4's recommended ones (`search`,
 * `begin_checkout`, `purchase`, `generate_lead`), so a container needs no
 * mapping to report on them. `dispatch` and `route` are pure and tested;
 * `track` only supplies the real window.
 */

export type AnalyticsItem = { item_id: string; item_name: string; quantity?: number; price?: number };
export type AnalyticsParams = Record<string, string | number | boolean | null | undefined | AnalyticsItem[]>;

export type AnalyticsTarget = {
  consent: ConsentState | null | undefined;
  gtag?: unknown;
  dataLayer?: unknown;
};

export type AnalyticsRoute = 'gtag' | 'dataLayer' | 'no-consent' | 'no-provider';

/** Where an event would go, or why it goes nowhere. */
export function route(target: AnalyticsTarget): AnalyticsRoute {
  if (target.consent?.analytics !== true) return 'no-consent';
  // gtag.js defines `gtag` before its script even loads and replays the queue,
  // so a call in the same tick as acceptance is not lost. GTM defines only the
  // dataLayer, so that is the second door.
  if (typeof target.gtag === 'function') return 'gtag';
  if (Array.isArray(target.dataLayer)) return 'dataLayer';
  return 'no-provider';
}

/** Send one event to the target, or do nothing. Returns whether it went. */
export function dispatch(target: AnalyticsTarget, name: string, params: AnalyticsParams = {}): boolean {
  switch (route(target)) {
    case 'gtag':
      (target.gtag as (...args: unknown[]) => void)('event', name, params);
      return true;
    case 'dataLayer':
      (target.dataLayer as unknown[]).push({ event: name, ...params });
      return true;
    default:
      return false;
  }
}

/** The site's one entry point. Safe to call during render on the server: it returns false there. */
export function track(name: string, params: AnalyticsParams = {}): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { gtag?: unknown; dataLayer?: unknown };
  return dispatch({ consent: readConsent(), gtag: w.gtag, dataLayer: w.dataLayer }, name, params);
}

/**
 * GA4's `purchase` shape from a booking. `value` is the booking total in
 * major units; the item is the package, quantity the seats. The reference
 * is the transaction id, which is what lets GA de-duplicate a refresh of the
 * confirmation page on its side as well as ours.
 */
export function purchaseParams(booking: {
  reference: string;
  currency: string;
  totalCents: number;
  packageId: string;
  packageName: string;
  seats: number;
}): AnalyticsParams {
  const value = booking.totalCents / 100;
  return {
    transaction_id: booking.reference,
    currency: booking.currency,
    value,
    items: [
      {
        item_id: booking.packageId,
        item_name: booking.packageName,
        quantity: booking.seats,
        price: booking.seats > 0 ? Math.round((value / booking.seats) * 100) / 100 : value,
      },
    ],
  };
}
