import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Everything a receipt states, gathered in one place.
 *
 * SERVER ONLY.
 *
 * ## Why this is not stored
 *
 * Every input here is already immutable. `booking_price_lines` are written once
 * by `create_booking`; `payments` rows are append-only and `record_payment`
 * refuses a duplicate `provider_ref`; `booking_acknowledgements.body_snapshot`
 * already freezes the disclosure wording at the moment the traveller agreed. A
 * stored PDF would therefore be a second copy of facts the database already
 * holds immutably — so the receipt is rendered on demand and the bucket, its
 * migration and its RLS are all avoided.
 *
 * The one genuinely mutable input is the seller's own identity, which lives in
 * `platform_settings` and is read live. See `SellerIdentity` below.
 *
 * ## Authorisation
 *
 * Deliberately the same rule as the booking page and `loadPayable`: a reference
 * on its own is not authorisation. Either the signed-in user owns the booking,
 * or the caller holds the session token that created it. A reference that
 * exists but is not yours is indistinguishable from one that does not.
 */

export type ReceiptPayment = {
  kind: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerRef: string | null;
  createdAt: string;
};

/**
 * Who is selling, per §2.2 — Empiria is the merchant of record on every booking
 * under its own Ontario travel registration.
 *
 * Every field is nullable and every one of them is currently null: PROJECT.md
 * item 2 is Empiria filling this in. §2.3 puts the wording on Empiria and the
 * mechanism on Elevsoft, so this renders whatever is there and states plainly
 * what is missing rather than inventing a company name or a registration
 * number. A receipt that names no seller is a visible problem, which is the
 * correct outcome while the field is empty.
 */
export type SellerIdentity = {
  companyName: string | null;
  registrationNumber: string | null;
  statutoryNotice: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  /** B6 (0018): Empiria's wording around the facts. Absent, the renderer's defaults apply. */
  receiptTitle?: string | null;
  receiptIntro?: string | null;
  receiptFooter?: string | null;
};

export type ReceiptData = {
  reference: string;
  status: string;
  currency: string;
  createdAt: string;
  lead: { name: string; email: string; phone: string | null };
  party: { adults: number; children: number; infants: number };
  packageTitle: string;
  departure: { startsOn: string; endsOn: string | null };
  lines: { label: string; quantity: number; amountCents: number }[];
  travellers: { position: number; travellerType: string; legalName: string; isLead: boolean }[];
  acknowledgements: { label: string; acceptedAt: string }[];
  payments: ReceiptPayment[];
  totals: {
    totalCents: number;
    amountPaidCents: number;
    balanceCents: number;
    balanceDueOn: string | null;
  };
  seller: SellerIdentity;
  /** Part D blocks placed at `receipt`, global ones and this package's. */
  disclosures: { name: string; body: string }[];
  /**
   * What the document is dated. The last successful payment where there is
   * one, so the same booking renders byte-identically every time; the booking's
   * own creation date before any money has arrived.
   */
  producedAt: string;
};

export async function loadReceipt(
  reference: string,
  sessionToken: string | null,
  userId: string | null
): Promise<ReceiptData | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: booking } = await db
    .from('bookings')
    // One string literal, not a concatenation: supabase-js parses this at the
    // type level, and a `+` defeats that quietly — every column comes back as
    // `GenericStringError` and the row type collapses.
    .select(
      'id, reference, status, currency, created_at, lead_name, lead_email, lead_phone, adults, children, infants, total_cents, amount_paid_cents, balance_cents, balance_due_on, package_id, user_id, packages ( title ), departures ( starts_on, ends_on )'
    )
    .eq('reference', reference.toUpperCase())
    .maybeSingle();
  if (!booking) return null;

  // Same check as the booking page. A reference alone is not authorisation.
  let allowed = userId != null && booking.user_id === userId;
  if (!allowed) {
    if (!sessionToken) return null;
    const { data: holds } = await db
      .from('booking_holds')
      .select('session_token')
      .eq('booking_id', booking.id);
    allowed = (holds ?? []).some((h) => h.session_token === sessionToken);
  }
  if (!allowed) return null;

  const [{ data: lines }, { data: travellers }, { data: acks }, { data: payments }, { data: settings }, { data: placements }] =
    await Promise.all([
      db
        .from('booking_price_lines')
        .select('label, quantity, amount_cents, sort_order')
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
      // Succeeded only. A failed attempt belongs in the console and in a support
      // conversation, not on the traveller's receipt.
      db
        .from('payments')
        .select('kind, amount_cents, currency, provider, provider_ref, created_at, status')
        .eq('booking_id', booking.id)
        .eq('status', 'succeeded')
        .order('created_at'),
      db
        .from('platform_settings')
        .select('company_name, registration_number, statutory_notice, contact_email, contact_phone, receipt_title, receipt_intro, receipt_footer')
        .maybeSingle(),
      db
        .from('disclosure_placements')
        .select('package_id, sort_order, disclosure_blocks!inner ( name, body, status )')
        .eq('placement', 'receipt')
        .eq('disclosure_blocks.status', 'active')
        .order('sort_order'),
    ]);

  const pkg = (booking as { packages?: { title: string } | null }).packages;
  const dep = (booking as { departures?: { starts_on: string; ends_on: string | null } | null }).departures;

  const paid = (payments ?? []).map((p) => ({
    kind: p.kind,
    amountCents: p.amount_cents,
    currency: p.currency,
    provider: p.provider,
    providerRef: p.provider_ref,
    createdAt: p.created_at,
  }));

  // A null `package_id` on a placement means every package (migration 0002).
  const disclosures = (placements ?? [])
    .filter((r) => r.package_id == null || r.package_id === booking.package_id)
    .map((r) => {
      const block = r.disclosure_blocks as unknown as { name: string; body: string };
      return { name: block.name, body: block.body };
    });

  return {
    reference: booking.reference,
    status: booking.status,
    currency: booking.currency,
    createdAt: booking.created_at,
    lead: { name: booking.lead_name, email: booking.lead_email, phone: booking.lead_phone },
    party: { adults: booking.adults, children: booking.children, infants: booking.infants },
    packageTitle: pkg?.title ?? 'Your trip',
    departure: { startsOn: dep?.starts_on ?? '', endsOn: dep?.ends_on ?? null },
    lines: (lines ?? []).map((l) => ({
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
    payments: paid,
    totals: {
      totalCents: booking.total_cents,
      amountPaidCents: booking.amount_paid_cents,
      balanceCents: booking.balance_cents ?? booking.total_cents - booking.amount_paid_cents,
      balanceDueOn: booking.balance_due_on,
    },
    seller: {
      companyName: settings?.company_name ?? null,
      registrationNumber: settings?.registration_number ?? null,
      statutoryNotice: settings?.statutory_notice ?? null,
      contactEmail: settings?.contact_email ?? null,
      contactPhone: settings?.contact_phone ?? null,
      receiptTitle: settings?.receipt_title ?? null,
      receiptIntro: settings?.receipt_intro ?? null,
      receiptFooter: settings?.receipt_footer ?? null,
    },
    disclosures,
    producedAt: paid.length > 0 ? paid[paid.length - 1].createdAt : booking.created_at,
  };
}
