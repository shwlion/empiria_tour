import Stripe from 'stripe';

/**
 * Stripe, server-side only.
 *
 * Empiria is the merchant of record for every booking (§2.2), so there is one
 * account and no Connect. Cards are handled by Stripe's hosted Checkout rather
 * than an embedded element: for a regulated seller that is the smaller PCI
 * surface — no card detail ever reaches this application, in the browser or on
 * the server — and it brings 3-D Secure, wallets and receipts without any of it
 * being our code to get wrong.
 *
 * Returns null when unconfigured, so the site still runs. Every payment path
 * uses `requireStripe()` instead, which refuses rather than silently no-opping:
 * a checkout button that does nothing is worse than one that explains itself.
 */

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    cached = new Stripe(key, {
      // No `apiVersion` here, deliberately.
      //
      // Stripe ships breaking changes behind dated versions, so pinning one
      // looks like the careful choice — but the SDK's types accept exactly the
      // single version that SDK was built against, so a hardcoded string is not
      // an independent pin at all. It is a duplicate of the SDK version that
      // fails to compile the moment the two drift, which is what happened here.
      //
      // The real pin is the lockfile: it fixes the SDK, and the SDK fixes the
      // API version. Upgrading Stripe is therefore the deliberate act that
      // changes payload shapes, and it is visible in a diff of package.json.
      appInfo: { name: 'Empiria Tours', version: '1.0.0' },
      typescript: true,
    });
  }
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set, so payment is switched off. Add it to .env.local — see .env.local.example.'
    );
  }
  return stripe;
}

/** True while the key is a test key. The UI says so, loudly, so nobody demos a live charge by accident. */
export function isTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
}

/**
 * Stripe's smallest-unit convention against ours.
 *
 * Both are integer minor units for every currency this platform prices in
 * (CAD, USD, EUR, GBP), so the conversion is the identity — but zero-decimal
 * currencies like JPY are NOT, and if Empiria ever adds one this is the single
 * place that has to learn about it rather than a hundred call sites.
 */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

export function toStripeAmount(cents: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? Math.round(cents / 100) : cents;
}

export function fromStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount * 100 : amount;
}
