'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveProfile, type ActionResult } from '@/app/account/actions';
import type { AccountProfile } from '@/lib/account';

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-flame';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-label text-stone';

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-flame px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

export default function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveProfile, null);
  const a = profile.address ?? {};

  return (
    <form action={action} className="mt-3 space-y-4 rounded-card border border-line bg-bone p-5">
      <div>
        <label htmlFor="full_name" className={labelClass}>Full name</label>
        <input id="full_name" name="full_name" defaultValue={profile.fullName ?? ''} className={inputClass} autoComplete="name" />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" value={profile.email ?? ''} readOnly disabled className={`${inputClass} cursor-not-allowed opacity-60`} />
        {/*
          Read-only on purpose. The address of record lives in `auth.users` and
          changing it is an authentication event — it needs a confirmation mail
          to the new address, or an account is one typo away from being
          unreachable. That belongs with the rest of Supabase Auth, not in a
          profile form that writes `public.users`.
        */}
        <p className="mt-1 text-[12px] leading-relaxed text-stone">
          Get in touch if you need to change the address your account signs in with.
        </p>
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>Phone</label>
        <input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ''} className={inputClass} autoComplete="tel" />
      </div>

      <fieldset>
        <legend className={labelClass}>Address</legend>
        <div className="space-y-2">
          <input name="line1" defaultValue={a.line1 ?? ''} placeholder="Address line 1" className={inputClass} autoComplete="address-line1" aria-label="Address line 1" />
          <input name="line2" defaultValue={a.line2 ?? ''} placeholder="Address line 2" className={inputClass} autoComplete="address-line2" aria-label="Address line 2" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="city" defaultValue={a.city ?? ''} placeholder="City" className={inputClass} autoComplete="address-level2" aria-label="City" />
            <input name="region" defaultValue={a.region ?? ''} placeholder="Province or state" className={inputClass} autoComplete="address-level1" aria-label="Province or state" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="postcode" defaultValue={a.postcode ?? ''} placeholder="Postal code" className={inputClass} autoComplete="postal-code" aria-label="Postal code" />
            <input name="country" defaultValue={a.country ?? ''} placeholder="Country" className={inputClass} autoComplete="country-name" aria-label="Country" />
          </div>
        </div>
      </fieldset>

      <label className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink">
        <input
          type="checkbox"
          name="marketing_opt_in"
          defaultChecked={profile.marketingOptIn}
          className="mt-0.5 h-4 w-4 shrink-0 accent-flame"
        />
        <span>
          Email me about new tours and offers.
          <span className="block text-[12px] text-stone">
            Booking confirmations and trip information are sent either way — those are not marketing.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <SaveButton />
        {state && (
          <span className={`text-[13px] ${state.ok ? 'text-stone' : 'text-ember'}`} role="status">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
