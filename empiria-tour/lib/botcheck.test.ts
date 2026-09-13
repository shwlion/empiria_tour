import { interpret, verifyBotCheck } from './botcheck';

/**
 * The bot-check seam: unconfigured it passes everything and says so;
 * configured it refuses a missing token and believes only an explicit yes.
 * The last two assertions go to Cloudflare with its published dummy secrets
 * (always-pass, always-fail), so they need the network.
 *
 *   bun run lib/botcheck.test.ts
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};

// ── pure ────────────────────────────────────────────────────────────────────
eq('a success is a pass that was checked', interpret({ success: true }), { ok: true, checked: true });
eq('a failure carries its codes', interpret({ success: false, 'error-codes': ['timeout-or-duplicate'] }), { ok: false, reason: 'rejected', codes: ['timeout-or-duplicate'] });
eq('garbage is a refusal, not a pass', interpret('yes'), { ok: false, reason: 'rejected', codes: [] });
eq('"success": "true" (a string) is not a success', interpret({ success: 'true' }), { ok: false, reason: 'rejected', codes: [] });

eq('unconfigured → pass, and honest that nothing was checked', await verifyBotCheck('anything', null, undefined), { ok: true, checked: false });
eq('configured + no token → refused without a network call', await verifyBotCheck(null, null, 'not-a-real-secret'), { ok: false, reason: 'missing-token' });
eq('configured + empty token → the same', await verifyBotCheck('', null, 'not-a-real-secret'), { ok: false, reason: 'missing-token' });

// ── the round trip, against Cloudflare's dummy secrets ──────────────────────
const ALWAYS_PASS = '1x0000000000000000000000000000000AA';
const ALWAYS_FAIL = '2x0000000000000000000000000000000AA';
eq('always-pass secret → checked pass', await verifyBotCheck('any-token', '203.0.113.9', ALWAYS_PASS), { ok: true, checked: true });
const fail = await verifyBotCheck('any-token', null, ALWAYS_FAIL);
eq('always-fail secret → rejected', fail.ok === false && fail.reason === 'rejected', true);

if (failed) {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}
console.log('\nALL PASS');
