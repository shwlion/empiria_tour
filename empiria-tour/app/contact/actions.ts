'use server';

import { headers } from 'next/headers';
import { getPlatformSettings } from '@/lib/catalogue';
import { isSesConfigured, sendViaSes } from '@/lib/email/ses';
import { BOT_CHECK_FIELD, BOT_CHECK_MESSAGE, verifyBotCheck } from '@/lib/botcheck';

/**
 * The contact form.
 *
 * Nothing is stored. A message goes to the contact address in Platform
 * settings through Amazon SES, with the sender's address as Reply-To so
 * Empiria answers from their own inbox — that is the whole design, by the
 * client's decision, and it is why this file has no Supabase import.
 *
 * Two consequences of storing nothing, both accepted:
 *   - If SES refuses, the person is told and asked to email directly. There
 *     is no queue to fall back to.
 *   - Abuse is limited to a honeypot and a length cap, as on the partner
 *     application. Part F's real challenge (Turnstile) is still unbuilt and
 *     this form needs it the same as the other two.
 */

export type ContactResult =
  | { ok: true }
  | { ok: false; message: string; fields?: Record<string, string> };

const MESSAGE_MAX = 4000;
const NAME_MAX = 120;

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function contactAction(_prev: ContactResult | null, form: FormData): Promise<ContactResult> {
  // The honeypot, exactly as on the partner application: a plausibly named
  // field nobody can see. Filled in means a bot, and a bot is told it worked.
  if (str(form, 'company_website_url') !== '') return { ok: true };

  const name = str(form, 'name').slice(0, NAME_MAX);
  const email = str(form, 'email');
  const message = str(form, 'message');

  const fields: Record<string, string> = {};
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = 'A usable email address, so we can reply';
  if (!message) fields.message = 'Tell us what you would like to know';
  else if (message.length > MESSAGE_MAX) fields.message = `At most ${MESSAGE_MAX} characters`;
  if (Object.keys(fields).length > 0) {
    return { ok: false, message: 'A couple of things still need filling in.', fields };
  }

  // Part F: after the field checks, because a token is single-use and a
  // person fixing a typo should not have to pass the widget twice.
  const bot = await verifyBotCheck(str(form, BOT_CHECK_FIELD));
  if (!bot.ok) return { ok: false, message: BOT_CHECK_MESSAGE };

  const settings = await getPlatformSettings();
  const to = settings?.contact_email?.trim();
  const fallback = to ? ` You can also write to ${to} directly.` : '';

  if (!to || !isSesConfigured()) {
    // Configuration, not a fault the person can fix. Say so plainly.
    return {
      ok: false,
      message: `Messages cannot be sent from this page right now.${fallback}`,
    };
  }

  // For the log line only — never sent, never shown.
  let ip = 'unknown';
  try {
    const h = await headers();
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  } catch {
    /* outside a request scope; nothing to record */
  }

  const who = name ? `${name} <${email}>` : email;
  const sent = await sendViaSes({
    to,
    replyTo: email,
    subject: `Website inquiry from ${name || email}`,
    text: `From: ${who}\n\n${message}\n\n—\nSent from the contact page. Reply to this email to answer them.`,
    html: `<p><strong>From:</strong> ${escapeHtml(who)}</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p><hr><p style="color:#666;font-size:13px">Sent from the contact page. Reply to this email to answer them.</p>`,
  });

  if (!sent.ok) {
    console.error('[contact] send failed', { ip, error: sent.error });
    return { ok: false, message: `That did not send. Please try again in a moment.${fallback}` };
  }
  return { ok: true };
}
