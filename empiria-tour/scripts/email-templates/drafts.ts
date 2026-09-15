/**
 * The first draft of every email, and the sample facts to preview each with.
 *
 * These are DRAFTS. §2.3 puts the wording on Empiria's desk, and the console
 * is where they edit it; migration 0020 seeds these only where a body is still
 * empty, and never over anything Empiria has written. What is held to here:
 * every number is a merge field, nothing states a term or a policy, and each
 * one says what happened, what the facts are, and what happens next.
 *
 * The HTML is the message only — the frame (lib/email/layout.ts) adds the
 * wordmark, the card and the footer. Styles are inline because email clients
 * honour little else; the helpers below keep fifteen bodies to one vocabulary.
 *
 *   bun run scripts/email-templates/preview.ts        # renders every draft to /tmp
 *   bun run scripts/email-templates/preview.ts --sql   # prints the migration
 */

export type Draft = {
  subject: string;
  html: string;
  text: string;
  /** Realistic values for the preview. Money in cents, dates ISO — as the enqueuer stores them. */
  sample: Record<string, unknown>;
};

// ── The vocabulary ──────────────────────────────────────────────────────────
const INK = '#1d2321';
const STONE = '#6a716d';
const LINE = '#ebe4d8';
const FLAME = '#f15a29';

const h1 = (t: string) =>
  `<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.01em;color:${INK};">${t}</h1>`;
const h2 = (t: string) =>
  `<h2 style="margin:26px 0 10px;font-size:13px;line-height:1.3;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${STONE};">${t}</h2>`;
const p = (t: string) => `<p style="margin:0 0 16px;">${t}</p>`;
/** Staff-typed or multi-line text: keeps the author's line breaks. */
const pre = (field: string) => `<p style="margin:0 0 16px;white-space:pre-line;">{{${field}}}</p>`;
const muted = (t: string) =>
  `<p style="margin:24px 0 0;font-size:14px;line-height:1.55;color:${STONE};">${t}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:26px 0 6px;"><a href="{{${href}}}" style="display:inline-block;background:${FLAME};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;line-height:1;padding:14px 24px;border-radius:999px;">${label}</a></p>`;
const facts = (rows: [string, string][]) => {
  const cell = (extra: string) =>
    `padding:11px 0;border-top:1px solid ${LINE};vertical-align:top;${extra}`;
  const body = rows
    .map(
      ([label, value], i) =>
        `<tr><td style="${cell(`font-size:13px;color:${STONE};width:36%;padding-right:16px;`)}${i === rows.length - 1 ? `border-bottom:1px solid ${LINE};` : ''}">${label}</td>` +
        `<td style="${cell('font-weight:600;')}${i === rows.length - 1 ? `border-bottom:1px solid ${LINE};` : ''}">${value}</td></tr>`
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 22px;border-collapse:collapse;">\n${body}\n</table>`;
};
const contact = (ref = true) =>
  muted(
    ref
      ? 'Questions? Write to {{company.contact_email}} and quote {{booking.reference}}.'
      : 'Questions? Write to {{company.contact_email}}.'
  );
const contactText = (ref = true) =>
  ref
    ? 'Questions? Write to {{company.contact_email}} and quote {{booking.reference}}.'
    : 'Questions? Write to {{company.contact_email}}.';

const booking = {
  'booking.reference': 'EMP-7Q4K',
  'traveller.name': 'Amira Haddad',
  'package.title': 'Cyclades in Eight Days',
  'departure.date': '2027-05-14',
  _currency: 'CAD',
  _locale: 'en-CA',
};

// ── The fifteen ─────────────────────────────────────────────────────────────
export const DRAFTS: Record<string, Draft> = {
  account_created: {
    subject: 'Confirm your email address',
    html: [
      h1('Welcome, {{traveller.name}}'),
      p('Your account is set up with <strong>{{account.email}}</strong>. Confirm the address and you&rsquo;re in.'),
      button('account.confirm_link', 'Confirm my email'),
      muted('If you didn&rsquo;t create this account, ignore this email and nothing will happen.'),
    ].join('\n'),
    text: [
      'Welcome, {{traveller.name}}',
      '',
      'Your account is set up with {{account.email}}. Confirm the address and you\'re in:',
      '{{account.confirm_link}}',
      '',
      'If you didn\'t create this account, ignore this email and nothing will happen.',
    ].join('\n'),
    sample: { 'traveller.name': 'Amira Haddad', 'account.email': 'amira@example.com', 'account.confirm_link': 'https://tour.empiria.events/auth/callback?code=sample' },
  },

  booking_confirmed: {
    subject: 'Your booking is confirmed — {{booking.reference}}',
    html: [
      h1('Your places are confirmed'),
      p('Thank you, {{traveller.name}}. Your booking for <strong>{{package.title}}</strong> is confirmed, and your places are held in your name.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Departs', '{{departure.date}}'],
        ['Travellers', '{{booking.travellers}}'],
        ['Meeting point', '{{departure.meeting_point}}'],
        ['Total', '{{booking.total}}'],
      ]),
      p('Keep the reference &mdash; it&rsquo;s how we find your booking whenever you get in touch. We&rsquo;ll write again before you travel with the practical details.'),
      contact(),
    ].join('\n'),
    text: [
      'Your places are confirmed',
      '',
      'Thank you, {{traveller.name}}. Your booking for {{package.title}} is confirmed, and your places are held in your name.',
      '',
      'Reference:     {{booking.reference}}',
      'Trip:          {{package.title}}',
      'Departs:       {{departure.date}}',
      'Travellers:    {{booking.travellers}}',
      'Meeting point: {{departure.meeting_point}}',
      'Total:         {{booking.total}}',
      '',
      'Keep the reference — it\'s how we find your booking whenever you get in touch. We\'ll write again before you travel with the practical details.',
      '',
      contactText(),
    ].join('\n'),
    sample: { ...booking, 'booking.total': 569000, 'departure.meeting_point': 'Piraeus Port, Gate E7, Athens', 'booking.travellers': '2 adults' },
  },

  deposit_taken: {
    subject: 'Deposit received — {{booking.reference}}',
    html: [
      h1('Deposit received'),
      p('Thank you, {{traveller.name}}. We&rsquo;ve received <strong>{{payment.amount}}</strong> towards your booking for <strong>{{package.title}}</strong>, and your places are held.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Departs', '{{departure.date}}'],
        ['Paid today', '{{payment.amount}}'],
        ['Balance', '{{booking.balance}}'],
        ['Balance due by', '{{booking.balance_due_on}}'],
      ]),
      p('We&rsquo;ll remind you before the balance is due, with a link to pay it.'),
      contact(),
    ].join('\n'),
    text: [
      'Deposit received',
      '',
      'Thank you, {{traveller.name}}. We\'ve received {{payment.amount}} towards your booking for {{package.title}}, and your places are held.',
      '',
      'Reference:      {{booking.reference}}',
      'Trip:           {{package.title}}',
      'Departs:        {{departure.date}}',
      'Paid today:     {{payment.amount}}',
      'Balance:        {{booking.balance}}',
      'Balance due by: {{booking.balance_due_on}}',
      '',
      'We\'ll remind you before the balance is due, with a link to pay it.',
      '',
      contactText(),
    ].join('\n'),
    sample: { ...booking, 'payment.amount': 150000, 'booking.balance': 419000, 'booking.balance_due_on': '2027-03-15' },
  },

  balance_due: {
    subject: 'Your balance is due by {{booking.balance_due_on}} — {{booking.reference}}',
    html: [
      h1('Your balance is due soon'),
      p('Hello {{traveller.name}}. The balance on your booking for <strong>{{package.title}}</strong> is due by <strong>{{booking.balance_due_on}}</strong>.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Departs', '{{departure.date}}'],
        ['Balance', '{{booking.balance}}'],
        ['Due by', '{{booking.balance_due_on}}'],
      ]),
      button('payment.link', 'Pay the balance'),
      muted('Already paid? Then this crossed with your payment &mdash; thank you, and please ignore it. Questions? Write to {{company.contact_email}} and quote {{booking.reference}}.'),
    ].join('\n'),
    text: [
      'Your balance is due soon',
      '',
      'Hello {{traveller.name}}. The balance on your booking for {{package.title}} is due by {{booking.balance_due_on}}.',
      '',
      'Reference: {{booking.reference}}',
      'Trip:      {{package.title}}',
      'Departs:   {{departure.date}}',
      'Balance:   {{booking.balance}}',
      'Due by:    {{booking.balance_due_on}}',
      '',
      'Pay the balance: {{payment.link}}',
      '',
      'Already paid? Then this crossed with your payment — thank you, and please ignore it.',
      contactText(),
    ].join('\n'),
    sample: { ...booking, 'booking.balance': 419000, 'booking.balance_due_on': '2027-03-15', 'payment.link': 'https://tour.empiria.events/booking/EMP-7Q4K' },
  },

  balance_paid: {
    subject: 'Paid in full — {{booking.reference}}',
    html: [
      h1('Paid in full &mdash; thank you'),
      p('Hello {{traveller.name}}. We&rsquo;ve received <strong>{{payment.amount}}</strong>, and your booking for <strong>{{package.title}}</strong> is now paid in full.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Departs', '{{departure.date}}'],
        ['Received today', '{{payment.amount}}'],
        ['Total paid', '{{booking.total}}'],
      ]),
      p('There&rsquo;s nothing more to pay. We&rsquo;ll be in touch before you travel with the practical details.'),
      contact(),
    ].join('\n'),
    text: [
      'Paid in full — thank you',
      '',
      'Hello {{traveller.name}}. We\'ve received {{payment.amount}}, and your booking for {{package.title}} is now paid in full.',
      '',
      'Reference:      {{booking.reference}}',
      'Trip:           {{package.title}}',
      'Departs:        {{departure.date}}',
      'Received today: {{payment.amount}}',
      'Total paid:     {{booking.total}}',
      '',
      'There\'s nothing more to pay. We\'ll be in touch before you travel with the practical details.',
      '',
      contactText(),
    ].join('\n'),
    sample: { ...booking, 'payment.amount': 419000, 'booking.total': 569000 },
  },

  pre_departure: {
    subject: 'Before you go: {{package.title}} on {{departure.date}}',
    html: [
      h1('Before you go'),
      p('Hello {{traveller.name}}. Your trip on <strong>{{package.title}}</strong> departs on <strong>{{departure.date}}</strong>. Here&rsquo;s what you need on the day.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Departs', '{{departure.date}}'],
        ['Time', '{{departure.start_time}}'],
        ['Meeting point', '{{departure.meeting_point}}'],
      ]),
      h2('What to bring'),
      pre('package.what_to_bring'),
      muted('Anything unclear? Write to {{company.contact_email}} and quote {{booking.reference}}. Have a wonderful trip.'),
    ].join('\n'),
    text: [
      'Before you go',
      '',
      'Hello {{traveller.name}}. Your trip on {{package.title}} departs on {{departure.date}}. Here\'s what you need on the day.',
      '',
      'Reference:     {{booking.reference}}',
      'Departs:       {{departure.date}}',
      'Time:          {{departure.start_time}}',
      'Meeting point: {{departure.meeting_point}}',
      '',
      'WHAT TO BRING',
      '{{package.what_to_bring}}',
      '',
      'Anything unclear? Write to {{company.contact_email}} and quote {{booking.reference}}. Have a wonderful trip.',
    ].join('\n'),
    sample: { ...booking, 'departure.start_time': '07:45:00', 'departure.meeting_point': 'Piraeus Port, Gate E7, Athens', 'package.what_to_bring': 'Passport, and a copy kept separately.\nLight layers — evenings on deck are cool.\nSturdy shoes for the caldera walk.\nA refillable bottle; we carry water on board.' },
  },

  booking_amended: {
    subject: 'Your booking has been updated — {{booking.reference}}',
    html: [
      h1('Your booking has been updated'),
      p('Hello {{traveller.name}}. We&rsquo;ve made a change to your booking for <strong>{{package.title}}</strong>, departing {{departure.date}}.'),
      h2('What changed'),
      pre('booking.changes'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Departs', '{{departure.date}}'],
      ]),
      muted('If this isn&rsquo;t what you expected, write to {{company.contact_email}} and quote {{booking.reference}}.'),
    ].join('\n'),
    text: [
      'Your booking has been updated',
      '',
      'Hello {{traveller.name}}. We\'ve made a change to your booking for {{package.title}}, departing {{departure.date}}.',
      '',
      'WHAT CHANGED',
      '{{booking.changes}}',
      '',
      'Reference: {{booking.reference}}',
      'Trip:      {{package.title}}',
      'Departs:   {{departure.date}}',
      '',
      'If this isn\'t what you expected, write to {{company.contact_email}} and quote {{booking.reference}}.',
    ].join('\n'),
    sample: { ...booking, 'booking.changes': 'Second traveller changed from Omar Haddad to Leila Haddad.\nRoom changed from twin to double.' },
  },

  departure_change: {
    subject: 'Your departure date has changed — {{booking.reference}}',
    html: [
      h1('Your departure date has changed'),
      p('Hello {{traveller.name}}. The departure for <strong>{{package.title}}</strong> has moved.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Was', '{{departure.old_date}}'],
        ['Now', '{{departure.date}}'],
        ['Why', '{{departure.reason}}'],
      ]),
      muted('If the new date doesn&rsquo;t work for you, write to {{company.contact_email}} and quote {{booking.reference}} &mdash; we&rsquo;ll talk it through.'),
    ].join('\n'),
    text: [
      'Your departure date has changed',
      '',
      'Hello {{traveller.name}}. The departure for {{package.title}} has moved.',
      '',
      'Reference: {{booking.reference}}',
      'Was:       {{departure.old_date}}',
      'Now:       {{departure.date}}',
      'Why:       {{departure.reason}}',
      '',
      'If the new date doesn\'t work for you, write to {{company.contact_email}} and quote {{booking.reference}} — we\'ll talk it through.',
    ].join('\n'),
    sample: { ...booking, 'departure.old_date': '2027-05-14', 'departure.date': '2027-05-16', 'departure.reason': 'The ferry operator has moved the Saturday sailing to Monday for the season.' },
  },

  booking_cancelled: {
    subject: 'Your booking has been cancelled — {{booking.reference}}',
    html: [
      h1('Your booking has been cancelled'),
      p('Hello {{traveller.name}}. Your booking for <strong>{{package.title}}</strong>, departing {{departure.date}}, has been cancelled.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Departure', '{{departure.date}}'],
        ['Refund due', '{{booking.refund_due}}'],
      ]),
      p('Any refund shown above goes back to the original payment method, and we&rsquo;ll email you when it&rsquo;s sent.'),
      contact(),
    ].join('\n'),
    text: [
      'Your booking has been cancelled',
      '',
      'Hello {{traveller.name}}. Your booking for {{package.title}}, departing {{departure.date}}, has been cancelled.',
      '',
      'Reference:  {{booking.reference}}',
      'Trip:       {{package.title}}',
      'Departure:  {{departure.date}}',
      'Refund due: {{booking.refund_due}}',
      '',
      'Any refund shown above goes back to the original payment method, and we\'ll email you when it\'s sent.',
      '',
      contactText(),
    ].join('\n'),
    sample: { ...booking, 'booking.refund_due': 150000 },
  },

  refund_issued: {
    subject: 'Your refund is on its way — {{booking.reference}}',
    html: [
      h1('Your refund is on its way'),
      p('Hello {{traveller.name}}. We&rsquo;ve sent a refund of <strong>{{payment.amount}}</strong> for your booking for <strong>{{package.title}}</strong>.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Trip', '{{package.title}}'],
        ['Amount', '{{payment.amount}}'],
        ['Sent to', '{{payment.method}}'],
      ]),
      p('It can take a few business days to appear, depending on your bank.'),
      contact(),
    ].join('\n'),
    text: [
      'Your refund is on its way',
      '',
      'Hello {{traveller.name}}. We\'ve sent a refund of {{payment.amount}} for your booking for {{package.title}}.',
      '',
      'Reference: {{booking.reference}}',
      'Trip:      {{package.title}}',
      'Amount:    {{payment.amount}}',
      'Sent to:   {{payment.method}}',
      '',
      'It can take a few business days to appear, depending on your bank.',
      '',
      contactText(),
    ].join('\n'),
    sample: { ...booking, 'payment.amount': 150000, 'payment.method': 'Visa ending 4242' },
  },

  admin_alert: {
    subject: 'New booking {{booking.reference}}: {{package.title}}',
    html: [
      h1('New booking'),
      p('<strong>{{traveller.name}}</strong> has booked <strong>{{package.title}}</strong>, departing {{departure.date}}.'),
      facts([
        ['Reference', '{{booking.reference}}'],
        ['Traveller', '{{traveller.name}}'],
        ['Trip', '{{package.title}}'],
        ['Departs', '{{departure.date}}'],
        ['Total', '{{booking.total}}'],
      ]),
      button('booking.admin_link', 'Open in the console'),
    ].join('\n'),
    text: [
      'New booking',
      '',
      '{{traveller.name}} has booked {{package.title}}, departing {{departure.date}}.',
      '',
      'Reference: {{booking.reference}}',
      'Traveller: {{traveller.name}}',
      'Trip:      {{package.title}}',
      'Departs:   {{departure.date}}',
      'Total:     {{booking.total}}',
      '',
      'Open in the console: {{booking.admin_link}}',
    ].join('\n'),
    sample: { ...booking, 'booking.total': 569000, 'booking.admin_link': 'https://tour-admin.empiria.events/dashboard/bookings/sample' },
  },

  partner_application_received: {
    subject: 'We have your application',
    html: [
      h1('Thanks &mdash; we have your application'),
      p('Hello {{applicant.name}}. Your application for <strong>{{applicant.company}}</strong> to sell tours through Empiria Tours has arrived.'),
      p('A person at Empiria reads every application &mdash; nothing here is approved automatically. We&rsquo;ll email you once it&rsquo;s been reviewed.'),
      contact(false),
    ].join('\n'),
    text: [
      'Thanks — we have your application',
      '',
      'Hello {{applicant.name}}. Your application for {{applicant.company}} to sell tours through Empiria Tours has arrived.',
      '',
      'A person at Empiria reads every application — nothing here is approved automatically. We\'ll email you once it\'s been reviewed.',
      '',
      contactText(false),
    ].join('\n'),
    sample: { 'applicant.name': 'Nikos Papadakis', 'applicant.company': 'Aegean Sail Co.' },
  },

  partner_application_approved: {
    subject: 'Welcome aboard, {{applicant.company}}',
    html: [
      h1('Welcome aboard'),
      p('Hello {{applicant.name}}. Your application for <strong>{{applicant.company}}</strong> has been approved, and your partner console is ready.'),
      p('You&rsquo;ll receive a separate email to set up your sign-in. Once you&rsquo;re in, you can add your tours, set departures and see bookings as they come.'),
      button('partner.console_link', 'Open the partner console'),
      contact(false),
    ].join('\n'),
    text: [
      'Welcome aboard',
      '',
      'Hello {{applicant.name}}. Your application for {{applicant.company}} has been approved, and your partner console is ready.',
      '',
      'You\'ll receive a separate email to set up your sign-in. Once you\'re in, you can add your tours, set departures and see bookings as they come.',
      '',
      'Open the partner console: {{partner.console_link}}',
      '',
      contactText(false),
    ].join('\n'),
    sample: { 'applicant.name': 'Nikos Papadakis', 'applicant.company': 'Aegean Sail Co.', 'partner.console_link': 'https://partners.empiria.events' },
  },

  partner_application_declined: {
    subject: 'About your application',
    html: [
      h1('About your application'),
      p('Hello {{applicant.name}}. Thank you for applying for <strong>{{applicant.company}}</strong> to sell tours through Empiria Tours. We&rsquo;ve reviewed it and won&rsquo;t be going ahead this time.'),
      h2('A note from the reviewer'),
      pre('application.note'),
      muted('If you&rsquo;d like to talk it through, write to {{company.contact_email}}.'),
    ].join('\n'),
    text: [
      'About your application',
      '',
      'Hello {{applicant.name}}. Thank you for applying for {{applicant.company}} to sell tours through Empiria Tours. We\'ve reviewed it and won\'t be going ahead this time.',
      '',
      'A NOTE FROM THE REVIEWER',
      '{{application.note}}',
      '',
      'If you\'d like to talk it through, write to {{company.contact_email}}.',
    ].join('\n'),
    sample: { 'applicant.name': 'Nikos Papadakis', 'applicant.company': 'Aegean Sail Co.', 'application.note': 'We are not adding operators in the Cyclades this season. Do apply again next year — the tours themselves looked strong.' },
  },

  partner_application_alert: {
    subject: 'New partner application: {{applicant.company}}',
    html: [
      h1('New partner application'),
      p('<strong>{{applicant.name}}</strong> has applied on behalf of <strong>{{applicant.company}}</strong>.'),
      button('application.admin_link', 'Review the application'),
    ].join('\n'),
    text: [
      'New partner application',
      '',
      '{{applicant.name}} has applied on behalf of {{applicant.company}}.',
      '',
      'Review the application: {{application.admin_link}}',
    ].join('\n'),
    sample: { 'applicant.name': 'Nikos Papadakis', 'applicant.company': 'Aegean Sail Co.', 'application.admin_link': 'https://tour-admin.empiria.events/dashboard/partners/sample' },
  },
};
