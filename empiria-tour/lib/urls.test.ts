import { safeNextPath } from './urls';

/**
 * Where sign-in is allowed to send you.
 *
 *   bun run lib/urls.test.ts
 *
 * `next` arrives in a query string, which means it arrives from whoever wrote
 * the link. The guard this replaces was `startsWith('/') && !startsWith('//')`,
 * which reads as airtight and is not: browsers normalise a backslash to a
 * slash in a special scheme, so `/\evil.com` passed it and resolved to a
 * different origin entirely. Tab, CR and LF are stripped before parsing and
 * get through the same way, which is why the fix parses rather than blacklists
 * — there is no list of characters that stays complete.
 */

const ORIGIN = 'https://tour.empiria.events';

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  if (!good) failed++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}${good ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`
  );
};

// ── What must be allowed through ────────────────────────────────────────────
eq('a plain path', safeNextPath('/account', ORIGIN), '/account');
eq('a nested path', safeNextPath('/account/bookings', ORIGIN), '/account/bookings');
eq('keeps the query', safeNextPath('/tours?destination=greece', ORIGIN), '/tours?destination=greece');
eq('keeps the fragment', safeNextPath('/terms#refunds', ORIGIN), '/terms#refunds');
eq('keeps query and fragment together', safeNextPath('/a?b=1#c', ORIGIN), '/a?b=1#c');
eq('an absolute same-origin URL reduces to its path', safeNextPath(`${ORIGIN}/account`, ORIGIN), '/account');
eq('normalises a traversal rather than trusting it', safeNextPath('/a/../b', ORIGIN), '/b');

// ── What must not ───────────────────────────────────────────────────────────
eq('a protocol-relative host', safeNextPath('//evil.com', ORIGIN), '/');
eq('a backslash host — the bypass that prompted this', safeNextPath('/\\evil.com', ORIGIN), '/');
eq('a backslash-slash host', safeNextPath('/\\/evil.com', ORIGIN), '/');
eq('a tab before the slashes', safeNextPath('/\t/evil.com', ORIGIN), '/');
eq('a newline before the slashes', safeNextPath('/\n/evil.com', ORIGIN), '/');
eq('a carriage return before the slashes', safeNextPath('/\r/evil.com', ORIGIN), '/');
eq('an absolute URL to another origin', safeNextPath('https://evil.com/x', ORIGIN), '/');
eq('a scheme-shifted absolute URL', safeNextPath('http://tour.empiria.events/x', ORIGIN), '/');
eq('a javascript: URL', safeNextPath('javascript:alert(1)', ORIGIN), '/');
eq('a data: URL', safeNextPath('data:text/html,<script>alert(1)</script>', ORIGIN), '/');
eq('a subdomain that merely looks like ours', safeNextPath('https://tour.empiria.events.evil.com/x', ORIGIN), '/');
eq('userinfo smuggling the real host', safeNextPath('https://tour.empiria.events@evil.com/x', ORIGIN), '/');

// ── Absence, and nonsense ───────────────────────────────────────────────────
eq('null', safeNextPath(null, ORIGIN), '/');
eq('undefined', safeNextPath(undefined, ORIGIN), '/');
eq('empty string', safeNextPath('', ORIGIN), '/');
eq('a bare word is relative, and stays on-origin', safeNextPath('account', ORIGIN), '/account');
eq('an unusable origin refuses rather than throws', safeNextPath('/account', 'not-a-url'), '/');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
