'use client';

import { useActionState } from 'react';
import { contactAction, type ContactResult } from './actions';

/**
 * Name, email, message. The same field kit as the partner application so the
 * two public forms read as one site; the honeypot is the same field too.
 */

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-stone/50 focus:border-flame';
const labelClass = 'mb-1.5 block font-mono text-[10px] uppercase tracking-label text-stone';

function Field({
  name, label, error, hint, children,
}: {
  name: string; label: string; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[12px] text-stone">{hint}</p>}
      {error && <p className="mt-1 text-[12px] text-flame">{error}</p>}
    </div>
  );
}

export default function ContactForm({ available }: { available: boolean }) {
  const [state, formAction, pending] = useActionState<ContactResult | null, FormData>(contactAction, null);
  const err = state && !state.ok ? state.fields ?? {} : {};

  if (state?.ok) {
    return (
      <div role="status" className="rounded-card border border-line bg-bone p-6">
        <h2 className="font-display text-2xl text-ink">Thank you — that is with us.</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-stone">
          Somebody who runs the trips will reply to the address you gave, usually within a working
          day.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {state && !state.ok && (
        <div role="alert" className="rounded-field border border-flame/40 bg-flame/5 p-3.5 text-[14px] text-ink">
          {state.message}
        </div>
      )}

      {/* The honeypot — see actions.ts. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="company_website_url">Do not fill this in</label>
        <input id="company_website_url" name="company_website_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="name" label="Your name" hint="Optional">
          <input id="name" name="name" type="text" autoComplete="name" maxLength={120} className={inputClass} />
        </Field>
        <Field name="email" label="Email" error={err.email}>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} placeholder="you@example.com" />
        </Field>
      </div>

      <Field name="message" label="Your inquiry" error={err.message} hint="Dates, group size, a tour you are looking at — anything that helps us answer well.">
        <textarea id="message" name="message" required rows={7} maxLength={4000} className={`${inputClass} resize-y leading-relaxed`} />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || !available}
          className="inline-flex min-h-[46px] items-center justify-center rounded-full bg-flame px-7 text-[14px] font-semibold text-white transition-colors hover:bg-ember disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        {!available && (
          <p className="text-[13px] text-stone">
            Sending from this page is not switched on yet.
          </p>
        )}
      </div>
    </form>
  );
}
