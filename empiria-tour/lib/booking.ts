/**
 * The booking flow's data layer — Exhibit A A5.
 *
 * SERVER ONLY, for the same reason as `lib/catalogue.ts`: everything here holds
 * the service-role key. The guard below fails loudly rather than silently
 * shipping it to a browser.
 *
 * Two rules this module exists to enforce:
 *
 *   1. **Seats are claimed in the database, never in the application.** Every
 *      reservation goes through `claim_seats`, which takes a row lock on the
 *      departure. Counting seats in JavaScript and writing the result back is a
 *      race, and the thing being raced over is somebody's holiday.
 *
 *   2. **The price is recomputed here before anything is written.** The browser
 *      runs the same `lib/pricing.ts` for instant feedback, but what gets
 *      charged is computed from freshly-read database rows at the moment of
 *      creation. A price a browser calculated is not a price anyone should be
 *      charged.
 */

import { getSupabaseAdmin } from '@/lib/supabase';
import {
  quote,
  parseTaxRules,
  seatsFor,
  type PricingInputs,
  type Selection,
  type Quote,
  type Party,
  type PromotionInput,
} from '@/lib/pricing';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/booking.ts is server-only: it uses the service-role key. ' +
      'Call it from a server component or a server action.'
  );
}

// ─── Types ────────────────────────────────────────────────────────────────

export type BookingDisclosure = {
  id: string;
  slug: string;
  name: string;
  body: string;
  requiresAcknowledgement: boolean;
};

/** The five placements Exhibit A defines inside the booking flow, in order. */
export type BookingStepKey =
  | 'booking_travellers'
  | 'booking_additional'
  | 'booking_review'
  | 'booking_terms'
  | 'booking_payment';

export type CustomField = {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  options: string[] | null;
  isRequired: boolean;
  appliesTo: string;
};

export type BookingContext = {
  currency: string;
  package: {
    id: string;
    slug: string;
    title: string;
    heroImage: string | null;
    durationLabel: string | null;
    destination: string | null;
    minimumAge: number | null;
  };
  departure: {
    id: string;
    startsOn: string;
    endsOn: string | null;
    startTime: string | null;
    seatsAvailable: number;
  };
  /** Everything `quote()` needs. Passed to the client so it can price live. */
  pricing: PricingInputs;
  customFields: CustomField[];
  disclosures: Record<BookingStepKey, BookingDisclosure[]>;
  holdMinutes: number;
  /** Part D: rendered in the flow so the seller is identified before payment. */
  seller: { name: string | null; registrationNumber: string | null; statutoryNotice: string | null };
};

export type TravellerInput = {
  position: number;
  travellerType: 'adult' | 'child' | 'infant';
  legalName: string;
  dateOfBirth: string | null;
  isLead: boolean;
  dietaryNotes: string | null;
  accessibilityNotes: string | null;
  emergencyContact: { name?: string; phone?: string; relationship?: string } | null;
};

export type AcknowledgementInput = {
  blockId: string;
  label: string;
  bodySnapshot: string;
};

export type BookingDraft = {
  departureId: string;
  holdId: string;
  sessionToken: string;
  currency: string;
  userId: string | null;
  lead: {
    name: string;
    email: string;
    phone: string | null;
    address: Record<string, string> | null;
  };
  party: Party;
  roomTypeId: string | null;
  extras: Record<string, number>;
  promotionCode: string | null;
  travellers: TravellerInput[];
  customFields: { fieldId: string; travellerPosition: number | null; value: string }[];
  acknowledgements: AcknowledgementInput[];
  /** What the traveller was shown. If the server disagrees, nobody is charged. */
  expectedTotalCents: number;
  ipAddress: string | null;
  userAgent: string | null;
};

export type HoldResult =
  | { ok: true; holdId: string; seats: number; expiresAt: string }
  | { ok: false; message: string };

export type CreateBookingResult =
  | { ok: true; reference: string; bookingId: string; quote: Quote }
  | { ok: false; reason: 'price_changed'; quote: Quote; message: string }
  | { ok: false; reason: 'failed'; message: string };

// ─── Reading the context ──────────────────────────────────────────────────

const BOOKING_PLACEMENTS: BookingStepKey[] = [
  'booking_travellers',
  'booking_additional',
  'booking_review',
  'booking_terms',
  'booking_payment',
];

/**
 * Everything the flow needs for one departure, in one round of queries.
 *
 * Returns null when the departure cannot be sold — closed, past, or with no
 * price in the requested currency. Empiria sets prices per currency rather than
 * converting at read time, so "no row for CAD" means "not for sale in CAD", not
 * "convert something".
 */
export async function getBookingContext(
  departureId: string,
  currency: string
): Promise<BookingContext | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  // Return anything a lapsed hold is still counting before reading availability,
  // so the flow never opens on a seat count that is quietly out of date.
  await db.rpc('expire_stale_holds', { p_departure: departureId });

  const { data: dep } = await db
    .from('departures')
    .select(
      'id, package_id, starts_on, ends_on, start_time, capacity, seats_booked, seats_held, status, sales_open_at, sales_close_at'
    )
    .eq('id', departureId)
    .maybeSingle();
  if (!dep) return null;

  const now = new Date();
  const saleClosed =
    dep.status !== 'open' ||
    (dep.sales_open_at != null && new Date(dep.sales_open_at) > now) ||
    (dep.sales_close_at != null && new Date(dep.sales_close_at) < now) ||
    dep.starts_on < now.toISOString().slice(0, 10);
  if (saleClosed) return null;

  const [
    { data: pkg },
    { data: pkgPrice },
    { data: depPrice },
    { data: rooms },
    { data: extras },
    { data: fields },
    { data: settings },
    { data: placements },
  ] = await Promise.all([
    db
      .from('packages')
      .select(
        'id, slug, title, hero_image, duration_label, minimum_age, currency, base_price_cents, child_price_cents, infant_price_cents, single_supplement_cents, deposit_type, deposit_value, balance_due_days_before, status, destinations ( name )'
      )
      .eq('id', dep.package_id)
      .maybeSingle(),
    db
      .from('package_prices')
      .select('base_price_cents, child_price_cents, infant_price_cents, single_supplement_cents')
      .eq('package_id', dep.package_id)
      .eq('currency', currency)
      .maybeSingle(),
    db
      .from('departure_prices')
      .select('base_price_cents, child_price_cents')
      .eq('departure_id', departureId)
      .eq('currency', currency)
      .maybeSingle(),
    db
      .from('room_types')
      .select('id, name, description, price_adjustment_cents, max_occupancy, is_default, sort_order')
      .eq('package_id', dep.package_id)
      .order('sort_order'),
    db
      .from('package_extras')
      .select('id, name, description, price_cents, per, capacity, sort_order')
      .eq('package_id', dep.package_id)
      .eq('status', 'active')
      .order('sort_order'),
    db
      .from('package_custom_fields')
      .select('id, key, label, field_type, options, is_required, applies_to, sort_order')
      .eq('package_id', dep.package_id)
      .order('sort_order'),
    db
      .from('platform_settings')
      .select('company_name, registration_number, statutory_notice, hold_minutes, tax_rates')
      .maybeSingle(),
    db
      .from('disclosure_placements')
      .select(
        'placement, package_id, sort_order, disclosure_blocks!inner ( id, slug, name, body, requires_acknowledgement, status )'
      )
      .in('placement', BOOKING_PLACEMENTS)
      .eq('disclosure_blocks.status', 'active')
      .order('sort_order'),
  ]);

  if (!pkg || pkg.status !== 'published') return null;

  // Price resolution, most specific first: this departure in this currency, then
  // the package in this currency, then the package's own base column — but only
  // when the request is for the currency that column is denominated in.
  const sameCurrency = pkg.currency === currency;
  const adultPriceCents =
    depPrice?.base_price_cents ??
    pkgPrice?.base_price_cents ??
    (sameCurrency ? pkg.base_price_cents : null);
  if (adultPriceCents == null) return null;

  const pricing: PricingInputs = {
    currency,
    adultPriceCents,
    childPriceCents:
      depPrice?.child_price_cents ??
      pkgPrice?.child_price_cents ??
      (sameCurrency ? pkg.child_price_cents : null),
    infantPriceCents:
      pkgPrice?.infant_price_cents ?? (sameCurrency ? pkg.infant_price_cents : null),
    singleSupplementCents:
      pkgPrice?.single_supplement_cents ??
      (sameCurrency ? pkg.single_supplement_cents : 0) ??
      0,
    roomTypes: (rooms ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      priceAdjustmentCents: r.price_adjustment_cents,
      maxOccupancy: r.max_occupancy,
      isDefault: r.is_default,
    })),
    extras: (extras ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      priceCents: e.price_cents,
      per: e.per,
      capacity: e.capacity,
    })),
    deposit: {
      type: pkg.deposit_type,
      value: pkg.deposit_value,
      balanceDueDaysBefore: pkg.balance_due_days_before,
    },
    taxRules: parseTaxRules(settings?.tax_rates),
    departureStartsOn: dep.starts_on,
  };

  const disclosures = Object.fromEntries(
    BOOKING_PLACEMENTS.map((p) => [p, [] as BookingDisclosure[]])
  ) as Record<BookingStepKey, BookingDisclosure[]>;

  type PlacementRow = {
    placement: string;
    package_id: string | null;
    disclosure_blocks: {
      id: string; slug: string; name: string; body: string; requires_acknowledgement: boolean;
    };
  };
  for (const row of (placements ?? []) as unknown as PlacementRow[]) {
    // A placement scoped to another package must not leak into this flow.
    // PostgREST cannot express "null or this id" on an embedded filter without
    // dropping parents, so the narrowing happens here.
    if (row.package_id != null && row.package_id !== pkg.id) continue;
    const key = row.placement as BookingStepKey;
    if (!disclosures[key]) continue;
    const b = row.disclosure_blocks;
    disclosures[key].push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      body: b.body,
      requiresAcknowledgement: b.requires_acknowledgement,
    });
  }

  const destination = (pkg as { destinations?: { name: string } | null }).destinations ?? null;

  return {
    currency,
    package: {
      id: pkg.id,
      slug: pkg.slug,
      title: pkg.title,
      heroImage: pkg.hero_image,
      durationLabel: pkg.duration_label,
      destination: destination?.name ?? null,
      minimumAge: pkg.minimum_age,
    },
    departure: {
      id: dep.id,
      startsOn: dep.starts_on,
      endsOn: dep.ends_on,
      startTime: dep.start_time,
      seatsAvailable: Math.max(dep.capacity - dep.seats_booked - dep.seats_held, 0),
    },
    pricing,
    customFields: (fields ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      fieldType: f.field_type,
      options: f.options,
      isRequired: f.is_required,
      appliesTo: f.applies_to,
    })),
    disclosures,
    holdMinutes: settings?.hold_minutes ?? 20,
    seller: {
      name: settings?.company_name ?? null,
      registrationNumber: settings?.registration_number ?? null,
      statutoryNotice: settings?.statutory_notice ?? null,
    },
  };
}

// ─── Holding seats ────────────────────────────────────────────────────────

/**
 * Reserve seats for this session. Adjusts an existing hold rather than stacking
 * a second one, so going back a step to change the party is safe.
 */
export async function claimSeats(
  departureId: string,
  seats: number,
  sessionToken: string,
  userId: string | null
): Promise<HoldResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, message: 'Bookings are not available right now.' };

  const { data, error } = await db.rpc('claim_seats', {
    p_departure: departureId,
    p_seats: seats,
    p_session: sessionToken,
    ...(userId ? { p_user: userId } : {}),
  });

  if (error || !data) return { ok: false, message: friendly(error?.message) };
  return { ok: true, holdId: data.id, seats: data.seats, expiresAt: data.expires_at };
}

/** Push the hold's window out. Returns null when it had already lapsed. */
export async function extendHold(
  holdId: string,
  sessionToken: string
): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db.rpc('extend_hold', { p_hold: holdId, p_session: sessionToken });
  return (data as string | null) ?? null;
}

/** Give the seats back — leaving the flow, or changing departure. */
export async function releaseHold(holdId: string, sessionToken: string): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return false;
  const { data } = await db.rpc('release_hold', { p_hold: holdId, p_session: sessionToken });
  return data === true;
}

// ─── Creating the booking ─────────────────────────────────────────────────

/**
 * Recompute, then write.
 *
 * The quote is rebuilt from rows read now, not from anything the browser sent.
 * If it no longer matches what the traveller was shown, nothing is written and
 * the new figure comes back for them to accept — being charged a number you
 * were never shown is the one outcome worth failing the whole flow to avoid.
 */
export async function createBooking(draft: BookingDraft): Promise<CreateBookingResult> {
  const db = getSupabaseAdmin();
  if (!db) return { ok: false, reason: 'failed', message: 'Bookings are not available right now.' };

  const context = await getBookingContext(draft.departureId, draft.currency);
  if (!context) {
    return {
      ok: false,
      reason: 'failed',
      message: 'That departure is no longer on sale. Choose another date and we will start again.',
    };
  }

  const promotion = draft.promotionCode
    ? await lookupPromotion(draft.promotionCode, context.package.id, draft.currency, {
        userId: draft.userId,
        email: draft.lead.email,
      })
    : null;

  const selection: Selection = {
    party: draft.party,
    roomTypeId: draft.roomTypeId,
    extras: draft.extras,
    promotion,
  };
  const fresh = quote(context.pricing, selection);

  if (fresh.totalCents !== draft.expectedTotalCents) {
    return {
      ok: false,
      reason: 'price_changed',
      quote: fresh,
      message:
        'The price changed while you were booking. Nothing has been charged — please check the new total before continuing.',
    };
  }

  const { data, error } = await db.rpc('create_booking', {
    p_payload: {
      hold_id: draft.holdId,
      session_token: draft.sessionToken,
      departure_id: draft.departureId,
      package_id: context.package.id,
      user_id: draft.userId,
      lead: {
        name: draft.lead.name,
        email: draft.lead.email,
        phone: draft.lead.phone,
        address: draft.lead.address,
      },
      party: {
        adults: draft.party.adults,
        children: draft.party.children,
        infants: draft.party.infants,
      },
      room_type_id: draft.roomTypeId,
      single_supplement: fresh.lines.some((l) => l.kind === 'single_supplement'),
      currency: draft.currency,
      totals: {
        subtotal_cents: fresh.subtotalCents,
        discount_cents: fresh.discountCents,
        tax_cents: fresh.taxCents,
        fees_cents: fresh.feesCents,
        total_cents: fresh.totalCents,
        deposit_due_cents: fresh.depositDueCents,
      },
      balance_due_on: fresh.balanceDueOn,
      promotion_id: promotion?.id ?? null,
      price_lines: fresh.lines.map((l) => ({
        kind: l.kind,
        label: l.label,
        quantity: l.quantity,
        unit_cents: l.unitCents,
        amount_cents: l.amountCents,
        extra_id: l.extraId ?? null,
        sort_order: l.sortOrder,
      })),
      travellers: draft.travellers.map((t) => ({
        position: t.position,
        traveller_type: t.travellerType,
        legal_name: t.legalName,
        date_of_birth: t.dateOfBirth,
        is_lead: t.isLead,
        dietary_notes: t.dietaryNotes,
        accessibility_notes: t.accessibilityNotes,
        emergency_contact: t.emergencyContact,
      })),
      custom_fields: draft.customFields.map((f) => ({
        field_id: f.fieldId,
        traveller_position: f.travellerPosition == null ? null : String(f.travellerPosition),
        value: f.value,
      })),
      acknowledgements: draft.acknowledgements.map((a) => ({
        block_id: a.blockId,
        label: a.label,
        body_snapshot: a.bodySnapshot,
        ip_address: draft.ipAddress,
        user_agent: draft.userAgent,
      })),
    },
  });

  if (error || !data) {
    return { ok: false, reason: 'failed', message: friendly(error?.message) };
  }
  return { ok: true, reference: data.reference, bookingId: data.id, quote: fresh };
}

/**
 * Look up a promotion code and say whether this traveller may use it.
 *
 * Deliberately server-side only: `promotions` has no public read policy, so
 * codes cannot be enumerated from a browser. A code that does not apply comes
 * back with a `reason` rather than an error — the price simply does not change,
 * and the flow says why.
 *
 * Every rule here is courtesy. The one that holds is `check_promotion`, which
 * `create_booking` calls under a row lock (migration 0015); this exists so the
 * screen can say "you have already used that code" while it is being typed
 * rather than after the traveller has filled in four steps. If the two ever
 * disagree, the database wins and `friendly()` shows its sentence.
 */
export type PromotionLookup = {
  promotion: PromotionInput | null;
  /** Why it did not apply, in a sentence for the traveller. Null when it did. */
  reason: string | null;
};

export async function evaluatePromotion(
  code: string,
  packageId: string,
  currency: string,
  who: { userId?: string | null; email?: string | null } = {}
): Promise<PromotionLookup> {
  const db = getSupabaseAdmin();
  const refused = (reason: string): PromotionLookup => ({ promotion: null, reason });
  if (!db) return refused('Promotion codes are not available right now.');

  const { data: promo } = await db
    .from('promotions')
    .select(
      'id, code, discount_type, discount_value, currency, valid_from, valid_until, usage_limit, usage_count, per_user_limit, status'
    )
    .ilike('code', code.trim())
    .maybeSingle();

  if (!promo || promo.status !== 'active') return refused('That code is not valid for this booking.');

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) return refused('That code is not valid yet.');
  if (promo.valid_until && new Date(promo.valid_until) < now) return refused('That code has expired.');
  if (promo.usage_limit != null && promo.usage_count >= promo.usage_limit) {
    return refused('That code has been used as many times as it allows.');
  }
  // A fixed discount is denominated; a percentage travels between currencies.
  if (promo.discount_type === 'fixed' && promo.currency !== currency) {
    return refused('That code is not valid in this currency.');
  }

  // No rows in promotion_packages means the promotion applies everywhere.
  const { data: scope } = await db
    .from('promotion_packages')
    .select('package_id')
    .eq('promotion_id', promo.id);
  if (scope?.length && !scope.some((s) => s.package_id === packageId)) {
    return refused('That code is not valid for this tour.');
  }

  // Per person: the account when there is one, else the lead email — both,
  // because a guest booking becomes an account later.
  if (promo.per_user_limit != null && (who.userId || who.email)) {
    const filters: string[] = [];
    if (who.userId) filters.push(`user_id.eq.${who.userId}`);
    if (who.email) filters.push(`lead_email.ilike.${who.email.trim().toLowerCase()}`);
    const { count } = await db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', promo.id)
      .neq('status', 'cancelled')
      .or(filters.join(','));
    if ((count ?? 0) >= promo.per_user_limit) {
      return refused('You have already used that code.');
    }
  }

  return {
    promotion: {
      id: promo.id,
      code: promo.code,
      discountType: promo.discount_type as 'percent' | 'fixed',
      discountValue: promo.discount_value,
    },
    reason: null,
  };
}

/** The promotion alone, for callers that only need to price with it. */
export async function lookupPromotion(
  code: string,
  packageId: string,
  currency: string,
  who: { userId?: string | null; email?: string | null } = {}
): Promise<PromotionInput | null> {
  return (await evaluatePromotion(code, packageId, currency, who)).promotion;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * The database raises in plain English on purpose, so most messages can be shown
 * as they are. Anything unrecognised is replaced rather than leaked — a Postgres
 * error string in front of a traveller is both unhelpful and a small disclosure.
 */
function friendly(message: string | undefined): string {
  if (!message) return 'Something went wrong holding your seats. Please try again.';
  const known = [
    'seat(s) left',
    'no longer held',
    'not open for booking',
    'have not opened yet',
    'have closed',
    'no longer exists',
    'party grew to',
    'traveller list does not match',
    'do not reconcile',
    // check_promotion (0015). Every one is a sentence written to be shown.
    'promotion code',
    'discount does not match',
  ];
  return known.some((k) => message.includes(k))
    ? message
    : 'Something went wrong holding your seats. Please try again.';
}

/** Seats a party needs. Re-exported so callers need not reach into pricing. */
export { seatsFor };

// ─── Reading a booking back ───────────────────────────────────────────────

export type BookingSummary = {
  reference: string;
  status: string;
  currency: string;
  createdAt: string;
  lead: { name: string; email: string; phone: string | null };
  party: Party;
  totals: {
    subtotalCents: number;
    discountCents: number;
    taxCents: number;
    feesCents: number;
    totalCents: number;
    depositDueCents: number;
    amountPaidCents: number;
    balanceCents: number;
    balanceDueOn: string | null;
  };
  lines: { kind: string; label: string; quantity: number; amountCents: number }[];
  travellers: { position: number; travellerType: string; legalName: string; isLead: boolean }[];
  acknowledgements: { label: string; acceptedAt: string }[];
  package: { title: string; slug: string; heroImage: string | null; meetingPoint: string | null };
  departure: { startsOn: string; endsOn: string | null; startTime: string | null };
  /** When the seats stop being held. Null once payment resolves either way. */
  holdExpiresAt: string | null;
};

/**
 * A booking, for the person who made it.
 *
 * References are short and human-readable, which makes them guessable, so this
 * is deliberately not "anyone with the reference". A guest is recognised by the
 * booking-session cookie their hold was created under; a signed-in traveller by
 * `user_id`. Anything else gets null, and the page 404s rather than confirming
 * the reference exists.
 */
export async function getBookingForViewer(
  reference: string,
  sessionToken: string | null,
  userId: string | null
): Promise<BookingSummary | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: booking } = await db
    .from('bookings')
    .select(
      'id, reference, status, currency, created_at, lead_name, lead_email, lead_phone, adults, children, infants, subtotal_cents, discount_cents, tax_cents, fees_cents, total_cents, deposit_due_cents, amount_paid_cents, balance_cents, balance_due_on, user_id, packages ( title, slug, hero_image, meeting_point ), departures ( starts_on, ends_on, start_time )'
    )
    .eq('reference', reference.toUpperCase())
    .maybeSingle();
  if (!booking) return null;

  const ownedByUser = userId != null && booking.user_id === userId;
  let allowed = ownedByUser;

  const { data: holds } = await db
    .from('booking_holds')
    .select('session_token, expires_at, released_at')
    .eq('booking_id', booking.id);

  if (!allowed && sessionToken) {
    allowed = (holds ?? []).some((h) => h.session_token === sessionToken);
  }
  if (!allowed) return null;

  const [{ data: lines }, { data: travellers }, { data: acks }] = await Promise.all([
    db
      .from('booking_price_lines')
      .select('kind, label, quantity, amount_cents, sort_order')
      .eq('booking_id', booking.id)
      .order('sort_order'),
    db
      .from('travellers')
      .select('position, traveller_type, legal_name, is_lead')
      .eq('booking_id', booking.id)
      .order('position'),
    db
      .from('booking_acknowledgements')
      .select('label, accepted_at')
      .eq('booking_id', booking.id)
      .order('accepted_at'),
  ]);

  const live = (holds ?? []).find((h) => h.released_at == null);
  const pkg = (booking as { packages?: { title: string; slug: string; hero_image: string | null; meeting_point: string | null } | null }).packages;
  const dep = (booking as { departures?: { starts_on: string; ends_on: string | null; start_time: string | null } | null }).departures;

  return {
    reference: booking.reference,
    status: booking.status,
    currency: booking.currency,
    createdAt: booking.created_at,
    lead: { name: booking.lead_name, email: booking.lead_email, phone: booking.lead_phone },
    party: { adults: booking.adults, children: booking.children, infants: booking.infants },
    totals: {
      subtotalCents: booking.subtotal_cents,
      discountCents: booking.discount_cents,
      taxCents: booking.tax_cents,
      feesCents: booking.fees_cents,
      totalCents: booking.total_cents,
      depositDueCents: booking.deposit_due_cents,
      amountPaidCents: booking.amount_paid_cents,
      balanceCents: booking.balance_cents ?? booking.total_cents - booking.amount_paid_cents,
      balanceDueOn: booking.balance_due_on,
    },
    lines: (lines ?? []).map((l) => ({
      kind: l.kind,
      label: l.label,
      quantity: l.quantity,
      amountCents: l.amount_cents,
    })),
    travellers: (travellers ?? []).map((t) => ({
      position: t.position,
      travellerType: t.traveller_type,
      legalName: t.legal_name,
      isLead: t.is_lead,
    })),
    acknowledgements: (acks ?? []).map((a) => ({ label: a.label, acceptedAt: a.accepted_at })),
    package: {
      title: pkg?.title ?? 'Your trip',
      slug: pkg?.slug ?? '',
      heroImage: pkg?.hero_image ?? null,
      meetingPoint: pkg?.meeting_point ?? null,
    },
    departure: {
      startsOn: dep?.starts_on ?? '',
      endsOn: dep?.ends_on ?? null,
      startTime: dep?.start_time ?? null,
    },
    holdExpiresAt: live?.expires_at ?? null,
  };
}
