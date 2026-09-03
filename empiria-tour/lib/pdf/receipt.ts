import { PdfDoc, LETTER, INK, STONE, LINE, FLAME } from './writer';
import { wrap, truncate, measure } from './widths';
import { formatPrice, formatDateRange, formatDepartureDate } from '@/lib/money';
import type { ReceiptData } from '@/lib/receipt';

/**
 * The receipt document — Part D's itemised total, made into a thing a traveller
 * can keep.
 *
 * Pure: `ReceiptData` in, bytes out, no I/O. That is what makes it testable
 * without a database and reusable from two places — the download route now, and
 * Part C's outbox as an attachment once Resend's DNS lands, rendering the same
 * bytes rather than a second implementation.
 *
 * ## What it deliberately does not say
 *
 * No wording is invented here. §2.3 puts the legally required text on Empiria
 * and only the mechanism on Elevsoft, so the seller identity, the statutory
 * notice and every Part D disclosure are rendered exactly as supplied and are
 * conspicuously absent when they are not. The one editorial line in this file
 * is the note that appears when no seller is configured, and it describes the
 * gap rather than filling it.
 */

const MARGIN = 56;
const CONTENT = LETTER.width - MARGIN * 2;
const RIGHT = MARGIN + CONTENT;
const BOTTOM = LETTER.height - MARGIN - 24; // 24pt reserved for the footer

const LABEL = { font: 'regular' as const, size: 7.5, color: STONE, tracking: 0.9 };

const STATUS_COPY: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  balance_due: 'Balance outstanding',
  paid_in_full: 'Paid in full',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  travelled: 'Trip complete',
};

const PAYMENT_KIND: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  full: 'Payment',
  refund: 'Refund',
};

/** A layout cursor that starts a new page rather than running off the bottom. */
class Flow {
  y = MARGIN;
  constructor(readonly doc: PdfDoc) {}

  /** Ensure `height` points remain; break to a new page if they do not. */
  need(height: number): void {
    if (this.y + height <= BOTTOM) return;
    this.doc.addPage();
    this.y = MARGIN;
  }

  gap(h: number): void {
    this.y += h;
  }

  /** A section heading with the hairline the site puts under its own. */
  heading(text: string): void {
    this.need(34);
    this.gap(18);
    this.doc.text(MARGIN, this.y, text, { font: 'bold', size: 11.5, color: INK });
    this.gap(6);
    this.doc.line(MARGIN, this.y, RIGHT, this.y, { color: LINE });
    this.gap(12);
  }

  /** A label/value row, value right-aligned. The shape of every table here. */
  row(left: string, right: string, opts: { bold?: boolean; muted?: boolean; size?: number } = {}): void {
    const size = opts.size ?? 9.5;
    this.need(size + 7);
    const font = opts.bold ? ('bold' as const) : ('regular' as const);
    const color = opts.muted ? STONE : INK;
    // Never let a long label collide with the amount beside it.
    const room = CONTENT - measure(right, font, size) - 16;
    this.doc.text(MARGIN, this.y, truncate(left, font, size, room), { font, size, color });
    this.doc.textRight(RIGHT, this.y, right, { font, size, color });
    this.gap(size + 7);
  }

  /** A wrapped paragraph of supplied content. */
  paragraph(text: string, size = 9, color = STONE): void {
    for (const line of wrap(text, 'regular', size, CONTENT)) {
      this.need(size + 4);
      if (line !== '') this.doc.text(MARGIN, this.y, line, { size, color });
      this.gap(size + 4);
    }
  }
}

export function renderReceipt(data: ReceiptData): Uint8Array {
  const money = (cents: number) => formatPrice(cents, data.currency);
  const doc = new PdfDoc({
    title: `Receipt ${data.reference}`,
    // Dated by the booking's own facts, never by the clock. Two renders of the
    // same booking are then byte-identical, which is the property that makes
    // generating on demand equivalent to having stored it.
    producedAt: new Date(data.producedAt),
  });
  const f = new Flow(doc);

  // ── Masthead ─────────────────────────────────────────────────────────────
  const seller = data.seller.companyName;
  f.gap(14);
  doc.text(MARGIN, f.y, seller ?? 'Seller not yet identified', {
    font: 'bold',
    size: 15,
    color: seller ? INK : FLAME,
  });
  doc.textRight(RIGHT, f.y, 'RECEIPT', { font: 'bold', size: 11, color: STONE, tracking: 1.6 });
  f.gap(13);

  // §2.2: the seller is the merchant of record and must say who it is. While
  // PROJECT.md item 2 is outstanding these lines are simply missing, and the
  // receipt says so rather than papering over it.
  const sellerLines = [
    data.seller.registrationNumber
      ? `Travel registration ${data.seller.registrationNumber}`
      : 'Travel registration number not set',
    [data.seller.contactEmail, data.seller.contactPhone].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  for (const line of sellerLines) {
    doc.text(MARGIN, f.y, line, { size: 8.5, color: STONE });
    f.gap(11);
  }

  f.gap(6);
  doc.line(MARGIN, f.y, RIGHT, f.y, { color: INK, width: 1 });
  f.gap(20);

  // ── Reference / issued / status ──────────────────────────────────────────
  const meta: [string, string][] = [
    ['REFERENCE', data.reference],
    ['ISSUED', formatDepartureDate(data.producedAt.slice(0, 10))],
    ['STATUS', STATUS_COPY[data.status] ?? data.status],
  ];
  const colWidth = CONTENT / 3;
  meta.forEach(([label, value], i) => {
    doc.text(MARGIN + i * colWidth, f.y, label, LABEL);
    doc.text(MARGIN + i * colWidth, f.y + 14, truncate(value, 'bold', 11, colWidth - 12), {
      font: 'bold',
      size: 11,
      color: INK,
    });
  });
  f.gap(30);

  // ── Billed to ────────────────────────────────────────────────────────────
  f.heading('Billed to');
  f.row(data.lead.name, '');
  f.row(data.lead.email, '', { muted: true });
  if (data.lead.phone) f.row(data.lead.phone, '', { muted: true });

  // ── The trip ─────────────────────────────────────────────────────────────
  f.heading('Trip');
  f.row(data.packageTitle, '', { bold: true });
  f.row(formatDateRange(data.departure.startsOn, data.departure.endsOn), '', { muted: true });
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const party = [
    plural(data.party.adults, 'adult', 'adults'),
    data.party.children > 0 ? plural(data.party.children, 'child', 'children') : null,
    data.party.infants > 0 ? plural(data.party.infants, 'infant', 'infants') : null,
  ].filter(Boolean).join(', ');
  f.row(party, '', { muted: true });

  // ── What it costs ────────────────────────────────────────────────────────
  // The same lines and the same formatter as the booking page. STRIPE.md warns
  // that a receipt disagreeing with the booking page is worse than a terse one,
  // and this is where that would happen.
  f.heading('What it costs');
  for (const line of data.lines) {
    f.row(line.quantity > 1 ? `${line.label}  × ${line.quantity}` : line.label, money(line.amountCents));
  }
  f.need(24);
  doc.line(MARGIN, f.y - 4, RIGHT, f.y - 4, { color: LINE });
  f.gap(6);
  f.row(`Total (${data.currency})`, money(data.totals.totalCents), { bold: true, size: 11 });

  // ── Payments ─────────────────────────────────────────────────────────────
  f.heading('Payments received');
  if (data.payments.length === 0) {
    f.paragraph('No payment has been received against this booking.');
    f.gap(4);
  } else {
    for (const p of data.payments) {
      const label = PAYMENT_KIND[p.kind] ?? p.kind;
      const when = formatDepartureDate(p.createdAt.slice(0, 10));
      f.row(`${label}  ·  ${when}  ·  ${p.provider}`, money(p.amountCents));
    }
    f.need(24);
    doc.line(MARGIN, f.y - 4, RIGHT, f.y - 4, { color: LINE });
    f.gap(6);
    f.row('Paid to date', money(data.totals.amountPaidCents), { bold: true });
  }

  if (data.totals.balanceCents > 0) {
    f.row(
      data.totals.balanceDueOn
        ? `Balance due by ${formatDepartureDate(data.totals.balanceDueOn)}`
        : 'Balance outstanding',
      money(data.totals.balanceCents),
      { bold: true, size: 11 }
    );
  }

  // ── Travellers ───────────────────────────────────────────────────────────
  if (data.travellers.length > 0) {
    f.heading('Travelling');
    for (const t of data.travellers) {
      f.row(t.legalName, t.isLead ? `${t.travellerType} · lead` : t.travellerType, { muted: false });
    }
  }

  // ── What was agreed ──────────────────────────────────────────────────────
  if (data.acknowledgements.length > 0) {
    f.heading('You agreed to');
    for (const a of data.acknowledgements) {
      f.row(a.label, formatDepartureDate(a.acceptedAt.slice(0, 10)), { muted: true });
    }
  }

  // ── Part D ───────────────────────────────────────────────────────────────
  // Rendered verbatim. Empiria owns this wording under §2.3; nothing here
  // edits, summarises or reorders it beyond the sort order it was given.
  for (const d of data.disclosures) {
    f.heading(d.name);
    f.paragraph(d.body);
  }

  if (data.seller.statutoryNotice) {
    f.heading('Statutory notice');
    f.paragraph(data.seller.statutoryNotice);
  }

  // ── Footers ──────────────────────────────────────────────────────────────
  // After the content, because "Page 1 of 3" needs the final count.
  const total = doc.pageCount;
  for (let i = 0; i < total; i++) {
    doc.setPage(i);
    const y = LETTER.height - MARGIN + 4;
    doc.line(MARGIN, y - 12, RIGHT, y - 12, { color: LINE });
    doc.text(MARGIN, y, `Booking ${data.reference}`, { size: 8, color: STONE });
    doc.textRight(RIGHT, y, `Page ${i + 1} of ${total}`, { size: 8, color: STONE });
  }

  return doc.build();
}

/** The filename a traveller sees. Safe on every filesystem we might meet. */
export function receiptFilename(reference: string): string {
  return `empiria-receipt-${reference.toLowerCase().replace(/[^a-z0-9]/g, '')}.pdf`;
}
