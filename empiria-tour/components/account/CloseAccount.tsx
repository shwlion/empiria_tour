'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { closeAccount, type ActionResult } from '@/app/account/actions';

/**
 * A8's closure.
 *
 * Kept behind a disclosure and a typed confirmation, because it is irreversible
 * and the profile does not come back. What it does *not* do is delete the
 * bookings — §2.2 makes Empiria the seller of record and the sale is its record
 * to keep — so the copy says that plainly rather than implying a clean erase.
 */
function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-ember px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-ember transition-colors hover:bg-ember hover:text-white disabled:opacity-60"
    >
      {pending ? 'Closing…' : 'Close my account'}
    </button>
  );
}

export default function CloseAccount() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(closeAccount, null);

  // The server action signs the session out; the browser still holds a rendered
  // page belonging to an account that no longer exists, so send it home.
  useEffect(() => {
    if (state?.ok) {
      router.push('/');
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="mt-10 rounded-card border border-line bg-bone p-5">
      <h2 className="font-display text-[17px] font-semibold text-ink">Close this account</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-stone">
        Your name, phone number and address are erased and you are signed out. Your bookings are
        kept — Empiria is the seller on them and has to retain the record of the sale — but they
        stop being linked to a profile you can sign in to.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 text-[13px] font-medium text-ember transition-colors hover:underline"
        >
          I want to close my account
        </button>
      ) : (
        <form action={action} className="mt-4 space-y-3 border-t border-line pt-4">
          <label htmlFor="confirm" className="block text-[13px] leading-relaxed text-ink">
            Type <span className="font-mono font-bold">CLOSE</span> to confirm. This cannot be undone.
          </label>
          <input
            id="confirm"
            name="confirm"
            required
            autoComplete="off"
            className="w-full max-w-[16rem] rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink outline-none transition-colors focus:border-ember"
          />
          <div className="flex flex-wrap items-center gap-3">
            <ConfirmButton />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] font-medium text-stone transition-colors hover:text-ink"
            >
              Cancel
            </button>
            {state && !state.ok && (
              <span className="text-[13px] text-ember" role="alert">
                {state.message}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
