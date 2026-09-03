import { toWinAnsi, measure, wrap, truncate } from './widths';
import { PdfDoc, LETTER } from './writer';
import { renderReceipt, receiptFilename } from './receipt';
import type { ReceiptData } from '@/lib/receipt';

/**
 * The PDF writer and the receipt document.
 *
 *   bun run lib/pdf/receipt.test.ts
 *
 * Nothing here needs a database or a network: `renderReceipt` is pure, which is
 * the whole reason the loader and the document are separate files.
 */

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
};
const ok = (name: string, cond: boolean, detail = '') => {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !detail ? '' : `\n        ${detail}`}`);
};

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

// ── WinAnsi transcoding ────────────────────────────────────────────────────

eq('ascii passes through', toWinAnsi('Receipt 1A2B'), [...'Receipt 1A2B'].map((c) => c.charCodeAt(0)));
eq('em dash lands on 0x97', toWinAnsi('—'), [0x97]);
eq('en dash lands on 0x96', toWinAnsi('–'), [0x96]);
eq('curly apostrophe lands on 0x92', toWinAnsi('’'), [0x92]);
eq('latin-1 accents keep their own code', toWinAnsi('é'), [0xe9]);
eq('non-breaking space becomes a plain space', toWinAnsi(' '), [0x20]);
eq('narrow no-break space becomes a plain space', toWinAnsi(' '), [0x20]);
// Intl.NumberFormat emits U+2212 for negatives; a refund line rendering "?150"
// would only be noticed after it had been sent to somebody.
eq('unicode minus becomes a hyphen', toWinAnsi('−'), [0x2d]);
eq('unmappable characters become a question mark', toWinAnsi('日'), [0x3f]);

// A real refund amount, formatted the way the site formats it, must survive.
{
  const formatted = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(-1500);
  ok(
    'a negative CAD amount transcodes with no replacement characters',
    !toWinAnsi(formatted).includes(0x3f),
    `${JSON.stringify(formatted)} -> ${JSON.stringify(toWinAnsi(formatted))}`
  );
}

// ── Metrics ────────────────────────────────────────────────────────────────

// Helvetica 'A' is 667/1000 em; three of them at 10pt is 20.01pt.
eq('measures a known run', Math.round(measure('AAA', 'regular', 10) * 100) / 100, 20.01);
// Helvetica-Bold 'A' is 722/1000.
eq('bold is wider than regular', measure('AAA', 'bold', 10) > measure('AAA', 'regular', 10), true);
eq('measure scales with size', measure('Hello', 'regular', 20), measure('Hello', 'regular', 10) * 2);
eq('the empty string is zero wide', measure('', 'regular', 10), 0);
// Digits are tabular in Helvetica — every one is 556 — which is what keeps the
// money column aligned without a monospaced face.
{
  const widths = [...'0123456789'].map((d) => measure(d, 'regular', 10));
  eq('digits are all the same width', new Set(widths).size, 1);
}

// ── Wrapping ───────────────────────────────────────────────────────────────

eq('a short line is not wrapped', wrap('one two', 'regular', 10, 500), ['one two']);
{
  const lines = wrap('alpha bravo charlie delta echo foxtrot golf hotel', 'regular', 10, 80);
  ok('wraps to the column', lines.length > 1, JSON.stringify(lines));
  ok(
    'no wrapped line exceeds the column',
    lines.every((l) => measure(l, 'regular', 10) <= 80),
    JSON.stringify(lines.map((l) => Math.round(measure(l, 'regular', 10))))
  );
}
{
  // A URL in a supplied disclosure block is the real case for this.
  const lines = wrap('https://example.com/a-very-long-path-that-cannot-break-on-a-space', 'regular', 10, 60);
  ok(
    'a single over-long word is split rather than overflowing',
    lines.length > 1 && lines.every((l) => measure(l, 'regular', 10) <= 60),
    JSON.stringify(lines)
  );
}
eq('blank lines between paragraphs survive', wrap('a\n\nb', 'regular', 10, 500), ['a', '', 'b']);

eq('short text is not truncated', truncate('short', 'regular', 10, 500), 'short');
{
  const t = truncate('a very long package title that will not fit', 'regular', 10, 60);
  ok('truncation fits and is marked', t.endsWith('…') && measure(t, 'regular', 10) <= 60, t);
}

// ── The writer ─────────────────────────────────────────────────────────────

{
  const doc = new PdfDoc();
  doc.text(50, 50, 'Hello');
  const out = text(doc.build());
  ok('starts with a PDF header', out.startsWith('%PDF-1.4'), out.slice(0, 8));
  ok('ends with EOF', out.trimEnd().endsWith('%%EOF'), JSON.stringify(out.slice(-10)));
  ok('carries an xref table', out.includes('\nxref\n'));
  ok('declares a catalog and a page tree', out.includes('/Type /Catalog') && out.includes('/Type /Pages'));
  ok('embeds nothing — base-14 only', out.includes('/BaseFont /Helvetica') && !out.includes('/FontFile'));
  ok('uses WinAnsi encoding', out.includes('/Encoding /WinAnsiEncoding'));
  ok('the drawn string is in the stream', out.includes('(Hello) Tj'));

  // startxref must actually point at the xref table, or readers reject the file.
  const at = Number(out.slice(out.lastIndexOf('startxref') + 9).trim().split('\n')[0]);
  ok('startxref points at the xref table', out.slice(at, at + 4) === 'xref', `offset ${at} -> ${JSON.stringify(out.slice(at, at + 8))}`);

  // Every object in the xref must begin with its own "N 0 obj". Line 0 is
  // "xref", line 1 the subsection header, line 2 the free entry for object 0 —
  // so the entry for object 1 is line 3.
  const size = Number(/\/Size (\d+)/.exec(out)![1]);
  const entries = out.slice(at).split('\n').slice(3, 3 + size - 1);
  ok(
    'every xref offset lands on its object',
    entries.every((e, i) => out.slice(Number(e.slice(0, 10))).startsWith(`${i + 1} 0 obj`)),
    JSON.stringify(entries.slice(0, 3))
  );
}

{
  const doc = new PdfDoc();
  doc.text(10, 10, 'a (b) c \\ d');
  const out = text(doc.build());
  ok('parentheses and backslashes are escaped', out.includes('(a \\(b\\) c \\\\ d) Tj'), out.slice(out.indexOf('BT'), out.indexOf('BT') + 80));
}

{
  const doc = new PdfDoc();
  eq('starts on one page', doc.pageCount, 1);
  doc.addPage();
  eq('addPage adds one', doc.pageCount, 2);
  doc.setPage(0);
  doc.text(10, 10, 'BackOnPageOne');
  const out = text(doc.build());
  eq('two page objects are written', out.split('/Type /Page\n').length - 1 + (out.match(/\/Type \/Page /g) ?? []).length, 2);
  ok('setPage wrote to the earlier page', out.includes('(BackOnPageOne) Tj'));
  let threw = false;
  try { doc.setPage(9); } catch { threw = true; }
  eq('setPage refuses a page that does not exist', threw, true);
}

{
  // Right alignment is what keeps the money column straight, so assert the
  // geometry rather than trusting it.
  const doc = new PdfDoc();
  doc.textRight(500, 100, 'ABC', { size: 10 });
  const out = text(doc.build());
  const x = Number(/1 0 0 1 ([\d.]+) [\d.]+ Tm/.exec(out)![1]);
  const expected = Math.round((500 - measure('ABC', 'regular', 10)) * 100) / 100;
  eq('textRight puts the right edge on the anchor', x, expected);
}

{
  // y is measured from the top by this class and from the bottom by PDF.
  const doc = new PdfDoc();
  doc.text(0, 100, 'X');
  const out = text(doc.build());
  const y = Number(/1 0 0 1 [\d.]+ ([\d.]+) Tm/.exec(out)![1]);
  eq('y is flipped to PDF space', y, LETTER.height - 100);
}

// ── The receipt ────────────────────────────────────────────────────────────

const fixture: ReceiptData = {
  reference: 'A1B2C3',
  status: 'confirmed',
  currency: 'CAD',
  createdAt: '2026-09-01T10:00:00.000Z',
  lead: { name: 'Dana Whitfield', email: 'dana@example.com', phone: '+1 416 555 0134' },
  party: { adults: 2, children: 1, infants: 0 },
  packageTitle: 'Cyclades in Eight Days',
  departure: { startsOn: '2027-05-01', endsOn: '2027-05-08' },
  lines: [
    { label: 'Adult fare', quantity: 2, amountCents: 430000 },
    { label: 'Child fare', quantity: 1, amountCents: 148000 },
    { label: 'Airport transfer', quantity: 3, amountCents: 19500 },
    { label: 'Promotion SPRING7', quantity: 1, amountCents: -41825 },
    { label: 'HST', quantity: 1, amountCents: 72270 },
  ],
  travellers: [
    { position: 1, travellerType: 'adult', legalName: 'Dana Whitfield', isLead: true },
    { position: 2, travellerType: 'adult', legalName: 'Rowan Whitfield', isLead: false },
    { position: 3, travellerType: 'child', legalName: 'Wren Whitfield', isLead: false },
  ],
  acknowledgements: [{ label: 'Booking conditions', acceptedAt: '2026-09-01T10:02:00.000Z' }],
  payments: [
    { kind: 'deposit', amountCents: 125589, currency: 'CAD', provider: 'stripe', providerRef: 'pi_1', createdAt: '2026-09-01T10:05:00.000Z' },
  ],
  totals: { totalCents: 627945, amountPaidCents: 125589, balanceCents: 502356, balanceDueOn: '2027-04-01' },
  seller: {
    companyName: 'Empiria World Inc.',
    registrationNumber: '50021234',
    statutoryNotice: 'All bookings are subject to the Ontario Travel Industry Act.',
    contactEmail: 'hello@example.com',
    contactPhone: '+1 416 555 0100',
  },
  disclosures: [{ name: 'Cancellation', body: 'Cancellations more than 60 days before departure receive a full refund less the deposit.' }],
  producedAt: '2026-09-01T10:05:00.000Z',
};

{
  const out = text(renderReceipt(fixture));
  ok('renders a valid PDF', out.startsWith('%PDF-1.4') && out.trimEnd().endsWith('%%EOF'));
  ok('names the seller', out.includes('(Empiria World Inc.) Tj'));
  ok('states the travel registration', out.includes('Travel registration 50021234'));
  ok('carries the booking reference', out.includes('(A1B2C3) Tj'));
  ok('carries the package title', out.includes('(Cyclades in Eight Days) Tj'));
  ok('lists every traveller', ['Dana Whitfield', 'Rowan Whitfield', 'Wren Whitfield'].every((n) => out.includes(`(${n}) Tj`)));
  ok('renders the Part D disclosure verbatim', out.includes('Cancellations more than 60 days before departure'));
  ok('renders the statutory notice', out.includes('Ontario Travel Industry Act'));
  ok('shows the acknowledgement', out.includes('(Booking conditions) Tj'));
  ok('is paginated', /Page 1 of \d/.test(out));

  // The receipt must agree with the booking page, which formats with the same
  // helper — STRIPE.md calls a disagreeing receipt worse than a terse one.
  const { formatPrice } = await import('@/lib/money');
  ok('the total matches the booking page formatter', out.includes(`(${formatPrice(627945, 'CAD')})`), formatPrice(627945, 'CAD'));
  ok('the negative promotion line renders', out.includes(`(${formatPrice(-41825, 'CAD')})`), formatPrice(-41825, 'CAD'));
  ok('the balance is stated', out.includes(`(${formatPrice(502356, 'CAD')})`));
  ok('no character fell back to the replacement glyph in a money string', !out.includes('(?'), '');
}

{
  // Two renders of the same booking must be byte-identical: that equivalence is
  // what makes generating on demand as good as having stored the bytes.
  const a = renderReceipt(fixture);
  const b = renderReceipt(fixture);
  eq('rendering is deterministic', Buffer.from(a).equals(Buffer.from(b)), true);
  ok('and does not embed the wall clock', text(a).includes('D:20260901100500+00\'00\''), '');
}

{
  // The state the platform is actually in today: item 2 unfilled.
  const out = text(renderReceipt({
    ...fixture,
    seller: { companyName: null, registrationNumber: null, statutoryNotice: null, contactEmail: null, contactPhone: null },
    disclosures: [],
  }));
  ok('an unidentified seller is stated, not invented', out.includes('Seller not yet identified'));
  ok('a missing registration number is stated', out.includes('Travel registration number not set'));
  ok('no company name is fabricated', !out.includes('Empiria World Inc.'));
}

{
  const out = text(renderReceipt({ ...fixture, payments: [], totals: { ...fixture.totals, amountPaidCents: 0, balanceCents: 627945 }, status: 'pending_payment' }));
  ok('an unpaid booking says so rather than showing a blank table', out.includes('No payment has been received'));
  ok('and is not described as confirmed', !out.includes('(Confirmed) Tj'));
}

{
  // Enough content to force a second page, which is where a broken flow shows.
  const many = Array.from({ length: 40 }, (_, i) => ({
    position: i + 1, travellerType: 'adult', legalName: `Traveller Number ${i + 1}`, isLead: i === 0,
  }));
  const out = text(renderReceipt({ ...fixture, travellers: many }));

  // What matters is not how many pages it takes but that the footers agree
  // with each other and with the number of pages actually written: a stale
  // count is the failure mode of writing footers before the content is done.
  const footers = [...out.matchAll(/Page (\d+) of (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const pageObjects = (out.match(/\/Type \/Page[ \n]/g) ?? []).length;
  ok('overflowing content paginates', pageObjects > 1, `${pageObjects} page object(s)`);
  ok(
    'every footer agrees on the total, and it is the real one',
    footers.length > 1 && footers.every(([, n]) => n === footers.length && n === pageObjects),
    JSON.stringify(footers),
  );
  ok(
    'pages are numbered 1..n in order',
    footers.every(([i], idx) => i === idx + 1),
    JSON.stringify(footers.map(([i]) => i)),
  );
  ok('the last traveller still renders', out.includes('(Traveller Number 40) Tj'));
}

{
  // Supplied content is not trusted to be well-behaved.
  const out = text(renderReceipt({
    ...fixture,
    packageTitle: 'A title with (parentheses) and a \\ backslash',
    disclosures: [{ name: 'Odd', body: 'Curly “quotes”, an em—dash, é, and 日本語.' }],
  }));
  ok('renders despite hostile content', out.startsWith('%PDF-1.4') && out.trimEnd().endsWith('%%EOF'));
  ok('escapes parentheses from supplied content', out.includes('\\(parentheses\\)'));
}

eq('filename is filesystem-safe', receiptFilename('A1B2-C3'), 'empiria-receipt-a1b2c3.pdf');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
