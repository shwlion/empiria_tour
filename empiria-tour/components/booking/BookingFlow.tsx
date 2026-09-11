'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, TriangleAlert } from 'lucide-react';
import { quote, validateSelection, seatsFor, headcountFor, type Party, type PromotionInput } from '@/lib/pricing';
import { formatPrice } from '@/lib/money';
import { useIsHydrated } from '@/lib/hydrated';
import type { BookingContext, TravellerInput } from '@/lib/booking';
import {
  applyPromotionAction,
  extendHoldAction,
  holdSeatsAction,
  releaseHoldAction,
  submitBookingAction,
} from '@/app/book/actions';
import Stepper from './Stepper';
import QuoteSummary from './QuoteSummary';
import DisclosureList from './DisclosureList';
import { CustomFieldInput, Field, NumberSelect, TextInput, fieldClass, labelClass } from './fields';

/**
 * A5 — the booking flow.
 *
 * Five steps, named after the disclosure placements Exhibit A defines for them
 * (`booking_travellers`, `booking_additional`, `booking_review`,
 * `booking_terms`, `booking_payment`), so the steps and the wording Empiria
 * assigns to each step cannot drift apart.
 *
 * Everything is held in one client component with one submit at the end. The
 * alternative — a route per step writing a partial booking — means half-written
 * records with no traveller names and no acknowledgements, and no honest status
 * to give them. Here the seats are reserved in the database from the first
 * step, but the booking itself comes into existence once, complete, in a single
 * transaction.
 *
 * Prices update live from `lib/pricing.ts`, the same module the server
 * recomputes with before writing. If the two ever disagree the submit is
 * refused and the traveller is shown the new figure rather than charged it.
 */

const STEPS = [
  { key: 'booking_travellers', label: 'Travellers' },
  { key: 'booking_additional', label: 'Extras' },
  { key: 'booking_review', label: 'Review' },
  { key: 'booking_terms', label: 'Terms' },
  { key: 'booking_payment', label: 'Payment' },
] as const;

type Draft = {
  step: number;
  furthest: number;
  party: Party;
  roomTypeId: string | null;
  extras: Record<string, number>;
  lead: { name: string; email: string; phone: string };
  address: { line1: string; city: string; region: string; postalCode: string; country: string };
  travellers: TravellerInput[];
  /** `${fieldId}|${position}` for traveller fields, `${fieldId}|booking` otherwise. */
  fieldValues: Record<string, string>;
  accepted: Record<string, boolean>;
  promotionCode: string;
};

export type BookingFlowProps = {
  context: BookingContext;
  initialParty: Party;
  initialRoomTypeId: string | null;
  initialExtras: Record<string, number>;
};

export default function BookingFlow(props: BookingFlowProps) {
  // The form restores itself from sessionStorage, which only exists in a
  // browser. Gating on hydration lets the inner component read it in a lazy
  // initialiser instead of an effect — no flash, no extra render, and none of
  // the setState-in-effect the React 19 rules (rightly) reject.
  const hydrated = useIsHydrated();
  if (!hydrated) return <FlowSkeleton />;
  return <Flow {...props} />;
}

function FlowSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-6 w-64 rounded-chip bg-line" />
      <div className="mt-8 h-64 rounded-card bg-line/60" />
    </div>
  );
}

function Flow({ context, initialParty, initialRoomTypeId, initialExtras }: BookingFlowProps) {
  const router = useRouter();
  const storageKey = `empiria_booking_draft_${context.departure.id}`;

  const [draft, setDraft] = useState<Draft>(() =>
    restore(storageKey) ?? blankDraft(context, initialParty, initialRoomTypeId, initialExtras)
  );
  const [hold, setHold] = useState<{ id: string; seats: number; expiresAt: string } | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [promotion, setPromotion] = useState<PromotionInput | null>(null);
  const [promotionNote, setPromotionNote] = useState<string | null>(null);

  const seats = seatsFor(draft.party);
  const headcount = headcountFor(draft.party);

  // ── the live quote ──────────────────────────────────────────────────────
  const currentQuote = useMemo(
    () =>
      quote(context.pricing, {
        party: draft.party,
        roomTypeId: draft.roomTypeId,
        extras: draft.extras,
        promotion,
      }),
    [context.pricing, draft.party, draft.roomTypeId, draft.extras, promotion]
  );

  const selectionProblems = useMemo(
    () =>
      validateSelection(
        context.pricing,
        { party: draft.party, roomTypeId: draft.roomTypeId, extras: draft.extras, promotion },
        // The held seats are ours already, so they still count as available.
        Math.max(context.departure.seatsAvailable, hold?.seats ?? 0)
      ),
    [context.pricing, draft, promotion, context.departure.seatsAvailable, hold?.seats]
  );

  // ── persistence ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Private browsing. The flow still works; it just will not survive a
      // refresh, which is a smaller problem than refusing to take the booking.
    }
  }, [draft, storageKey]);

  // ── the hold ────────────────────────────────────────────────────────────
  // Re-claimed whenever the party changes, and adjusted rather than stacked —
  // `claim_seats` keeps one live hold per session per departure.
  const claimedFor = useRef<number>(-1);
  useEffect(() => {
    if (seats < 1 || claimedFor.current === seats) return;
    claimedFor.current = seats;
    const timer = setTimeout(() => {
      void holdSeatsAction(context.departure.id, seats).then((result) => {
        if (result.ok) {
          setHold({ id: result.holdId, seats: result.seats, expiresAt: result.expiresAt });
          setHoldError(null);
        } else {
          setHold(null);
          setHoldError(result.message);
          // Let a later attempt retry the same size once the traveller reacts.
          claimedFor.current = -1;
        }
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [seats, context.departure.id]);

  // Give the seats back if the tab goes away mid-flow rather than making the
  // next traveller wait out a window nobody is using.
  const holdIdRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  // Kept in a ref so the callbacks below stay stable: `onRefresh` and
  // `onExpire` are dependencies of HoldTimer's effect, and rebuilding them on
  // every hold change would restart the countdown each time.
  useEffect(() => {
    holdIdRef.current = hold?.id ?? null;
  }, [hold?.id]);

  useEffect(() => {
    return () => {
      // Not on submit: from there the hold belongs to the booking.
      if (submittedRef.current || !holdIdRef.current) return;
      void releaseHoldAction(holdIdRef.current);
    };
  }, []);

  const refreshHold = useCallback(() => {
    const id = holdIdRef.current;
    if (!id) return;
    void extendHoldAction(id).then((expiresAt) => {
      if (expiresAt) setHold((h) => (h ? { ...h, expiresAt } : h));
    });
  }, []);

  const expireHold = useCallback(() => {
    setHold(null);
    setHoldError('Your seats were released — the window ran out. Choose your party again to hold them.');
    claimedFor.current = -1;
  }, []);

  // ── party changes ───────────────────────────────────────────────────────
  // Travellers are *derived* from the party, so they are rebuilt in the same
  // state transition that changes it. Reacting to the party in an effect and
  // setting travellers afterwards would render one frame where the two
  // disagree — and is precisely the pattern React 19 now rejects.
  const setParty = useCallback((patch: Partial<Party>) => {
    setDraft((d) => {
      const party = { ...d.party, ...patch };
      // Every infant needs a lap.
      party.infants = Math.min(party.infants, party.adults);
      if (
        party.adults === d.party.adults &&
        party.children === d.party.children &&
        party.infants === d.party.infants
      ) {
        return d;
      }
      return { ...d, party, travellers: reconcileTravellers(d.travellers, party) };
    });
  }, []);


  // ── step gating ─────────────────────────────────────────────────────────
  const stepErrors = useMemo(
    () => validateStep(draft, context, selectionProblems),
    [draft, context, selectionProblems]
  );
  const canContinue = stepErrors.length === 0 && !!hold && !holdError;

  function goTo(index: number) {
    setShowErrors(false);
    setSubmitError(null);
    setDraft((d) => ({ ...d, step: index, furthest: Math.max(d.furthest, index) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function next() {
    if (stepErrors.length > 0 || !hold) {
      setShowErrors(true);
      return;
    }
    if (draft.step === 3) {
      submit();
      return;
    }
    goTo(draft.step + 1);
  }

  function submit() {
    if (!hold) return;
    setSubmitError(null);
    startTransition(async () => {
      const result = await submitBookingAction({
        departureId: context.departure.id,
        holdId: hold.id,
        currency: context.currency,
        lead: {
          name: draft.lead.name.trim(),
          email: draft.lead.email.trim(),
          phone: draft.lead.phone.trim() || null,
          address: hasAddress(draft.address) ? { ...draft.address } : null,
        },
        party: draft.party,
        roomTypeId: draft.roomTypeId,
        extras: draft.extras,
        promotionCode: promotion?.code ?? null,
        travellers: draft.travellers.map((t) => ({
          ...t,
          legalName: t.legalName.trim(),
        })),
        customFields: collectCustomFields(draft, context),
        acknowledgements: acknowledgedBlocks(draft, context),
        expectedTotalCents: currentQuote.totalCents,
      });

      if (result.ok) {
        submittedRef.current = true;
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* nothing to clean up */
        }
        router.push(`/booking/${result.reference}`);
        return;
      }
      setSubmitError(result.message);
      if (result.reason === 'price_changed') {
        // Show them the step where the number lives, not an error in isolation.
        goTo(2);
      }
    });
  }

  async function checkPromotion() {
    const code = draft.promotionCode.trim();
    if (!code) {
      setPromotion(null);
      setPromotionNote(null);
      return;
    }
    const found = await applyPromotionAction(code, context.package.id, context.currency, draft.lead.email);
    setPromotion(found.promotion);
    setPromotionNote(found.promotion ? `${found.promotion.code} applied.` : found.reason);
  }

  // ── render ──────────────────────────────────────────────────────────────
  const stepBlocks = context.disclosures[STEPS[draft.step].key];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <Link
        href={`/tours/${context.package.slug}`}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-stone transition-colors hover:text-flame"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" />
        Back to the tour
      </Link>

      <div className="mt-5">
        <Stepper steps={[...STEPS]} current={draft.step} furthest={draft.furthest} onJump={goTo} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {holdError && (
            <Banner tone="warn">
              {holdError}
            </Banner>
          )}
          {submitError && <Banner tone="error">{submitError}</Banner>}

          {draft.step === 0 && (
            <StepTravellers
              draft={draft}
              setDraft={setDraft}
              setParty={setParty}
              context={context}
              showErrors={showErrors}
              problems={selectionProblems}
              seats={seats}
              headcount={headcount}
            />
          )}

          {draft.step === 1 && (
            <StepExtras
              draft={draft}
              setDraft={setDraft}
              context={context}
              showErrors={showErrors}
              headcount={headcount}
            />
          )}

          {draft.step === 2 && (
            <StepReview
              draft={draft}
              setDraft={setDraft}
              context={context}
              onCheckPromotion={checkPromotion}
              promotionNote={promotionNote}
            />
          )}

          {draft.step === 3 && (
            <StepTerms draft={draft} setDraft={setDraft} context={context} showErrors={showErrors} />
          )}

          {stepBlocks.length > 0 && draft.step !== 3 && (
            <div className="mt-8">
              <DisclosureList
                blocks={stepBlocks}
                accepted={draft.accepted}
                onToggle={(id, v) =>
                  setDraft((d) => ({ ...d, accepted: { ...d.accepted, [id]: v } }))
                }
                showErrors={showErrors}
              />
            </div>
          )}

          {showErrors && stepErrors.length > 0 && (
            <ul className="mt-6 flex flex-col gap-1.5 rounded-card border border-ember bg-ember/5 p-4">
              {stepErrors.map((e) => (
                <li key={e} className="flex gap-2 text-[13.5px] leading-relaxed text-ember">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {e}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-6">
            {draft.step > 0 ? (
              <button
                type="button"
                onClick={() => goTo(draft.step - 1)}
                className="inline-flex items-center gap-2 rounded-field border border-line px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-label text-ink transition-colors hover:border-flame hover:text-flame"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              onClick={next}
              disabled={pending || (!canContinue && showErrors)}
              className="inline-flex items-center gap-2 rounded-field bg-flame px-6 py-3.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:cursor-not-allowed disabled:bg-stone/40"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {draft.step === 3 ? 'Confirm and reserve' : 'Continue'}
              {draft.step < 3 && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-stone">
            {draft.step === 3
              ? 'Reserving holds your places while you pay. No card is charged at this step.'
              : 'You will not be charged until the final step.'}
          </p>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <QuoteSummary
            context={context}
            quote={currentQuote}
            expiresAt={hold?.expiresAt ?? null}
            onExpire={expireHold}
            onRefresh={refreshHold}
          />
          {context.seller.registrationNumber && (
            <p className="mt-3 px-1 text-[11px] leading-relaxed text-stone">
              Sold by {context.seller.name ?? 'Empiria World Inc.'} · Registration{' '}
              {context.seller.registrationNumber}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────

function StepTravellers({
  draft,
  setDraft,
  setParty,
  context,
  showErrors,
  problems,
  seats,
  headcount,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  setParty: (patch: Partial<Party>) => void;
  context: BookingContext;
  showErrors: boolean;
  problems: { field: string; message: string }[];
  seats: number;
  headcount: number;
}) {
  const maxSeats = Math.max(context.departure.seatsAvailable, seats);

  return (
    <section>
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
        Who is travelling?
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-stone">
        Names must match the passport or photo ID each traveller will carry. Infants travel on an
        adult’s lap and do not take a seat.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Field id="party-adults" label="Adults">
          <NumberSelect
            id="party-adults"
            value={draft.party.adults}
            min={1}
            max={Math.max(1, maxSeats)}
            onChange={(n) => setParty({ adults: n })}
          />
        </Field>
        <Field id="party-children" label="Children">
          <NumberSelect
            id="party-children"
            value={draft.party.children}
            min={0}
            max={Math.max(0, maxSeats - 1)}
            onChange={(n) => setParty({ children: n })}
          />
        </Field>
        <Field id="party-infants" label="Infants">
          <NumberSelect
            id="party-infants"
            value={draft.party.infants}
            min={0}
            max={draft.party.adults}
            onChange={(n) => setParty({ infants: n })}
          />
        </Field>
      </div>

      {problems.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {problems.map((p) => (
            <li key={p.message} className="text-[13px] leading-relaxed text-ember">
              {p.message}
            </li>
          ))}
        </ul>
      )}

      {context.package.minimumAge != null && (
        <p className="mt-3 text-[12.5px] text-stone">
          Minimum age for this trip is {context.package.minimumAge}.
        </p>
      )}

      <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">Lead traveller</h2>
      <p className="mt-1 text-[13.5px] leading-relaxed text-stone">
        We send the confirmation, tickets and any change of plan to this person.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id="lead-name"
          label="Full name"
          required
          error={showErrors && !draft.lead.name.trim() ? 'Required' : undefined}
        >
          <TextInput
            id="lead-name"
            value={draft.lead.name}
            autoComplete="name"
            error={showErrors && !draft.lead.name.trim()}
            onChange={(v) => setDraft((d) => ({ ...d, lead: { ...d.lead, name: v } }))}
          />
        </Field>
        <Field
          id="lead-email"
          label="Email"
          required
          error={showErrors && !isEmail(draft.lead.email) ? 'A valid email address' : undefined}
        >
          <TextInput
            id="lead-email"
            type="email"
            value={draft.lead.email}
            autoComplete="email"
            error={showErrors && !isEmail(draft.lead.email)}
            onChange={(v) => setDraft((d) => ({ ...d, lead: { ...d.lead, email: v } }))}
          />
        </Field>
        <Field id="lead-phone" label="Phone" hint="For urgent changes on the day.">
          <TextInput
            id="lead-phone"
            type="tel"
            value={draft.lead.phone}
            autoComplete="tel"
            onChange={(v) => setDraft((d) => ({ ...d, lead: { ...d.lead, phone: v } }))}
          />
        </Field>
      </div>

      <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">
        Everyone on the booking
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {draft.travellers.map((t, i) => (
          <div key={t.position} className="rounded-card border border-line bg-paper p-4">
            <p className="font-mono text-[10px] uppercase tracking-label text-flame">
              {t.isLead ? 'Lead · ' : ''}
              {t.travellerType} {countWithinType(draft.travellers, i)}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                id={`t-${t.position}-name`}
                label="Full name as per ID"
                required
                error={showErrors && !t.legalName.trim() ? 'Required' : undefined}
              >
                <TextInput
                  id={`t-${t.position}-name`}
                  value={t.legalName}
                  error={showErrors && !t.legalName.trim()}
                  onChange={(v) => setDraft((d) => updateTraveller(d, t.position, { legalName: v }))}
                />
              </Field>
              <Field id={`t-${t.position}-dob`} label="Date of birth">
                <TextInput
                  id={`t-${t.position}-dob`}
                  type="date"
                  value={t.dateOfBirth ?? ''}
                  onChange={(v) =>
                    setDraft((d) => updateTraveller(d, t.position, { dateOfBirth: v || null }))
                  }
                />
              </Field>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-stone">
        {headcount} {headcount === 1 ? 'person' : 'people'} on this booking · {seats}{' '}
        {seats === 1 ? 'seat' : 'seats'} held.
      </p>
    </section>
  );
}

function StepExtras({
  draft,
  setDraft,
  context,
  showErrors,
  headcount,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  context: BookingContext;
  showErrors: boolean;
  headcount: number;
}) {
  const rooms = context.pricing.roomTypes;
  const extras = context.pricing.extras;
  const bookingFields = context.customFields.filter((f) => f.appliesTo === 'booking');
  const travellerFields = context.customFields.filter((f) => f.appliesTo === 'traveller');

  return (
    <section>
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
        Anything else?
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-stone">
        Rooms, add-ons and the few things this trip needs to know. Everything here changes the total
        beside you as you choose it.
      </p>

      {rooms.length > 1 && (
        <>
          <h2 className="mt-8 font-display text-[19px] font-semibold text-ink">Room</h2>
          <div className="mt-3 flex flex-col gap-2">
            {rooms.map((r) => (
              <label
                key={r.id}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors',
                  draft.roomTypeId === r.id ? 'border-flame bg-flame/5' : 'border-line hover:border-flame',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="room"
                  checked={draft.roomTypeId === r.id}
                  onChange={() => setDraft((d) => ({ ...d, roomTypeId: r.id }))}
                  className="mt-1 h-4 w-4 accent-[var(--flame)]"
                />
                <span className="flex-1">
                  <span className="block text-[14px] font-medium text-ink">{r.name}</span>
                  <span className="block text-[12.5px] text-stone">Sleeps up to {r.maxOccupancy}</span>
                </span>
                <span className="shrink-0 text-[13px] text-stone">
                  {r.priceAdjustmentCents === 0
                    ? 'Included'
                    : `${formatPrice(r.priceAdjustmentCents, context.currency)} pp`}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {extras.length > 0 && (
        <>
          <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">Add to your trip</h2>
          <div className="mt-3 flex flex-col gap-2">
            {extras.map((x) => {
              const on = (draft.extras[x.id] ?? 0) > 0;
              return (
                <label
                  key={x.id}
                  className={[
                    'flex cursor-pointer items-start gap-3 rounded-card border p-4 transition-colors',
                    on ? 'border-flame bg-flame/5' : 'border-line hover:border-flame',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        extras: {
                          ...d.extras,
                          [x.id]: e.target.checked ? (x.per === 'person' ? headcount : 1) : 0,
                        },
                      }))
                    }
                    className="mt-1 h-4 w-4 accent-[var(--flame)]"
                  />
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium text-ink">{x.name}</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-stone">
                    {formatPrice(x.priceCents, context.currency)}
                    {x.per === 'person' ? ' pp' : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      {bookingFields.length > 0 && (
        <>
          <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">This trip asks</h2>
          <div className="mt-4 flex flex-col gap-4">
            {bookingFields.map((f) => (
              <CustomFieldInput
                key={f.id}
                field={f}
                idPrefix="booking"
                value={draft.fieldValues[`${f.id}|booking`] ?? ''}
                showErrors={showErrors}
                onChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    fieldValues: { ...d.fieldValues, [`${f.id}|booking`]: v },
                  }))
                }
              />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">
        For each traveller
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {draft.travellers.map((t) => (
          <div key={t.position} className="rounded-card border border-line bg-paper p-4">
            <p className="font-mono text-[10px] uppercase tracking-label text-flame">
              {t.legalName.trim() || `${t.travellerType} ${t.position}`}
            </p>
            <div className="mt-3 flex flex-col gap-4">
              <Field id={`t-${t.position}-diet`} label="Dietary requirements">
                <TextInput
                  id={`t-${t.position}-diet`}
                  value={t.dietaryNotes ?? ''}
                  onChange={(v) =>
                    setDraft((d) => updateTraveller(d, t.position, { dietaryNotes: v || null }))
                  }
                />
              </Field>
              <Field
                id={`t-${t.position}-access`}
                label="Accessibility needs"
                hint="Anything we should arrange in advance."
              >
                <TextInput
                  id={`t-${t.position}-access`}
                  value={t.accessibilityNotes ?? ''}
                  onChange={(v) =>
                    setDraft((d) => updateTraveller(d, t.position, { accessibilityNotes: v || null }))
                  }
                />
              </Field>
              {travellerFields.map((f) => (
                <CustomFieldInput
                  key={f.id}
                  field={f}
                  idPrefix={`t${t.position}`}
                  value={draft.fieldValues[`${f.id}|${t.position}`] ?? ''}
                  showErrors={showErrors}
                  onChange={(v) =>
                    setDraft((d) => ({
                      ...d,
                      fieldValues: { ...d.fieldValues, [`${f.id}|${t.position}`]: v },
                    }))
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StepReview({
  draft,
  setDraft,
  context,
  onCheckPromotion,
  promotionNote,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  context: BookingContext;
  onCheckPromotion: () => void;
  promotionNote: string | null;
}) {
  const room = context.pricing.roomTypes.find((r) => r.id === draft.roomTypeId);
  const chosenExtras = context.pricing.extras.filter((x) => (draft.extras[x.id] ?? 0) > 0);

  return (
    <section>
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
        Check it over
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-stone">
        The full breakdown is beside you. Change anything by stepping back.
      </p>

      <dl className="mt-6 divide-y divide-line rounded-card border border-line bg-paper">
        <Row label="Lead traveller">
          {draft.lead.name || '—'}
          <span className="block text-[13px] text-stone">{draft.lead.email}</span>
        </Row>
        <Row label="Travelling">
          {draft.travellers.map((t) => (
            <span key={t.position} className="block">
              {t.legalName || <span className="text-ember">Name missing</span>}
              <span className="ml-2 font-mono text-[10px] uppercase tracking-label text-stone">
                {t.travellerType}
              </span>
            </span>
          ))}
        </Row>
        {room && <Row label="Room">{room.name}</Row>}
        {chosenExtras.length > 0 && (
          <Row label="Extras">
            {chosenExtras.map((x) => (
              <span key={x.id} className="block">
                {x.name}
              </span>
            ))}
          </Row>
        )}
      </dl>

      <h2 className="mt-10 font-display text-[19px] font-semibold text-ink">Promotion code</h2>
      <div className="mt-3 flex gap-2">
        <input
          id="promo"
          aria-label="Promotion code"
          value={draft.promotionCode}
          onChange={(e) => setDraft((d) => ({ ...d, promotionCode: e.target.value }))}
          placeholder="If you have one"
          className={`${fieldClass} max-w-xs uppercase`}
        />
        <button
          type="button"
          onClick={onCheckPromotion}
          className="shrink-0 rounded-field border border-line px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-ink transition-colors hover:border-flame hover:text-flame"
        >
          Apply
        </button>
      </div>
      {promotionNote && <p className="mt-2 text-[13px] text-stone">{promotionNote}</p>}
    </section>
  );
}

function StepTerms({
  draft,
  setDraft,
  context,
  showErrors,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  context: BookingContext;
  showErrors: boolean;
}) {
  const blocks = context.disclosures.booking_terms;

  return (
    <section>
      <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink sm:text-[32px]">
        Before you reserve
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-stone">
        Please read these and confirm. We record the exact wording you agreed to, with the date and
        time, and it stays on your booking.
      </p>

      {context.seller.statutoryNotice && (
        <p className="mt-6 rounded-card border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-stone">
          {context.seller.statutoryNotice}
        </p>
      )}

      <div className="mt-6">
        {blocks.length === 0 ? (
          <p className="rounded-card border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-stone">
            No additional terms have been published for this trip. Our{' '}
            <Link href="/booking-conditions" className="text-flame underline underline-offset-4">
              booking conditions
            </Link>{' '}
            and{' '}
            <Link href="/cancellation" className="text-flame underline underline-offset-4">
              cancellation policy
            </Link>{' '}
            apply.
          </p>
        ) : (
          <DisclosureList
            blocks={blocks}
            accepted={draft.accepted}
            onToggle={(id, v) => setDraft((d) => ({ ...d, accepted: { ...d.accepted, [id]: v } }))}
            showErrors={showErrors}
          />
        )}
      </div>
    </section>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-6">
      <dt className={`${labelClass} sm:w-40 sm:shrink-0`}>{label}</dt>
      <dd className="text-[14px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  return (
    <p
      className={[
        'mb-6 flex gap-2 rounded-card border p-4 text-[13.5px] leading-relaxed',
        tone === 'error' ? 'border-ember bg-ember/5 text-ember' : 'border-line bg-paper text-stone',
      ].join(' ')}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ─── Draft helpers ────────────────────────────────────────────────────────

function blankDraft(
  context: BookingContext,
  party: Party,
  roomTypeId: string | null,
  extras: Record<string, number>
): Draft {
  const defaultRoom =
    roomTypeId ??
    context.pricing.roomTypes.find((r) => r.isDefault)?.id ??
    context.pricing.roomTypes[0]?.id ??
    null;
  return {
    step: 0,
    furthest: 0,
    party,
    roomTypeId: defaultRoom,
    extras,
    lead: { name: '', email: '', phone: '' },
    address: { line1: '', city: '', region: '', postalCode: '', country: '' },
    travellers: travellerSkeleton(party),
    fieldValues: {},
    accepted: {},
    promotionCode: '',
  };
}

function restore(key: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    // A draft with no travellers array is from an older shape; start fresh
    // rather than render half of it.
    if (!parsed || !Array.isArray(parsed.travellers) || !parsed.party) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Positions 1..n: adults, then children, then infants. Position 1 leads. */
function travellerSkeleton(party: Party): TravellerInput[] {
  const out: TravellerInput[] = [];
  const push = (type: 'adult' | 'child' | 'infant', count: number) => {
    for (let i = 0; i < count; i++) {
      const position = out.length + 1;
      out.push({
        position,
        travellerType: type,
        legalName: '',
        dateOfBirth: null,
        isLead: position === 1,
        dietaryNotes: null,
        accessibilityNotes: null,
        emergencyContact: null,
      });
    }
  };
  push('adult', Math.max(0, party.adults));
  push('child', Math.max(0, party.children));
  push('infant', Math.max(0, party.infants));
  return out;
}

/**
 * Resize the traveller list to a new party, keeping what has already been typed.
 *
 * Matched by seat within each type rather than by index, so adding a child does
 * not shuffle the adults' names into the wrong rows.
 */
function reconcileTravellers(existing: TravellerInput[], party: Party): TravellerInput[] {
  const wanted = travellerSkeleton(party);
  const byType = new Map<string, TravellerInput[]>();
  for (const t of existing) {
    const list = byType.get(t.travellerType) ?? [];
    list.push(t);
    byType.set(t.travellerType, list);
  }
  const taken: Record<string, number> = { adult: 0, child: 0, infant: 0 };
  return wanted.map((w) => {
    const previous = byType.get(w.travellerType)?.[taken[w.travellerType]++];
    return previous ? { ...previous, position: w.position, isLead: w.isLead } : w;
  });
}

function updateTraveller(d: Draft, position: number, patch: Partial<TravellerInput>): Draft {
  return {
    ...d,
    travellers: d.travellers.map((t) => (t.position === position ? { ...t, ...patch } : t)),
  };
}

function countWithinType(list: TravellerInput[], index: number): number {
  const type = list[index].travellerType;
  return list.slice(0, index + 1).filter((t) => t.travellerType === type).length;
}

function isEmail(value: string): boolean {
  const v = value.trim();
  return v.length > 3 && v.includes('@') && !v.startsWith('@') && !v.endsWith('@') && !/\s/.test(v);
}

function hasAddress(a: Draft['address']): boolean {
  return Object.values(a).some((v) => v.trim() !== '');
}

function collectCustomFields(draft: Draft, context: BookingContext) {
  const out: { fieldId: string; travellerPosition: number | null; value: string }[] = [];
  for (const [key, value] of Object.entries(draft.fieldValues)) {
    if (!value.trim()) continue;
    const [fieldId, scope] = key.split('|');
    if (!context.customFields.some((f) => f.id === fieldId)) continue;
    out.push({
      fieldId,
      travellerPosition: scope === 'booking' ? null : Number(scope),
      value,
    });
  }
  return out;
}

/**
 * Only blocks that actually asked for a tick, and only where it was given.
 * Recording an acknowledgement nobody was asked to give would make the log
 * useless as evidence of the ones that matter.
 */
function acknowledgedBlocks(draft: Draft, context: BookingContext) {
  const out: { blockId: string; label: string; bodySnapshot: string }[] = [];
  for (const blocks of Object.values(context.disclosures)) {
    for (const b of blocks) {
      if (!b.requiresAcknowledgement) continue;
      if (draft.accepted[b.id] !== true) continue;
      if (out.some((o) => o.blockId === b.id)) continue;
      out.push({ blockId: b.id, label: b.name, bodySnapshot: b.body });
    }
  }
  return out;
}

function validateStep(
  draft: Draft,
  context: BookingContext,
  problems: { message: string }[]
): string[] {
  const errors: string[] = [];
  const stepKey = STEPS[draft.step].key;

  if (draft.step === 0) {
    for (const p of problems) errors.push(p.message);
    if (!draft.lead.name.trim()) errors.push('The lead traveller needs a name.');
    if (!isEmail(draft.lead.email)) errors.push('We need a valid email to send the confirmation to.');
    if (draft.travellers.some((t) => !t.legalName.trim())) {
      errors.push('Every traveller needs the name on their ID.');
    }
  }

  if (draft.step === 1) {
    for (const f of context.customFields) {
      if (!f.isRequired) continue;
      if (f.appliesTo === 'booking') {
        if (!(draft.fieldValues[`${f.id}|booking`] ?? '').trim()) {
          errors.push(`“${f.label}” is required.`);
        }
      } else {
        for (const t of draft.travellers) {
          if (!(draft.fieldValues[`${f.id}|${t.position}`] ?? '').trim()) {
            errors.push(`“${f.label}” is required for ${t.legalName.trim() || `traveller ${t.position}`}.`);
            break;
          }
        }
      }
    }
  }

  // Disclosures attached to this step must be ticked before leaving it.
  for (const b of context.disclosures[stepKey] ?? []) {
    if (b.requiresAcknowledgement && draft.accepted[b.id] !== true) {
      errors.push(`Please confirm “${b.name}”.`);
    }
  }

  return errors;
}
