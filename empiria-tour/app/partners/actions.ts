'use server';

import { headers } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/supabase';
import { BOT_CHECK_FIELD, BOT_CHECK_MESSAGE, verifyBotCheck } from '@/lib/botcheck';
import { enqueue } from '@/lib/email/outbox';

/**
 * Applying to sell tours through Empiria.
 *
 * This writes an application and grants nothing. The only code path in the
 * system that sets `role = 'partner'` is `approve_partner_application`, which
 * an administrator triggers from the console after reading what was submitted.
 *
 * Nothing here tells the applicant whether their email already has an account.
 * On a public form that is an account-enumeration oracle, and the person who
 * can actually do something about a clash is the reviewer, not them.
 */

export type ApplyResult =
  | { ok: true }
  | { ok: false; message: string; fields?: Record<string, string> };

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

export async function applyAction(_prev: ApplyResult | null, form: FormData): Promise<ApplyResult> {
  // A honeypot: a field with a plausible name, hidden from people and from
  // screen readers, which only automation fills in. If it has a value, answer
  // as though the submission worked — telling a bot why it failed only helps
  // the next attempt.
  //
  // This is deliberately the *only* check here. A timing check on a hidden
  // field was written and then removed: anything that can post a form can post
  // a plausible timestamp with it, so it would have looked like protection
  // while providing none, which is worse than nothing because the next person
  // to read this would have trusted it.
  //
  // Part F's "bot protection on public forms" is the Turnstile check below,
  // live once Empiria sets its keys (lib/botcheck.ts). The honeypot stays: it
  // costs nothing and catches the dumbest half of the traffic first.
  if (str(form, 'company_website_url') !== '') {
    return { ok: true };
  }

  const fields: Record<string, string> = {};
  const companyName = str(form, 'company_name');
  const contactName = str(form, 'contact_name');
  const email = str(form, 'email');

  if (!companyName) fields.company_name = 'Required';
  if (!contactName) fields.contact_name = 'Required';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = 'A usable email address';
  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'A few things still need filling in.', fields };
  }

  // After the field checks: a token is single-use, and somebody fixing a
  // typo should not have to pass the widget twice.
  const bot = await verifyBotCheck(str(form, BOT_CHECK_FIELD));
  if (!bot.ok) return { ok: false, message: BOT_CHECK_MESSAGE };

  const db = getSupabaseAdmin();
  if (!db) {
    return { ok: false, message: 'Applications are not being accepted right now. Please try later.' };
  }

  // Recorded for abuse investigation only, and never shown back to anyone.
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  } catch {
    ip = null;
  }

  const payload = {
    company_name: companyName,
    contact_name: contactName,
    email,
    phone: str(form, 'phone'),
    website: str(form, 'website'),
    country: str(form, 'country'),
    operating_regions: str(form, 'operating_regions'),
    tour_types: str(form, 'tour_types'),
    departures_per_year: str(form, 'departures_per_year'),
    message: str(form, 'message'),
    submitted_ip: ip,
  };

  const { data, error } = await db.rpc('submit_partner_application', { p_payload: payload as never });
  if (error) {
    console.error('[partners] application failed', error.message);
    return { ok: false, message: 'That could not be submitted. Please try again.' };
  }

  const applicationId = data as string | null;

  // Both emails are queued, not sent — they leave on the next tick like
  // everything else. Neither is allowed to fail the submission: the row is the
  // thing that matters, and a missing acknowledgement is visible in the console.
  await enqueue({
    templateKey: 'partner_application_received',
    toEmail: email,
    toName: contactName,
    dedupeKey: applicationId ? `partner_application_received:${applicationId}` : null,
    mergeData: { 'applicant.name': contactName, 'applicant.company': companyName },
  });

  const staff = process.env.ADMIN_ALERT_EMAIL;
  if (staff && applicationId) {
    await enqueue({
      // Its own template: admin_alert is about a booking and needs a reference,
      // a total and a date, none of which an application has — with those in
      // its body, every one of these would have failed to render.
      templateKey: 'partner_application_alert',
      toEmail: staff,
      dedupeKey: `partner_application:${applicationId}`,
      mergeData: {
        'applicant.name': contactName,
        'applicant.company': companyName,
        'application.admin_link': `${process.env.ADMIN_URL ?? ''}/dashboard/partners/${applicationId}`,
      },
    });
  }

  return { ok: true };
}
