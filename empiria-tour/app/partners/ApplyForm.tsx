'use client';

import { useActionState, useState } from 'react';
import { applyAction, type ApplyResult } from './actions';
import ApplyStepper, { type StepDef } from '@/components/partners/ApplyStepper';

/**
 * Which step each server-side field error belongs to, so a rejection lands
 * the applicant on the panel holding the problem rather than on whichever
 * one they happened to be looking at.
 */
const STEPS: StepDef[] = [
  { id: 'business', title: 'Your business' },
  { id: 'contact', title: 'Who we would be speaking to' },
];
const STEP_OF_FIELD: Record<string, number> = {
  company_name: 1, country: 1, website: 1,
  operating_regions: 1, tour_types: 1, departures_per_year: 1,
  contact_name: 2, phone: 2, email: 2, message: 2,
};

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-stone/50 focus:border-flame';
const labelClass = 'mb-1.5 block font-mono text-[10px] uppercase tracking-label text-stone';

function Field({
  name, label, error, children, hint,
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

export default function ApplyForm() {
  const [state, formAction, pending] = useActionState<ApplyResult | null, FormData>(applyAction, null);

  /*
    Controlled, and that is load-bearing rather than a style choice.

    `<form action={fn}>` puts react-dom on the host-transition path, which
    calls requestFormReset once the action settles — so every field was
    cleared on a REJECTED submission too, leaving the applicant staring at
    "A few things still need filling in" over an empty form. React re-renders
    a controlled input from state immediately after that reset, so the typed
    values survive. Server-rendered `value` attributes keep the no-JS path
    working unchanged.
  */
  const [values, setValues] = useState<Record<string, string>>({});
  const bind = (name: string) => ({
    value: values[name] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [name]: e.target.value })),
  });


  if (state?.ok) {
    return (
      <div className="rounded-card border border-line bg-bone p-8">
        <h2 className="font-display text-2xl text-ink">Thank you — that is with us.</h2>
        <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-stone">
          We read every application ourselves rather than approving them automatically. Empiria is
          the seller of record for everything booked here, so we check who we are selling on behalf
          of. Expect to hear from us within a few working days, and we may come back with a
          question or two before deciding.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-stone">
          There is a confirmation on its way to the address you gave us.
        </p>
      </div>
    );
  }

  const err = state && !state.ok ? state.fields ?? {} : {};
  const errored = Object.keys(err).map((f) => STEP_OF_FIELD[f]).filter(Boolean);
  const jumpToStep = errored.length ? Math.min(...errored) : null;


  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {state && !state.ok && (
        <div role="alert" className="rounded-field border border-flame/40 bg-flame/5 p-3.5 text-[14px] text-ink">
          {state.message}
        </div>
      )}

      {/* A field with a plausible name, hidden from people and from screen
          readers, left empty by anyone who can actually see the page. It is the
          whole of the bot protection here, and it only stops naive form-fillers
          — see the note in actions.ts. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="company_website_url">Do not fill this in</label>
        <input id="company_website_url" name="company_website_url" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <ApplyStepper
        steps={STEPS}
        submitLabel="Send application"
        pending={pending}
        jumpToStep={jumpToStep}
        errorSignal={state}
      >
      <fieldset className="flex flex-col gap-5">
        <legend className="apply-stepper__nojs mb-1 font-mono text-[10px] uppercase tracking-label text-flame">
          Your business
        </legend>

        <Field name="company_name" label="Company name" error={err.company_name}>
          <input id="company_name" name="company_name" {...bind('company_name')} required className={inputClass}
                 placeholder="Kyoto Heritage Tours K.K." />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="country" label="Where you are based">
            <input id="country" name="country" {...bind('country')} className={inputClass} placeholder="Japan" />
          </Field>
          <Field name="website" label="Website" hint="Optional, but it helps us place you.">
            <input id="website" name="website" {...bind('website')} type="url" className={inputClass}
                   placeholder="https://" />
          </Field>
        </div>

        <Field name="operating_regions" label="Where you operate">
          <input id="operating_regions" name="operating_regions" {...bind('operating_regions')} className={inputClass}
                 placeholder="Kansai, Chūbu, and day trips from Tokyo" />
        </Field>

        <Field name="tour_types" label="What kind of tours you run">
          <input id="tour_types" name="tour_types" {...bind('tour_types')} className={inputClass}
                 placeholder="Small-group cultural and culinary, 3–8 days" />
        </Field>

        <Field name="departures_per_year" label="Departures a year"
               hint="A rough number is fine.">
          <input id="departures_per_year" name="departures_per_year" {...bind('departures_per_year')} type="number" min={0}
                 className={inputClass} placeholder="40" />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="apply-stepper__nojs mb-1 font-mono text-[10px] uppercase tracking-label text-flame">
          Who we would be speaking to
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="contact_name" label="Your name" error={err.contact_name}>
            <input id="contact_name" name="contact_name" {...bind('contact_name')} required className={inputClass} />
          </Field>
          <Field name="phone" label="Phone">
            <input id="phone" name="phone" {...bind('phone')} type="tel" className={inputClass} />
          </Field>
        </div>

        <Field
          name="email"
          label="Email"
          error={err.email}
          hint="Use a business address you can sign in with — this becomes your login if we go ahead."
        >
          <input id="email" name="email" {...bind('email')} type="email" required className={inputClass} />
        </Field>

        <Field name="message" label="Anything else we should know">
          <textarea id="message" name="message" {...bind('message')} rows={4} className={inputClass}
                    placeholder="Licences you hold, insurance, who you already work with — whatever helps us understand the operation." />
        </Field>
      </fieldset>

      </ApplyStepper>
    </form>
  );
}
