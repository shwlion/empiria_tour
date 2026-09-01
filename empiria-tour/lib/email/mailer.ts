import 'server-only';

/**
 * Sending, and nothing else.
 *
 * Resend over `fetch` rather than the `resend` SDK, deliberately. The call is
 * one POST with a bearer token; an SDK buys nothing here and costs a
 * dependency, and §5.7 of the agreement makes every added dependency a licence
 * question somebody has to answer. The other Empiria repositories use the SDK
 * and that is fine — this one does not need to.
 *
 * Nothing here decides *whether* to send. That belongs to the outbox.
 */

const ENDPOINT = 'https://api.resend.com/emails';

export type SendResult =
  | { ok: true; providerRef: string }
  | { ok: false; error: string; retryable: boolean };

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(input: {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
  replyTo?: string | null;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    // Not an error worth retrying — it is a deployment that has not been
    // finished. The message stays queued and goes out when the domain verifies.
    return { ok: false, error: 'RESEND_API_KEY or EMAIL_FROM is not set', retryable: true };
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.toName ? `${input.toName} <${input.to}>` : input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
  } catch (e) {
    // The network, not the message. Always worth another go.
    return { ok: false, error: `Could not reach Resend: ${String(e)}`, retryable: true };
  }

  if (response.ok) {
    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, providerRef: body.id ?? '' };
  }

  const detail = await response.text().catch(() => '');
  // 4xx is this message being wrong — a malformed address, an unverified
  // domain. Retrying it just burns attempts. 5xx and 429 are Resend's problem
  // and will pass.
  const retryable = response.status >= 500 || response.status === 429;
  return {
    ok: false,
    error: `Resend returned ${response.status}: ${detail.slice(0, 500)}`,
    retryable,
  };
}
