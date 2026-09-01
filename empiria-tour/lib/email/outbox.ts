import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase';
import { renderEmail, TemplateError, type MergeData } from './render';
import { CURRENCY_KEY, LOCALE_KEY } from './fields';
import { isMailConfigured, sendEmail } from './mailer';

/**
 * The outbox, from the application's side.
 *
 * Enqueueing is a single database call — `enqueue_email` holds the idempotence,
 * so nothing here has to think about redelivery. Draining reads the template at
 * send time, renders, sends, and writes back what actually went out.
 *
 * Every enqueue is best-effort and never throws into its caller. A webhook that
 * recorded a payment and then failed to queue an email must still return 200:
 * the money is the fact that matters, and a missing email is recoverable from
 * the console. Losing the payment record is not.
 */

type EnqueueInput = {
  templateKey: string;
  toEmail: string;
  toName?: string | null;
  bookingId?: string | null;
  departureId?: string | null;
  userId?: string | null;
  mergeData: MergeData;
  /** Omit for a send that is deliberately repeatable, such as staff pressing Resend. */
  dedupeKey?: string | null;
  scheduledFor?: string | null;
};

export async function enqueue(input: EnqueueInput): Promise<string | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    // `MergeData` is Record<string, unknown> because that is honestly what comes
    // back out of a jsonb column. Everything put *in* is JSON-serialisable by
    // construction — the callers below build it from database rows — so the
    // cast at this boundary is narrowing to what the RPC signature wants, not
    // papering over an unknown shape.
    const { data, error } = await db.rpc('enqueue_email', {
      p_payload: {
        template_key: input.templateKey,
        to_email: input.toEmail,
        to_name: input.toName ?? null,
        booking_id: input.bookingId ?? null,
        departure_id: input.departureId ?? null,
        user_id: input.userId ?? null,
        merge_data: input.mergeData,
        dedupe_key: input.dedupeKey ?? null,
        scheduled_for: input.scheduledFor ?? null,
      } as never,
    });
    if (error) {
      console.error('[email] enqueue failed', input.templateKey, error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.error('[email] enqueue threw', input.templateKey, e);
    return null;
  }
}

// ─── Building merge data from a booking ────────────────────────────────────

type BookingContext = {
  id: string;
  reference: string;
  leadName: string;
  leadEmail: string;
  userId: string | null;
  departureId: string;
  currency: string;
  totalCents: number;
  balanceCents: number;
  balanceDueOn: string | null;
  adults: number;
  children: number;
  infants: number;
  packageTitle: string;
  startsOn: string;
  startTime: string | null;
  meetingPoint: string | null;
  whatToBring: string | null;
};

/** One read, shared by every trigger that fires off a booking. */
export async function loadBookingContext(bookingId: string): Promise<BookingContext | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from('bookings')
    .select(
      'id, reference, lead_name, lead_email, user_id, departure_id, currency, ' +
        'total_cents, balance_cents, balance_due_on, adults, children, infants, ' +
        'packages!inner ( title, meeting_point, what_to_bring ), ' +
        'departures!inner ( starts_on, start_time )'
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!data) return null;

  const b = data as unknown as {
    id: string; reference: string; lead_name: string; lead_email: string;
    user_id: string | null; departure_id: string; currency: string;
    total_cents: number; balance_cents: number; balance_due_on: string | null;
    adults: number; children: number; infants: number;
    packages: { title: string; meeting_point: string | null; what_to_bring: string | null };
    departures: { starts_on: string; start_time: string | null };
  };

  return {
    id: b.id,
    reference: b.reference,
    leadName: b.lead_name,
    leadEmail: b.lead_email,
    userId: b.user_id,
    departureId: b.departure_id,
    currency: b.currency,
    totalCents: b.total_cents,
    balanceCents: b.balance_cents,
    balanceDueOn: b.balance_due_on,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    packageTitle: b.packages.title,
    startsOn: b.departures.starts_on,
    startTime: b.departures.start_time,
    meetingPoint: b.packages.meeting_point,
    whatToBring: b.packages.what_to_bring,
  };
}

/** The seller's own identity, which Part D requires on everything that goes out. */
async function companyFields(): Promise<MergeData> {
  const db = getSupabaseAdmin();
  if (!db) return {};
  const { data } = await db
    .from('platform_settings')
    .select('company_name, registration_number, contact_email')
    .limit(1)
    .maybeSingle();
  return {
    'company.name': data?.company_name ?? '',
    'company.registration_number': data?.registration_number ?? '',
    'company.contact_email': data?.contact_email ?? '',
  };
}

function partyLabel(c: BookingContext): string {
  const parts = [`${c.adults} adult${c.adults === 1 ? '' : 's'}`];
  if (c.children > 0) parts.push(`${c.children} child${c.children === 1 ? '' : 'ren'}`);
  if (c.infants > 0) parts.push(`${c.infants} infant${c.infants === 1 ? '' : 's'}`);
  return parts.join(', ');
}

// ─── The event-driven triggers ─────────────────────────────────────────────

/**
 * Called from the Stripe webhook after `record_payment` has succeeded.
 *
 * Which message goes out depends on what the payment did to the booking, not on
 * what the caller thinks happened: a first payment that clears the whole total
 * is a confirmation, a first payment that leaves a balance is a deposit, and a
 * later payment that clears the rest is a balance receipt. Reading the state
 * after the fact keeps that decision in one place.
 */
export async function enqueueForPayment(bookingId: string, amountCents: number): Promise<void> {
  const c = await loadBookingContext(bookingId);
  if (!c) return;
  const common = await companyFields();
  const base: MergeData = {
    ...common,
    [CURRENCY_KEY]: c.currency,
    [LOCALE_KEY]: 'en-CA',
    'booking.reference': c.reference,
    'traveller.name': c.leadName,
    'package.title': c.packageTitle,
    'departure.date': c.startsOn,
  };
  const to = { toEmail: c.leadEmail, toName: c.leadName, bookingId: c.id, departureId: c.departureId, userId: c.userId };

  // The confirmation goes out once, on the first money to arrive, whatever it
  // covered. Its dedupe key carries no payment id for exactly that reason.
  await enqueue({
    ...to,
    templateKey: 'booking_confirmed',
    dedupeKey: `booking_confirmed:${c.id}`,
    mergeData: {
      ...base,
      'booking.total': c.totalCents,
      'departure.meeting_point': c.meetingPoint,
      'booking.travellers': partyLabel(c),
    },
  });

  if (c.balanceCents > 0) {
    await enqueue({
      ...to,
      templateKey: 'deposit_taken',
      dedupeKey: `deposit_taken:${c.id}:${amountCents}`,
      mergeData: {
        ...base,
        'payment.amount': amountCents,
        'booking.balance': c.balanceCents,
        'booking.balance_due_on': c.balanceDueOn,
      },
    });
  } else {
    await enqueue({
      ...to,
      templateKey: 'balance_paid',
      dedupeKey: `balance_paid:${c.id}`,
      mergeData: { ...base, 'payment.amount': amountCents, 'booking.total': c.totalCents },
    });
  }

  // Empiria hears about every booking. Address configurable, falling back to
  // the public contact address so this is never silently dropped.
  const staff = process.env.ADMIN_ALERT_EMAIL || String(common['company.contact_email'] ?? '');
  if (staff) {
    await enqueue({
      templateKey: 'admin_alert',
      toEmail: staff,
      bookingId: c.id,
      departureId: c.departureId,
      dedupeKey: `admin_alert:${c.id}`,
      mergeData: {
        ...base,
        'booking.total': c.totalCents,
        'booking.admin_link': `${process.env.ADMIN_URL ?? ''}/dashboard/bookings/${c.id}`,
      },
    });
  }
}

export async function enqueueRefundIssued(
  bookingId: string, amountCents: number, method: string, paymentRef: string
): Promise<void> {
  const c = await loadBookingContext(bookingId);
  if (!c) return;
  await enqueue({
    templateKey: 'refund_issued',
    toEmail: c.leadEmail,
    toName: c.leadName,
    bookingId: c.id,
    departureId: c.departureId,
    userId: c.userId,
    dedupeKey: `refund_issued:${paymentRef}`,
    mergeData: {
      ...(await companyFields()),
      [CURRENCY_KEY]: c.currency,
      [LOCALE_KEY]: 'en-CA',
      'booking.reference': c.reference,
      'traveller.name': c.leadName,
      'package.title': c.packageTitle,
      'payment.amount': Math.abs(amountCents),
      'payment.method': method,
    },
  });
}

// ─── Draining ──────────────────────────────────────────────────────────────

export type DrainReport = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
};

/**
 * Send whatever is due.
 *
 * A template with no wording yet is *skipped*, not failed: Empiria has not
 * written it (§2.1), which is a content gap the console already reports, not a
 * transport error worth retrying five times. It is marked failed with that
 * reason so it stops consuming attempts and shows up honestly in the log.
 */
export async function drainOutbox(limit = 20): Promise<DrainReport> {
  const report: DrainReport = { claimed: 0, sent: 0, failed: 0, skipped: 0, errors: [] };
  const db = getSupabaseAdmin();
  if (!db) return report;

  const { data: batch, error } = await db.rpc('claim_email_batch', { p_limit: limit });
  if (error) {
    report.errors.push(`claim failed: ${error.message}`);
    return report;
  }

  const rows = (batch ?? []) as {
    id: string; template_key: string; to_email: string; to_name: string | null;
    merge_data: MergeData;
  }[];
  report.claimed = rows.length;
  if (rows.length === 0) return report;

  // Templates are read now, not at enqueue, so the wording that goes out is
  // whatever Empiria has most recently saved.
  const keys = [...new Set(rows.map((r) => r.template_key))];
  const { data: templates } = await db
    .from('email_templates')
    .select('key, subject, body_html, body_text, is_active')
    .in('key', keys);
  const byKey = new Map((templates ?? []).map((t) => [t.key, t]));

  for (const row of rows) {
    const template = byKey.get(row.template_key);
    if (!template || template.is_active === false) {
      await db.rpc('mark_email_failed', {
        p_id: row.id,
        p_error: `The ${row.template_key} template is missing or switched off.`,
        p_max_attempts: 0,
      });
      report.skipped++;
      continue;
    }

    let rendered;
    try {
      rendered = renderEmail(
        { key: row.template_key, subject: template.subject, body_html: template.body_html, body_text: template.body_text },
        row.merge_data
      );
    } catch (e) {
      const why = e instanceof TemplateError ? e.message : String(e);
      // A broken template does not get better on the fifth attempt. Stop it now
      // so the log says why rather than burying it under retries.
      await db.rpc('mark_email_failed', { p_id: row.id, p_error: why, p_max_attempts: 0 });
      report.skipped++;
      report.errors.push(`${row.template_key}: ${why}`);
      continue;
    }

    if (!isMailConfigured()) {
      await db.rpc('mark_email_failed', {
        p_id: row.id,
        p_error: 'Mail is not configured yet — waiting on the Resend sending domain.',
      });
      report.skipped++;
      continue;
    }

    const result = await sendEmail({
      to: row.to_email,
      toName: row.to_name,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (result.ok) {
      await db.rpc('mark_email_sent', {
        p_id: row.id,
        p_provider_ref: result.providerRef,
        p_subject: rendered.subject,
        p_body: rendered.html,
      });
      report.sent++;
    } else {
      await db.rpc('mark_email_failed', {
        p_id: row.id,
        p_error: result.error,
        p_max_attempts: result.retryable ? 5 : 0,
      });
      report.failed++;
      report.errors.push(`${row.template_key}: ${result.error}`);
    }
  }

  return report;
}

/** The scheduled half: find what has become due, then send it. */
export async function tick(limit = 50): Promise<DrainReport & { enqueued: number }> {
  const db = getSupabaseAdmin();
  let enqueued = 0;
  if (db) {
    const { data, error } = await db.rpc('enqueue_due_reminders');
    if (error) console.error('[email] reminder scan failed', error.message);
    else enqueued = (data as number | null) ?? 0;
  }
  return { ...(await drainOutbox(limit)), enqueued };
}
