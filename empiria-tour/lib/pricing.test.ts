import { quote, validateSelection, parseTaxRules, seatsFor } from './pricing';
import type { PricingInputs, Selection } from './pricing';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

const base: PricingInputs = {
  currency: 'CAD',
  adultPriceCents: 329000,
  childPriceCents: 148000,
  infantPriceCents: 0,
  singleSupplementCents: 65000,
  roomTypes: [
    { id: 'twin', name: 'Twin share', priceAdjustmentCents: 0, maxOccupancy: 2, isDefault: true },
    { id: 'sea',  name: 'Deluxe sea view', priceAdjustmentCents: 42000, maxOccupancy: 2, isDefault: false },
  ],
  extras: [
    { id: 'transfer', name: 'Airport transfer', priceCents: 6500, per: 'person', capacity: null },
    { id: 'insure',   name: 'Trip insurance',   priceCents: 19000, per: 'booking', capacity: null },
  ],
  deposit: { type: 'percent', value: 20, balanceDueDaysBefore: 30 },
  taxRules: [
    { label: 'Booking fee', kind: 'fee', basis: 'per_booking', value: 2500 },
    { label: 'HST',         kind: 'tax', basis: 'percent',     value: 13 },
  ],
  departureStartsOn: '2027-05-04',
};

const sel = (over: Partial<Selection> = {}): Selection => ({
  party: { adults: 2, children: 0, infants: 0 },
  roomTypeId: 'twin',
  extras: {},
  promotion: null,
  ...over,
});

// --- the invariant the SQL function also enforces --------------------------
const reconciles = (q: ReturnType<typeof quote>) =>
  q.lines.reduce((n, l) => n + l.amountCents, 0) === q.totalCents;

// 1. Two adults, nothing else.
{
  const q = quote(base, sel());
  eq('2 adults subtotal', q.subtotalCents, 658000);
  eq('2 adults fees', q.feesCents, 2500);
  eq('2 adults tax (13% of 660500)', q.taxCents, 85865);
  eq('2 adults total', q.totalCents, 746365);
  eq('lines reconcile to total', reconciles(q), true);
  eq('deposit 20% of total', q.depositDueCents, 149273);
  eq('balance', q.balanceCents, 746365 - 149273);
  eq('balance due 30 days before 2027-05-04', q.balanceDueOn, '2027-04-04');
  eq('seats', q.seats, 2);
}

// 2. Infants take no seat and no money, but do appear.
{
  const q = quote(base, sel({ party: { adults: 2, children: 1, infants: 1 } }));
  eq('seats exclude infants', q.seats, 3);
  eq('headcount includes infants', q.headcount, 4);
  eq('infant line present at zero', q.lines.find((l) => l.kind === 'infant_fare')?.amountCents, 0);
  eq('subtotal = 2 adults + 1 child', q.subtotalCents, 658000 + 148000);
  eq('lines reconcile', reconciles(q), true);
}

// 3. Solo traveller pays the single supplement; two people do not.
{
  const solo = quote(base, sel({ party: { adults: 1, children: 0, infants: 0 } }));
  eq('solo pays supplement', solo.lines.some((l) => l.kind === 'single_supplement'), true);
  eq('solo subtotal', solo.subtotalCents, 329000 + 65000);
  const pair = quote(base, sel());
  eq('pair pays no supplement', pair.lines.some((l) => l.kind === 'single_supplement'), false);
}

// 4. Room adjustment is per seat, not per head.
{
  const q = quote(base, sel({ party: { adults: 2, children: 0, infants: 2 }, roomTypeId: 'sea' }));
  const room = q.lines.find((l) => l.kind === 'room_adjustment');
  eq('room charged for 2 seats not 4 heads', room?.quantity, 2);
  eq('room amount', room?.amountCents, 84000);
}

// 5. Extras: per-person is capped at the headcount; per-booking is charged once.
{
  const q = quote(base, sel({ party: { adults: 2, children: 0, infants: 0 }, extras: { transfer: 99, insure: 5 } }));
  const t = q.lines.find((l) => l.extraId === 'transfer');
  const i = q.lines.find((l) => l.extraId === 'insure');
  eq('per-person extra capped at headcount', t?.quantity, 2);
  eq('per-booking extra is one unit', i?.quantity, 1);
  eq('per-booking extra amount', i?.amountCents, 19000);
  eq('lines reconcile', reconciles(q), true);
}
{
  const q = quote(base, sel({ extras: { unknown: 3 } }));
  eq('unknown extra id is ignored, not priced', q.subtotalCents, 658000);
}

// 6. Promotion: discount before tax, capped at the subtotal, negative line.
{
  const q = quote(base, sel({ promotion: { id: 'p', code: 'SPRING10', discountType: 'percent', discountValue: 10 } }));
  eq('discount magnitude', q.discountCents, 65800);
  eq('discount line is negative', q.lines.find((l) => l.kind === 'discount')?.amountCents, -65800);
  eq('tax on the discounted amount', q.taxCents, Math.round((658000 - 65800 + 2500) * 0.13));
  eq('lines reconcile', reconciles(q), true);
}
{
  const q = quote(base, sel({ promotion: { id: 'p', code: 'HUGE', discountType: 'fixed', discountValue: 99900000 } }));
  eq('a discount cannot exceed the subtotal', q.discountCents, 658000);
  eq('total never goes negative', q.totalCents >= 0, true);
  eq('lines reconcile', reconciles(q), true);
}

// 7. Deposit rules.
{
  const noDeposit = quote({ ...base, deposit: { type: 'none', value: 0, balanceDueDaysBefore: 30 } }, sel());
  eq('no deposit rule -> pay in full', noDeposit.depositDueCents, 0);
  eq('no deposit -> no balance date', noDeposit.balanceDueOn, null);

  const fixed = quote({ ...base, deposit: { type: 'fixed', value: 50000, balanceDueDaysBefore: 45 } }, sel());
  eq('fixed deposit', fixed.depositDueCents, 50000);
  eq('fixed deposit balance date', fixed.balanceDueOn, '2027-03-20');

  const silly = quote({ ...base, deposit: { type: 'fixed', value: 99900000, balanceDueDaysBefore: 30 } }, sel());
  eq('a deposit equal to the total is not offered as a deposit', silly.depositDueCents, 0);
}

// 8. Validation.
{
  eq('over capacity', validateSelection(base, sel({ party: { adults: 5, children: 0, infants: 0 } }), 3)
      .some((p) => p.field === 'seats'), true);
  eq('empty party', validateSelection(base, sel({ party: { adults: 0, children: 0, infants: 0 } }), 9)
      .some((p) => p.field === 'party'), true);
  eq('children need an adult', validateSelection(base, sel({ party: { adults: 0, children: 2, infants: 0 } }), 9)
      .some((p) => p.field === 'party'), true);
  eq('more infants than laps', validateSelection(base, sel({ party: { adults: 1, children: 0, infants: 2 } }), 9)
      .some((p) => p.field === 'party'), true);
  eq('room too small', validateSelection(base, sel({ party: { adults: 4, children: 0, infants: 0 }, roomTypeId: 'twin' }), 9)
      .some((p) => p.field === 'room'), true);
  eq('a good selection has no problems', validateSelection(base, sel(), 9), []);
}

// 9. tax_rates parsing is defensive — it is untyped jsonb Empiria edits by hand.
{
  eq('malformed rules are dropped', parseTaxRules([
    { label: 'HST', kind: 'tax', basis: 'percent', value: 13 },
    { label: '', kind: 'tax', basis: 'percent', value: 5 },
    { label: 'Negative', kind: 'fee', basis: 'per_booking', value: -100 },
    { label: 'NaN', kind: 'tax', basis: 'percent', value: 'abc' },
    'not an object',
    null,
  ]), [{ label: 'HST', kind: 'tax', basis: 'percent', value: 13 }]);
  eq('non-array is empty', parseTaxRules({ label: 'x' }), []);
  eq('unknown basis falls back to percent', parseTaxRules([{ label: 'X', kind: 'tax', basis: 'weird', value: 1 }]),
     [{ label: 'X', kind: 'tax', basis: 'percent', value: 1 }]);
}

// 10. Child price falls back to the adult price when none is set.
{
  const q = quote({ ...base, childPriceCents: null }, sel({ party: { adults: 1, children: 1, infants: 0 } }));
  eq('child priced as an adult when unpriced', q.lines.find((l) => l.kind === 'child_fare')?.unitCents, 329000);
}

// 11. Everything reconciles across a sweep of parties.
{
  let allReconcile = true;
  for (let a = 0; a <= 4; a++) for (let c = 0; c <= 3; c++) for (let i = 0; i <= 2; i++) {
    const q = quote(base, sel({ party: { adults: a, children: c, infants: i }, roomTypeId: 'sea', extras: { transfer: 2, insure: 1 },
      promotion: { id: 'p', code: 'X', discountType: 'percent', discountValue: 7 } }));
    if (!reconciles(q)) allReconcile = false;
    if (q.seats !== seatsFor({ adults: a, children: c, infants: i })) allReconcile = false;
  }
  eq('60 party combinations all reconcile', allReconcile, true);
}

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
