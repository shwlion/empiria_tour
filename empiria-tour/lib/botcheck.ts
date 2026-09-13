/**
 * Part F — "bot protection on public forms" — as a seam.
 *
 * Cloudflare Turnstile, chosen because it needs no puzzle from the person and
 * no account from anybody but Empiria (§4.4(a): third-party accounts are
 * theirs). Two keys: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` draws the widget
 * (components/BotCheck.tsx) and `TURNSTILE_SECRET_KEY` lets this file verify
 * what the widget produced. With neither set the forms behave exactly as
 * before — the honeypot alone — and `verifyBotCheck` says it checked nothing
 * rather than pretending it did.
 *
 * With the secret set, a submission without a token is refused, and so is
 * one the verifier cannot reach: failing closed is a retry for a person and a
 * wall for a script, and the outage that would make it wrong is Cloudflare's,
 * which is short and rare. The three public forms — contact, partner
 * application, booking — all call this; A5 names the booking flow
 * specifically ("bot protection on submission").
 *
 * Cloudflare publishes dummy keys that always pass or always fail, which is
 * how lib/botcheck.test.ts proves the round trip without an account.
 */

/** The hidden field Turnstile writes into a form. */
export const BOT_CHECK_FIELD = 'cf-turnstile-response';

export const BOT_CHECK_MESSAGE = 'We could not confirm this came from a person. Please try again.';

export type BotCheckResult =
  | { ok: true; checked: boolean }
  | { ok: false; reason: 'missing-token' | 'rejected' | 'unreachable'; codes?: string[] };

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isBotCheckConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}

/** What Turnstile's answer means. Anything but an explicit success is a refusal. */
export function interpret(body: unknown): BotCheckResult {
  const b = (body ?? {}) as { success?: unknown; 'error-codes'?: unknown };
  if (b.success === true) return { ok: true, checked: true };
  const codes = Array.isArray(b['error-codes']) ? b['error-codes'].filter((c): c is string => typeof c === 'string') : [];
  return { ok: false, reason: 'rejected', codes };
}

export async function verifyBotCheck(
  token: string | null | undefined,
  remoteIp?: string | null,
  secret: string | undefined = process.env.TURNSTILE_SECRET_KEY
): Promise<BotCheckResult> {
  if (!secret) return { ok: true, checked: false };
  if (!token) return { ok: false, reason: 'missing-token' };

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false, reason: 'unreachable' };
    return interpret(await response.json());
  } catch (error) {
    console.error('[botcheck] could not reach the verifier', error);
    return { ok: false, reason: 'unreachable' };
  }
}
