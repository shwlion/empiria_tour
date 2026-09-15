/**
 * Part C's merge-field contract.
 *
 * Every field a template author may write, what it means, and — the part that
 * matters at render time — what *kind* of value arrives in its place. The
 * enqueuer puts raw values in `merge_data`: money as an integer number of
 * cents, dates as ISO strings. Nobody wants to read "285000" in a booking
 * confirmation, so the kind is what tells the renderer to turn that into
 * "$2,850".
 *
 * Mirrored in `empiria-tour-admin/lib/admin/content.ts`, which uses the same
 * names to draw the chips an author picks from. The two must agree: a chip
 * offering a field this file does not know is a template that cannot render.
 * Three repositories, no shared package — this is the cost of that choice, and
 * `render.test.ts` asserts the two lists match.
 */

export type FieldKind = 'text' | 'money' | 'date' | 'time' | 'int' | 'url';

/**
 * Reserved keys the enqueuer may put in `merge_data` that are not merge fields.
 * Prefixed so they can never collide with something an author types.
 */
export const CURRENCY_KEY = '_currency';
export const LOCALE_KEY = '_locale';

export const FIELD_KINDS: Record<string, FieldKind> = {
  'booking.reference': 'text',
  'booking.total': 'money',
  'booking.balance': 'money',
  'booking.balance_due_on': 'date',
  'booking.refund_due': 'money',
  'booking.travellers': 'text',
  'booking.changes': 'text',
  'booking.admin_link': 'url',
  'payment.amount': 'money',
  'payment.method': 'text',
  'payment.link': 'url',
  'traveller.name': 'text',
  'package.title': 'text',
  'package.what_to_bring': 'text',
  'departure.date': 'date',
  'departure.old_date': 'date',
  'departure.start_time': 'time',
  'departure.meeting_point': 'text',
  'departure.reason': 'text',
  'account.email': 'text',
  'account.confirm_link': 'url',
  'company.name': 'text',
  'company.registration_number': 'text',
  'company.contact_email': 'text',
  // Rev 1 added installments; these two arrive with the schedule table.
  'installment.number': 'int',
  'installment.of': 'int',
  'installment.amount': 'money',
  'installment.due_on': 'date',
  'installment.remaining': 'money',
  // The partner-application emails. Their own names, so a template author is
  // never asked to read "the applicant" into `traveller.name`, and the
  // applicant's business never collides with `company.name`, which is the
  // seller's and appears in every footer.
  'applicant.name': 'text',
  'applicant.company': 'text',
  'application.note': 'text',
  'partner.console_link': 'url',
  'application.admin_link': 'url',
};

/** Available in every template — the seller has to identify itself (Part D). */
export const COMMON_FIELDS = [
  'company.name',
  'company.registration_number',
  'company.contact_email',
] as const;

/**
 * The thirteen triggers of Part C as revised, and what each may reference.
 * `installment_due` and `installment_paid` are new in Revision 1; the three
 * partner-application emails are the partner surface's, outside Exhibit A.
 */
export const TEMPLATE_FIELDS: Record<string, string[]> = {
  account_created: ['traveller.name', 'account.email', 'account.confirm_link'],
  booking_confirmed: ['booking.reference', 'booking.total', 'traveller.name', 'package.title', 'departure.date', 'departure.meeting_point', 'booking.travellers'],
  deposit_taken: ['booking.reference', 'payment.amount', 'booking.balance', 'booking.balance_due_on', 'traveller.name', 'package.title', 'departure.date'],
  balance_due: ['booking.reference', 'booking.balance', 'booking.balance_due_on', 'traveller.name', 'package.title', 'departure.date', 'payment.link'],
  balance_paid: ['booking.reference', 'payment.amount', 'booking.total', 'traveller.name', 'package.title', 'departure.date'],
  installment_due: ['booking.reference', 'installment.number', 'installment.of', 'installment.amount', 'installment.due_on', 'installment.remaining', 'traveller.name', 'package.title', 'departure.date', 'payment.link'],
  installment_paid: ['booking.reference', 'installment.number', 'installment.of', 'payment.amount', 'installment.remaining', 'traveller.name', 'package.title', 'departure.date'],
  booking_amended: ['booking.reference', 'traveller.name', 'package.title', 'departure.date', 'booking.changes'],
  booking_cancelled: ['booking.reference', 'traveller.name', 'package.title', 'departure.date', 'booking.refund_due'],
  refund_issued: ['booking.reference', 'payment.amount', 'traveller.name', 'package.title', 'payment.method'],
  departure_change: ['booking.reference', 'traveller.name', 'package.title', 'departure.old_date', 'departure.date', 'departure.reason'],
  pre_departure: ['booking.reference', 'traveller.name', 'package.title', 'departure.date', 'departure.meeting_point', 'departure.start_time', 'package.what_to_bring'],
  admin_alert: ['booking.reference', 'booking.total', 'traveller.name', 'package.title', 'departure.date', 'booking.admin_link'],
  partner_application_received: ['applicant.name', 'applicant.company'],
  partner_application_approved: ['applicant.name', 'applicant.company', 'partner.console_link'],
  partner_application_declined: ['applicant.name', 'applicant.company', 'application.note'],
  // To Empiria, not the applicant. Its own template rather than admin_alert,
  // whose body is about a booking and needs a reference, a total and a date
  // an application does not have.
  partner_application_alert: ['applicant.name', 'applicant.company', 'application.admin_link'],
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_FIELDS);

/** Everything a given template may reference, its own fields plus the common ones. */
export function fieldsFor(templateKey: string): string[] {
  return [...(TEMPLATE_FIELDS[templateKey] ?? []), ...COMMON_FIELDS];
}
