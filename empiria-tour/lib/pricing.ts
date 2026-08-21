/**
 * The quote engine.
 *
 * Pure functions, no database, no `server-only`. That is the whole point: the
 * booking flow needs a price to update the instant somebody adds a child, and
 * the server needs the authoritative number to write into `booking_price_lines`
 * — and those two must never be able to disagree. One module, called from both
 * sides, is the only version of that which stays true. The alternative (display
 * arithmetic in the component, real arithmetic on the server) drifts on the
 * first change either side and nobody notices until a traveller is charged
 * something other than what they were shown.
 *
 * The server still recomputes from the database before writing. Sharing the
 * code is not the same as trusting the client's answer.
 *
 * Everything is integer cents. No floats touch money here.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * A tax or fee, as stored in `platform_settings.tax_rates`.
 *
 * The column is untyped jsonb, so this is the contract:
 *
 *   { "label": "HST", "kind": "tax", "basis": "percent",     "value": 13   }
 *   { "label": "Booking fee", "kind": "fee", "basis": "per_booking", "value": 2500 }
 *   { "label": "Levy", "kind": "fee", "basis": "per_person",  "value": 350  }
 *
 * `value` is percentage points for `percent`, and cents otherwise.
 */
export type TaxRule = {
  label: string;
  kind: 'tax' | 'fee';
  basis: 'percent' | 'per_booking' | 'per_person';
  value: number;
};

export type RoomTypeInput = {
  id: string;
  name: string;
  priceAdjustmentCents: number;
  maxOccupancy: number;
  isDefault: boolean;
};

export type ExtraInput = {
  id: string;
  name: string;
  priceCents: number;
  /** 'person' — priced per traveller; 'booking' — one charge however many go. */
  per: string;
  capacity: number | null;
};

export type PromotionInput = {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
};

export type DepositRule = {
  type: string;
  value: number;
  balanceDueDaysBefore: number;
};

/** Everything needed to price a departure, with the departure overrides already resolved. */
export type PricingInputs = {
  currency: string;
  /** Per adult. Departure override applied by the caller. */
  adultPriceCents: number;
  /** Null falls back to the adult price — a child who is not priced separately is priced as an adult. */
  childPriceCents: number | null;
  /** Null falls back to free. Infants are usually carried, not sold. */
  infantPriceCents: number | null;
  singleSupplementCents: number;
  roomTypes: RoomTypeInput[];
  extras: ExtraInput[];
  deposit: DepositRule;
  taxRules: TaxRule[];
  /** ISO date of the departure, for the balance-due deadline. */
  departureStartsOn: string | null;
};

export type Party = {
  adults: number;
  children: number;
  infants: number;
};

export type Selection = {
  party: Party;
  roomTypeId: string | null;
  /** extraId → quantity. Zero or missing means not taken. */
  extras: Record<string, number>;
  promotion: PromotionInput | null;
};

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Mirrors `booking_price_lines.kind` exactly — these strings are persisted. */
export type LineKind =
  | 'base_fare' | 'child_fare' | 'infant_fare' | 'single_supplement'
  | 'room_adjustment' | 'extra' | 'discount' | 'tax' | 'fee';

export type QuoteLine = {
  kind: LineKind;
  label: string;
  /** Human-readable working, e.g. "$1,850 × 2". Display only; never persisted. */
  detail?: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
  extraId?: string | null;
  sortOrder: number;
};

export type Quote = {
  currency: string;
  lines: QuoteLine[];
  /** Fares, supplement, room and extras — before discount, fees or tax. */
  subtotalCents: number;
  /** Positive magnitude, matching `bookings.discount_cents`. The line carries it negative. */
  discountCents: number;
  feesCents: number;
  taxCents: number;
  totalCents: number;
  depositDueCents: number;
  /** What is left after the deposit. Zero when paying in full. */
  balanceCents: number;
  balanceDueOn: string | null;
  /** Adults + children. Infants travel on a lap and do not occupy one. */
  seats: number;
  /** Every person on the manifest, infants included. */
  headcount: number;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Seats consumed by a party. Infants do not take one — see `create_booking` in 0005. */
export function seatsFor(party: Party): number {
  return Math.max(0, party.adults) + Math.max(0, party.children);
}

export function headcountFor(party: Party): number {
  return seatsFor(party) + Math.max(0, party.infants);
}

/**
 * Price a selection.
 *
 * Order of operations, stated because it is a judgement call and Part D means
 * somebody may one day have to defend it:
 *
 *   1. Fares, single supplement, room adjustment, extras  → subtotal
 *   2. Promotion discount, applied to the subtotal        → negative line
 *   3. Fees (flat, or per person)
 *   4. Tax, charged on everything above it
 *
 * Tax last and on the full amount is the conservative reading: it is what is
 * actually charged, so it is what is actually taxed. Discounting before tax
 * means the traveller is not taxed on money they did not pay.
 */
export function quote(inputs: PricingInputs, selection: Selection): Quote {
  const party = {
    adults: Math.max(0, selection.party.adults),
    children: Math.max(0, selection.party.children),
    infants: Math.max(0, selection.party.infants),
  };
  const seats = seatsFor(party);
  const headcount = headcountFor(party);
  const lines: QuoteLine[] = [];

  const adultUnit = inputs.adultPriceCents;
  const childUnit = inputs.childPriceCents ?? adultUnit;
  const infantUnit = inputs.infantPriceCents ?? 0;

  if (party.adults > 0) {
    lines.push({
      kind: 'base_fare',
      label: party.adults === 1 ? 'Adult' : 'Adults',
      detail: `${money(adultUnit, inputs.currency)} × ${party.adults}`,
      quantity: party.adults,
      unitCents: adultUnit,
      amountCents: adultUnit * party.adults,
      sortOrder: lines.length,
    });
  }

  if (party.children > 0) {
    lines.push({
      kind: 'child_fare',
      label: party.children === 1 ? 'Child' : 'Children',
      detail: `${money(childUnit, inputs.currency)} × ${party.children}`,
      quantity: party.children,
      unitCents: childUnit,
      amountCents: childUnit * party.children,
      sortOrder: lines.length,
    });
  }

  // Infants get a line even at zero, because "no charge" is information the
  // traveller wants confirmed rather than inferred from an absence.
  if (party.infants > 0) {
    lines.push({
      kind: 'infant_fare',
      label: party.infants === 1 ? 'Infant' : 'Infants',
      detail: infantUnit === 0 ? 'No charge' : `${money(infantUnit, inputs.currency)} × ${party.infants}`,
      quantity: party.infants,
      unitCents: infantUnit,
      amountCents: infantUnit * party.infants,
      sortOrder: lines.length,
    });
  }

  // One traveller in a room built for two pays for the empty half.
  if (seats === 1 && inputs.singleSupplementCents > 0) {
    lines.push({
      kind: 'single_supplement',
      label: 'Single supplement',
      quantity: 1,
      unitCents: inputs.singleSupplementCents,
      amountCents: inputs.singleSupplementCents,
      sortOrder: lines.length,
    });
  }

  const room = inputs.roomTypes.find((r) => r.id === selection.roomTypeId);
  if (room && room.priceAdjustmentCents !== 0 && seats > 0) {
    // Charged per occupied seat, not per head: an infant on a lap does not
    // upgrade anybody's room.
    lines.push({
      kind: 'room_adjustment',
      label: room.name,
      detail: `${money(room.priceAdjustmentCents, inputs.currency)} × ${seats}`,
      quantity: seats,
      unitCents: room.priceAdjustmentCents,
      amountCents: room.priceAdjustmentCents * seats,
      sortOrder: lines.length,
    });
  }

  // Iterate the catalogue rather than the selection, so extras always appear in
  // the order Empiria arranged them and an unknown id in the selection is
  // ignored instead of priced.
  for (const extra of inputs.extras) {
    const requested = selection.extras[extra.id] ?? 0;
    if (requested <= 0) continue;
    const units = extra.per === 'person' ? clamp(requested, 1, headcount) : 1;
    lines.push({
      kind: 'extra',
      label: extra.name,
      detail: extra.per === 'person' ? `${money(extra.priceCents, inputs.currency)} × ${units}` : undefined,
      quantity: units,
      unitCents: extra.priceCents,
      amountCents: extra.priceCents * units,
      extraId: extra.id,
      sortOrder: lines.length,
    });
  }

  const subtotalCents = sum(lines);

  // ---- discount -----------------------------------------------------------
  let discountCents = 0;
  const promo = selection.promotion;
  if (promo && subtotalCents > 0) {
    discountCents =
      promo.discountType === 'percent'
        ? Math.round((subtotalCents * promo.discountValue) / 100)
        : promo.discountValue;
    discountCents = clamp(discountCents, 0, subtotalCents);

    if (discountCents > 0) {
      lines.push({
        kind: 'discount',
        label: `Promotion ${promo.code}`,
        detail:
          promo.discountType === 'percent' ? `${promo.discountValue}% off` : undefined,
        quantity: 1,
        unitCents: -discountCents,
        amountCents: -discountCents,
        sortOrder: lines.length,
      });
    }
  }

  // ---- fees ---------------------------------------------------------------
  let feesCents = 0;
  for (const rule of inputs.taxRules) {
    if (rule.kind !== 'fee') continue;
    let amount = 0;
    let quantity = 1;
    if (rule.basis === 'per_booking') {
      amount = rule.value;
    } else if (rule.basis === 'per_person') {
      quantity = headcount;
      amount = rule.value * headcount;
    } else {
      // A percentage fee is charged on the discounted subtotal, like tax.
      amount = Math.round(((subtotalCents - discountCents) * rule.value) / 100);
    }
    if (amount === 0) continue;
    feesCents += amount;
    lines.push({
      kind: 'fee',
      label: rule.label,
      detail: rule.basis === 'per_person' ? `× ${headcount}` : undefined,
      quantity,
      unitCents: rule.basis === 'per_person' ? rule.value : amount,
      amountCents: amount,
      sortOrder: lines.length,
    });
  }

  // ---- tax ----------------------------------------------------------------
  const taxable = subtotalCents - discountCents + feesCents;
  let taxCents = 0;
  for (const rule of inputs.taxRules) {
    if (rule.kind !== 'tax') continue;
    let amount = 0;
    let quantity = 1;
    if (rule.basis === 'percent') {
      amount = Math.round((taxable * rule.value) / 100);
    } else if (rule.basis === 'per_person') {
      quantity = headcount;
      amount = rule.value * headcount;
    } else {
      amount = rule.value;
    }
    if (amount === 0) continue;
    taxCents += amount;
    lines.push({
      kind: 'tax',
      label: rule.basis === 'percent' ? `${rule.label} (${rule.value}%)` : rule.label,
      detail: rule.basis === 'per_person' ? `× ${headcount}` : undefined,
      quantity,
      unitCents: rule.basis === 'per_person' ? rule.value : amount,
      amountCents: amount,
      sortOrder: lines.length,
    });
  }

  const totalCents = subtotalCents - discountCents + feesCents + taxCents;

  // ---- deposit ------------------------------------------------------------
  let depositDueCents = 0;
  if (inputs.deposit.type === 'percent') {
    depositDueCents = Math.round((totalCents * inputs.deposit.value) / 100);
  } else if (inputs.deposit.type === 'fixed') {
    depositDueCents = inputs.deposit.value;
  }
  depositDueCents = clamp(depositDueCents, 0, totalCents);
  // A "deposit" that happens to equal the total is just paying in full, and
  // offering it as a choice between two identical amounts is confusing.
  if (depositDueCents === totalCents) depositDueCents = 0;

  return {
    currency: inputs.currency,
    lines,
    subtotalCents,
    discountCents,
    feesCents,
    taxCents,
    totalCents,
    depositDueCents,
    balanceCents: depositDueCents > 0 ? totalCents - depositDueCents : 0,
    balanceDueOn:
      depositDueCents > 0
        ? shiftDate(inputs.departureStartsOn, -inputs.deposit.balanceDueDaysBefore)
        : null,
    seats,
    headcount,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type SelectionProblem = { field: 'party' | 'room' | 'seats'; message: string };

/**
 * Reasons a selection cannot be booked, in the traveller's words. Separate from
 * `quote()` because a selection can be priceable and still not bookable — an
 * over-capacity party has a perfectly good total, it just cannot travel.
 */
export function validateSelection(
  inputs: PricingInputs,
  selection: Selection,
  seatsAvailable: number
): SelectionProblem[] {
  const problems: SelectionProblem[] = [];
  const party = selection.party;
  const seats = seatsFor(party);

  if (seats < 1) {
    problems.push({ field: 'party', message: 'A booking needs at least one adult or child.' });
  }
  if (party.adults < 1 && party.children > 0) {
    problems.push({ field: 'party', message: 'Children cannot travel without an adult on the booking.' });
  }
  if (party.infants > party.adults) {
    problems.push({
      field: 'party',
      message: 'Each infant travels on an adult’s lap, so there cannot be more infants than adults.',
    });
  }
  if (seats > seatsAvailable) {
    problems.push({
      field: 'seats',
      message:
        seatsAvailable === 0
          ? 'That departure is now full.'
          : `Only ${seatsAvailable} ${seatsAvailable === 1 ? 'place is' : 'places are'} left on that departure.`,
    });
  }

  const room = inputs.roomTypes.find((r) => r.id === selection.roomTypeId);
  if (room && seats > room.maxOccupancy) {
    problems.push({
      field: 'room',
      message: `${room.name} sleeps ${room.maxOccupancy}. Choose another room or split the party across two bookings.`,
    });
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sum(lines: QuoteLine[]): number {
  return lines.reduce((n, l) => n + l.amountCents, 0);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Shift a plain calendar date by whole days, staying in UTC so no timezone bends it. */
function shiftDate(iso: string | null, days: number): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * A deliberately small formatter, used only for the `detail` strings above.
 * Display formatting proper lives in `lib/money.ts`; duplicating `Intl` options
 * here would let the working shown beside a line disagree with the line itself.
 */
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Parse whatever is in `platform_settings.tax_rates`, discarding anything malformed. */
export function parseTaxRules(raw: unknown): TaxRule[] {
  if (!Array.isArray(raw)) return [];
  const out: TaxRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const value = typeof r.value === 'number' ? r.value : Number(r.value);
    const kind = r.kind === 'fee' ? 'fee' : 'tax';
    const basis =
      r.basis === 'per_booking' || r.basis === 'per_person' ? r.basis : 'percent';
    // A rule with no label or a nonsense value would appear on an invoice as an
    // unexplained charge. Dropping it is the safer failure.
    if (!label || !Number.isFinite(value) || value < 0) continue;
    out.push({ label, kind, basis, value });
  }
  return out;
}
