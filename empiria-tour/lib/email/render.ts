import {
  CURRENCY_KEY,
  FIELD_KINDS,
  LOCALE_KEY,
  fieldsFor,
  type FieldKind,
} from './fields.ts';

/**
 * Turning a template and a bag of facts into the email that gets sent.
 *
 * Pure — no database, no network, no clock — so it can be asserted rather than
 * trusted, in the same way `lib/pricing.ts` is. Three rules decide the whole
 * design:
 *
 *  1. **It fails rather than sends something wrong.** A template referencing a
 *     field that does not exist, or a field with no value supplied, throws. The
 *     message stays in the outbox and shows as failed. Emailing a traveller
 *     "Dear {{traveller.name}}" is worse than emailing them nothing, because
 *     the second is a bug somebody notices and the first is a bug the customer
 *     notices.
 *
 *  2. **Every value is escaped on the way into HTML.** Names, meeting points
 *     and staff-typed change notes are all user input, and the body is markup.
 *     A traveller called "Foo & Sons <Ltd>" must not break the email, and a
 *     hostile one must not be able to put a tag in it.
 *
 *  3. **Raw values in, formatted values out.** The enqueuer stores cents and
 *     ISO dates because those are the facts. The reader wants "$2,850" and
 *     "4 May 2027". The field's kind is what bridges them.
 */

export type MergeData = Record<string, unknown>;

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string | null;
};

export class TemplateError extends Error {
  readonly field: string;
  constructor(message: string, field: string) {
    super(message);
    this.name = 'TemplateError';
    this.field = field;
  }
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

/** The five characters that change meaning inside markup. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** A departure is a day, not an instant — parse as a calendar date so no timezone shifts it. */
function formatDate(iso: string, locale: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/** "08:30:00" → "08:30". Seconds on a meeting time are noise. */
function formatTime(value: string): string {
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : value;
}

export function formatValue(
  raw: unknown,
  kind: FieldKind,
  currency: string,
  locale: string
): string {
  if (raw == null) return '';
  switch (kind) {
    case 'money': {
      const cents = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(cents) ? formatMoney(cents, currency, locale) : '';
    }
    case 'date':
      return formatDate(String(raw), locale);
    case 'time':
      return formatTime(String(raw));
    case 'int': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(n) ? String(Math.trunc(n)) : '';
    }
    default:
      return String(raw);
  }
}

type Options = {
  /** Escape substituted values. True for HTML bodies, false for plain text. */
  escape: boolean;
  /** Where the text came from, so an error can say which part failed. */
  part: string;
};

function substitute(
  template: string,
  templateKey: string,
  data: MergeData,
  { escape, part }: Options
): string {
  const allowed = new Set(fieldsFor(templateKey));
  const currency = typeof data[CURRENCY_KEY] === 'string' ? (data[CURRENCY_KEY] as string) : 'CAD';
  const locale = typeof data[LOCALE_KEY] === 'string' ? (data[LOCALE_KEY] as string) : 'en-CA';

  return template.replace(PLACEHOLDER, (_match, field: string) => {
    if (!allowed.has(field)) {
      throw new TemplateError(
        `The ${part} refers to {{${field}}}, which is not available in a ${templateKey} email. ` +
          `Available: ${[...allowed].join(', ')}.`,
        field
      );
    }
    // Absent and explicitly-undefined both mean the enqueuer forgot. `null` is
    // different: a nullable column like a meeting point that genuinely has no
    // value renders as empty, which is what the author expects to see.
    if (!(field in data) || data[field] === undefined) {
      throw new TemplateError(
        `No value was supplied for {{${field}}} in this ${templateKey} email.`,
        field
      );
    }
    const kind = FIELD_KINDS[field] ?? 'text';
    const formatted = formatValue(data[field], kind, currency, locale);
    return escape ? escapeHtml(formatted) : formatted;
  });
}

export type Template = {
  key: string;
  subject: string;
  body_html: string;
  body_text?: string | null;
};

/**
 * The whole render. Throws `TemplateError` rather than returning a partial
 * result — a half-substituted email has no correct use.
 */
export function renderEmail(template: Template, data: MergeData): RenderedEmail {
  if (!template.subject.trim() || !template.body_html.trim()) {
    throw new TemplateError(
      `The ${template.key} template has no ${!template.subject.trim() ? 'subject' : 'body'} yet. ` +
        `Empiria writes the wording in the console before this can send.`,
      ''
    );
  }
  return {
    // A subject line is not markup, so nothing is escaped into it.
    subject: substitute(template.subject, template.key, data, { escape: false, part: 'subject' }),
    html: substitute(template.body_html, template.key, data, { escape: true, part: 'body' }),
    text: template.body_text?.trim()
      ? substitute(template.body_text, template.key, data, { escape: false, part: 'plain-text body' })
      : null,
  };
}

/**
 * Which declared fields a template actually uses, and which it references but
 * may not. Lets the console tell an author about a broken placeholder while
 * they are writing, rather than at three in the morning when a booking lands.
 */
export function inspectTemplate(templateKey: string, ...sources: (string | null | undefined)[]) {
  const allowed = new Set(fieldsFor(templateKey));
  const used = new Set<string>();
  const unknown = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.matchAll(PLACEHOLDER)) {
      const field = match[1];
      (allowed.has(field) ? used : unknown).add(field);
    }
  }
  return { used: [...used], unknown: [...unknown] };
}
