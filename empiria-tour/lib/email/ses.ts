import 'server-only';
import { signRequest } from './sigv4';

/**
 * Amazon SES, over `fetch`.
 *
 * One signed POST to the SES v2 SendEmail API. The signature is
 * lib/email/sigv4.ts, proved against AWS's test vector; this file only knows
 * the endpoint and the JSON shape. Same reasoning as the Resend mailer: the
 * call is one request, an SDK buys nothing here, and §5.7 makes every added
 * dependency a licence question somebody has to answer.
 *
 * Configuration, all server-only, none NEXT_PUBLIC_:
 *
 *   AWS_SES_REGION          e.g. ca-central-1
 *   AWS_ACCESS_KEY_ID       an IAM user or role allowed ses:SendEmail
 *   AWS_SECRET_ACCESS_KEY
 *   SES_FROM_EMAIL          a sender SES has verified, e.g. "Empiria Tours <hello@…>"
 *
 * Two SES facts that look like bugs when first met:
 *
 *   - A new SES account is in the *sandbox*: it may send only TO addresses
 *     that are themselves verified. Until AWS grants production access, the
 *     contact address in Platform settings must be verified in SES too.
 *   - The sender must be a verified identity (an address, or a domain with
 *     the DKIM records in place). An unverified From is rejected outright.
 *
 * Nothing here decides whether to send, or what. The contact form does.
 */

export type SesSendInput = {
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string | null;
};

export type SesSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export function isSesConfigured(): boolean {
  return Boolean(
    process.env.AWS_SES_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.SES_FROM_EMAIL
  );
}

export async function sendViaSes(input: SesSendInput): Promise<SesSendResult> {
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const from = process.env.SES_FROM_EMAIL;
  if (!region || !accessKeyId || !secretAccessKey || !from) {
    return { ok: false, error: 'SES is not configured (AWS_SES_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL).' };
  }

  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
  const body = JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: [input.to] },
    ...(input.replyTo ? { ReplyToAddresses: [input.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: input.text, Charset: 'UTF-8' },
          ...(input.html ? { Html: { Data: input.html, Charset: 'UTF-8' } } : {}),
        },
      },
    },
  });

  const headers = signRequest({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json' },
    body,
    accessKeyId,
    secretAccessKey,
    region,
    service: 'ses',
    date: new Date(),
  });

  try {
    const response = await fetch(url, { method: 'POST', headers, body });
    const payload = (await response.json().catch(() => ({}))) as { MessageId?: string; message?: string; Message?: string };
    if (!response.ok) {
      // SES's messages are specific and safe to log ("Email address is not
      // verified", "Daily message quota exceeded"). They are for the server
      // log; the person at the form gets a sentence from the caller.
      const reason = payload.message ?? payload.Message ?? `HTTP ${response.status}`;
      console.error('[ses] send failed', response.status, reason);
      return { ok: false, error: reason };
    }
    return { ok: true, messageId: payload.MessageId ?? '' };
  } catch (error) {
    console.error('[ses] request failed', error);
    return { ok: false, error: error instanceof Error ? error.message : 'request failed' };
  }
}
