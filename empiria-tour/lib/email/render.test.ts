import {
  TemplateError,
  escapeHtml,
  formatValue,
  inspectTemplate,
  renderEmail,
  type Template,
} from './render.ts';
import { COMMON_FIELDS, FIELD_KINDS, TEMPLATE_FIELDS, TEMPLATE_KEYS, fieldsFor } from './fields.ts';

/**
 * The email renderer's failure modes are all silent ones: a placeholder that
 * ships unsubstituted, a name that breaks the markup around it, a total shown
 * in cents. None of them throw on their own. So they are asserted.
 *
 * Run: node --experimental-strip-types lib/email/render.test.ts
 */

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra = '') {
  if (cond) pass++;
  else { fail++; console.error('FAIL:', name, extra); }
}
function throws(name: string, fn: () => unknown, match?: RegExp) {
  try { fn(); fail++; console.error('FAIL:', name, '— did not throw'); }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (match && !match.test(msg)) { fail++; console.error('FAIL:', name, '— wrong message:', msg); }
    else pass++;
  }
}

const tpl = (over: Partial<Template> = {}): Template => ({
  key: 'booking_confirmed',
  subject: 'Your booking {{booking.reference}}',
  body_html: '<p>Hello {{traveller.name}}, {{package.title}} on {{departure.date}}. Total {{booking.total}}.</p>',
  body_text: null,
  ...over,
});

const data = {
  'booking.reference': 'EMP-0042',
  'traveller.name': 'Nguyễn Thị Minh',
  'package.title': 'Kyoto in Spring',
  'departure.date': '2027-05-04',
  'booking.total': 285000,
  'booking.travellers': '2 adults',
  'departure.meeting_point': 'Terminal 1',
  'company.name': 'Empiria World Inc.',
  'company.registration_number': '50012345',
  'company.contact_email': 'hello@example.com',
  _currency: 'CAD',
};

// ── substitution ───────────────────────────────────────────────────────────
const r = renderEmail(tpl(), data);
ok('subject substitutes', r.subject === 'Your booking EMP-0042', r.subject);
ok('body substitutes the name', r.html.includes('Nguyễn Thị Minh'), r.html);
ok('money renders as currency, not cents', r.html.includes('$2,850'), r.html);
ok('cents never leak', !r.html.includes('285000'), r.html);
ok('date renders long-form', r.html.includes('May 4, 2027'), r.html);
ok('no placeholder survives', !/\{\{/.test(r.html) && !/\{\{/.test(r.subject), r.html);
ok('text body is null when absent', r.text === null);

// Whitespace inside the braces is an author typo, not an error.
ok('tolerates {{ spaced }}',
  renderEmail(tpl({ subject: 'Ref {{  booking.reference  }}' }), data).subject === 'Ref EMP-0042');

// ── failing loudly ─────────────────────────────────────────────────────────
throws('unknown field throws',
  () => renderEmail(tpl({ body_html: '<p>{{booking.nonsense}}</p>' }), data),
  /not available in a booking_confirmed email/);

throws('field valid elsewhere but not for this template throws',
  // payment.method is a real field — but only on refund_issued.
  () => renderEmail(tpl({ body_html: '<p>{{payment.method}}</p>' }), data),
  /not available/);

throws('declared field explicitly undefined throws',
  () => renderEmail(tpl({ body_html: '<p>{{booking.travellers}}</p>' }),
    { ...data, 'booking.travellers': undefined }),
  /No value was supplied/);

const withoutMeetingPoint: Record<string, unknown> = { ...data };
delete withoutMeetingPoint['departure.meeting_point'];
throws('declared field simply absent throws',
  () => renderEmail(tpl({ body_html: '<p>{{departure.meeting_point}}</p>' }), withoutMeetingPoint),
  /No value was supplied/);

// But a null value is a real answer — a departure with no meeting point set.
ok('null renders empty rather than throwing',
  renderEmail(tpl({ body_html: '<p>[{{departure.meeting_point}}]</p>' }),
    { ...data, 'departure.meeting_point': null }).html.includes('[]'));

throws('empty template throws rather than sending a blank',
  () => renderEmail(tpl({ body_html: '   ' }), data),
  /has no body yet/);
throws('empty subject throws',
  () => renderEmail(tpl({ subject: '' }), data),
  /has no subject yet/);

const err = (() => { try { renderEmail(tpl({ body_html: '{{booking.nonsense}}' }), data); } catch (e) { return e; } })();
ok('error names the offending field',
  err instanceof TemplateError && err.field === 'booking.nonsense');

// ── escaping: the body is markup and the values are user input ─────────────
const hostile = renderEmail(
  tpl({ body_html: '<p>Hello {{traveller.name}}</p>' }),
  { ...data, 'traveller.name': '<script>alert(1)</script>' }
);
ok('markup in a value is escaped',
  hostile.html.includes('&lt;script&gt;') && !hostile.html.includes('<script>'), hostile.html);

const amp = renderEmail(
  tpl({ body_html: '<p>{{traveller.name}}</p>' }),
  { ...data, 'traveller.name': 'Foo & Sons "Ltd"' }
);
ok('ampersands and quotes escaped', amp.html.includes('Foo &amp; Sons &quot;Ltd&quot;'), amp.html);

// The plain-text alternative is not markup, so it must NOT be escaped.
const withText = renderEmail(
  tpl({ body_text: 'Hello {{traveller.name}}' }),
  { ...data, 'traveller.name': 'Foo & Sons' }
);
ok('plain text is not escaped', withText.text === 'Hello Foo & Sons', String(withText.text));

// A subject is not markup either.
ok('subject is not escaped',
  renderEmail(tpl({ subject: '{{traveller.name}}' }), { ...data, 'traveller.name': 'A & B' }).subject === 'A & B');

ok('escapeHtml covers all five', escapeHtml(`&<>"'`) === '&amp;&lt;&gt;&quot;&#39;');

// ── formatting ─────────────────────────────────────────────────────────────
ok('round money drops cents', formatValue(285000, 'money', 'CAD', 'en-CA') === '$2,850');
ok('uneven money keeps cents', formatValue(285050, 'money', 'CAD', 'en-CA').includes('2,850.50'));
ok('money respects currency', formatValue(1000, 'money', 'USD', 'en-CA').includes('10'));
ok('zero money is not blank', formatValue(0, 'money', 'CAD', 'en-CA') === '$0');
ok('null renders as empty, not "null"', formatValue(null, 'text', 'CAD', 'en-CA') === '');
ok('time drops seconds', formatValue('08:30:00', 'time', 'CAD', 'en-CA') === '08:30');
ok('int truncates', formatValue(3.7, 'int', 'CAD', 'en-CA') === '3');
// A date must not shift by a timezone — a departure is a day, not an instant.
// Parsed as a calendar date, so a viewer west of UTC does not see 31 December.
ok('date does not shift', formatValue('2027-01-01', 'date', 'CAD', 'en-CA') === 'January 1, 2027',
  formatValue('2027-01-01', 'date', 'CAD', 'en-CA'));

// ── the contract itself ────────────────────────────────────────────────────
const PART_C = [
  'account_created', 'booking_confirmed', 'deposit_taken', 'balance_due', 'balance_paid',
  'installment_due', 'installment_paid', 'booking_amended', 'booking_cancelled',
  'refund_issued', 'departure_change', 'pre_departure', 'admin_alert',
];
const PARTNER = [
  'partner_application_received', 'partner_application_approved',
  'partner_application_declined', 'partner_application_alert',
];
ok('the thirteen of Revision 1 are all present', PART_C.every((k) => TEMPLATE_KEYS.includes(k)),
  PART_C.filter((k) => !TEMPLATE_KEYS.includes(k)).join(', '));
ok('the four partner-surface emails are present (outside Exhibit A)', PARTNER.every((k) => TEMPLATE_KEYS.includes(k)),
  PARTNER.filter((k) => !TEMPLATE_KEYS.includes(k)).join(', '));
ok('and nothing else', TEMPLATE_KEYS.length === PART_C.length + PARTNER.length, String(TEMPLATE_KEYS.length));
ok('installment templates present',
  TEMPLATE_KEYS.includes('installment_due') && TEMPLATE_KEYS.includes('installment_paid'));

const unknownKinds: string[] = [];
for (const key of TEMPLATE_KEYS) {
  for (const field of TEMPLATE_FIELDS[key]) {
    if (!(field in FIELD_KINDS)) unknownKinds.push(`${key}:${field}`);
  }
}
ok('every declared field has a kind', unknownKinds.length === 0, unknownKinds.join(', '));

for (const f of COMMON_FIELDS) {
  ok(`common field ${f} available everywhere`, fieldsFor('refund_issued').includes(f));
}

// ── inspectTemplate, for the console's author-time warning ─────────────────
const seen = inspectTemplate('booking_confirmed',
  'Ref {{booking.reference}}', '<p>{{traveller.name}} {{booking.bogus}}</p>');
ok('inspect finds used fields',
  seen.used.includes('booking.reference') && seen.used.includes('traveller.name'), JSON.stringify(seen));
ok('inspect flags unknown fields', seen.unknown.length === 1 && seen.unknown[0] === 'booking.bogus',
  JSON.stringify(seen));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
