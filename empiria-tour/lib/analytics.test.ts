import { route, dispatch, purchaseParams } from './analytics';

/**
 * The analytics seam: nothing leaves without consent and a provider.
 *
 *   bun run lib/analytics.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const yes = { analytics: true, decidedAt: '2026-09-13T00:00:00Z' };
const no = { analytics: false, decidedAt: '2026-09-13T00:00:00Z' };

// ── the gate ────────────────────────────────────────────────────────────────
eq('undecided (pre-hydration) → nowhere', route({ consent: undefined, gtag: () => {} }), 'no-consent');
eq('not yet decided → nowhere', route({ consent: null, gtag: () => {} }), 'no-consent');
eq('declined → nowhere, even with a provider on the page', route({ consent: no, gtag: () => {}, dataLayer: [] }), 'no-consent');
eq('accepted but no provider configured → nowhere', route({ consent: yes }), 'no-provider');
eq('accepted + gtag.js → gtag', route({ consent: yes, gtag: () => {}, dataLayer: [] }), 'gtag');
eq('accepted + GTM only → dataLayer', route({ consent: yes, dataLayer: [] }), 'dataLayer');
eq('a dataLayer that is not an array is not a provider', route({ consent: yes, dataLayer: {} }), 'no-provider');

// ── the send ────────────────────────────────────────────────────────────────
const calls: unknown[][] = [];
const gtag = (...args: unknown[]) => { calls.push(args); };
eq('gtag receives ("event", name, params)', dispatch({ consent: yes, gtag }, 'search', { search_term: 'crete' }), true);
eq('  …exactly', calls, [['event', 'search', { search_term: 'crete' }]]);

const layer: unknown[] = [];
eq('GTM receives one object with `event`', dispatch({ consent: yes, dataLayer: layer }, 'begin_checkout', { currency: 'CAD', value: 12 }), true);
eq('  …exactly', layer, [{ event: 'begin_checkout', currency: 'CAD', value: 12 }]);

const untouched: unknown[] = [];
eq('declined: nothing sent', dispatch({ consent: no, gtag, dataLayer: untouched }, 'purchase'), false);
eq('  …and nothing pushed', [calls.length, untouched.length], [1, 0]);
eq('no provider: false, not an error', dispatch({ consent: yes }, 'purchase'), false);

// ── the purchase shape ──────────────────────────────────────────────────────
eq(
  'purchase: GA4 ecommerce shape, cents → major units',
  purchaseParams({ reference: 'ET-2026-0001', currency: 'CAD', totalCents: 359800, packageId: 'p1', packageName: 'Crete', seats: 2 }),
  { transaction_id: 'ET-2026-0001', currency: 'CAD', value: 3598, items: [{ item_id: 'p1', item_name: 'Crete', quantity: 2, price: 1799 }] }
);
eq('purchase: an odd split rounds to cents', (purchaseParams({ reference: 'r', currency: 'CAD', totalCents: 100000, packageId: 'p', packageName: 'n', seats: 3 }).items as { price: number }[])[0].price, 333.33);
eq('purchase: zero seats does not divide by zero', (purchaseParams({ reference: 'r', currency: 'CAD', totalCents: 5000, packageId: 'p', packageName: 'n', seats: 0 }).items as { price: number }[])[0].price, 50);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
