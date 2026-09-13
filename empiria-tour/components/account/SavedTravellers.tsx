'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { deleteTraveller, saveTraveller, type TravellerActionResult } from '@/app/account/travellers/actions';
import { SAVED_TRAVELLERS_MAX, type SavedTraveller } from '@/lib/savedTravellers';

/**
 * A8's saved traveller list: one form per person, and one to add the next.
 *
 * Each person is a <details> that opens on their own form, so a list of
 * twenty reads as twenty names, not twenty forms. Removing takes two clicks
 * — the second one is the confirmation — because a saved traveller is
 * seconds to re-add and a typed confirmation would be theatre.
 */

const inputClass =
  'w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-flame';
const labelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-label text-stone';

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-flame px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  );
}

function Note({ state }: { state: TravellerActionResult | null }) {
  if (!state) return null;
  return (
    <p role={state.ok ? 'status' : 'alert'} className={`text-[13px] ${state.ok ? 'text-teal' : 'text-ember'}`}>
      {state.message}
    </p>
  );
}

function Fields({ traveller, prefix }: { traveller?: SavedTraveller; prefix: string }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}-name`} className={labelClass}>Full name as per ID</label>
          <input
            id={`${prefix}-name`}
            name="legal_name"
            required
            maxLength={200}
            defaultValue={traveller?.legalName ?? ''}
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-dob`} className={labelClass}>Date of birth</label>
          <input
            id={`${prefix}-dob`}
            name="date_of_birth"
            type="date"
            min="1900-01-01"
            defaultValue={traveller?.dateOfBirth ?? ''}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${prefix}-diet`} className={labelClass}>Dietary needs</label>
          <input
            id={`${prefix}-diet`}
            name="dietary_notes"
            maxLength={500}
            defaultValue={traveller?.dietaryNotes ?? ''}
            placeholder="Vegetarian, no shellfish…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-access`} className={labelClass}>Accessibility needs</label>
          <input
            id={`${prefix}-access`}
            name="accessibility_notes"
            maxLength={500}
            defaultValue={traveller?.accessibilityNotes ?? ''}
            placeholder="Step-free rooms, walking pace…"
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

function TravellerCard({ traveller }: { traveller: SavedTraveller }) {
  const [saved, save] = useActionState<TravellerActionResult | null, FormData>(saveTraveller, null);
  const [removed, remove] = useActionState<TravellerActionResult | null, FormData>(deleteTraveller, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <details className="group rounded-card border border-line bg-bone">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-[15px] font-semibold text-ink">{traveller.legalName}</span>
          <span className="block text-[12px] text-stone">
            {traveller.dateOfBirth ? `Born ${traveller.dateOfBirth}` : 'No date of birth'}
            {traveller.dietaryNotes ? ` · ${traveller.dietaryNotes}` : ''}
          </span>
        </span>
        <span aria-hidden="true" className="font-mono text-[10px] uppercase tracking-label text-stone group-open:hidden">Edit</span>
      </summary>

      <div className="border-t border-line p-4">
        <form action={save} className="space-y-3">
          <input type="hidden" name="id" value={traveller.id} />
          <Fields traveller={traveller} prefix={traveller.id} />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton idle="Save" busy="Saving…" />
            <Note state={saved} />
          </div>
        </form>

        <form action={remove} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <input type="hidden" name="id" value={traveller.id} />
          {confirming ? (
            <>
              <span className="text-[13px] text-ink">Remove {traveller.legalName} from your list?</span>
              <SubmitButton idle="Yes, remove" busy="Removing…" />
              <button type="button" onClick={() => setConfirming(false)} className="text-[13px] text-stone hover:underline">
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-[13px] font-medium text-ember hover:underline">
              Remove
            </button>
          )}
          <Note state={removed} />
        </form>
      </div>
    </details>
  );
}

function AddTraveller({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState<TravellerActionResult | null, FormData>(saveTraveller, null);
  return (
    <form
      action={action}
      // A fresh form after each successful add: the key changes, the fields reset.
      key={state?.ok ? state.message : 'add'}
      className="mt-6 space-y-3 rounded-card border border-dashed border-line bg-paper p-4"
    >
      <p className="font-display text-[15px] font-semibold text-ink">Add a traveller</p>
      {disabled ? (
        <p className="text-[13px] text-stone">Your list is full. Remove someone to add another.</p>
      ) : (
        <>
          <Fields prefix="new" />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton idle="Add" busy="Adding…" />
            <Note state={state} />
          </div>
        </>
      )}
    </form>
  );
}

export default function SavedTravellers({ travellers }: { travellers: SavedTraveller[] }) {
  return (
    <div className="mt-4">
      {travellers.length === 0 ? (
        <p className="rounded-card border border-dashed border-line bg-bone p-5 text-center text-[14px] text-stone">
          Nobody saved yet. Add the people you travel with, or tick “save these travellers” on your
          next booking.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {travellers.map((t) => (
            <TravellerCard key={t.id} traveller={t} />
          ))}
        </div>
      )}
      <AddTraveller disabled={travellers.length >= SAVED_TRAVELLERS_MAX} />
    </div>
  );
}
