'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatPrice, formatDateRange, seatsLabel } from '@/lib/money';
import { quote, validateSelection, headcountFor, type PricingInputs, type TaxRule } from '@/lib/pricing';
import type { PackageDetail } from '@/lib/catalogue';

/**
 * A4's live cost panel.
 *
 * Recalculates on every change of departure, occupancy, room type or extra, and
 * shows the full itemised breakdown before anyone proceeds — both are explicit
 * A4 requirements, and Part D wants the all-in figure with components visible
 * rather than a single number that appears from nowhere.
 *
 * The arithmetic is `lib/pricing.ts`, the same module the booking flow renders
 * with and the server recomputes with before writing anything. It used to have
 * its own copy of the sums; that copy had no taxes or fees in it, so the number
 * here and the number at checkout were destined to disagree the moment Empiria
 * configured a tax rate. Now there is one implementation and three callers.
 */
export default function PricePanel({
  pkg,
  taxRules = [],
}: {
  pkg: PackageDetail;
  /** From `platform_settings.tax_rates`. Empty means nothing is added. */
  taxRules?: TaxRule[];
}) {
  const bookable = pkg.departures.filter((d) => d.seatsAvailable > 0);
  const [departureId, setDepartureId] = useState(bookable[0]?.id ?? '');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState(
    pkg.roomTypes.find((r) => r.isDefault)?.id ?? pkg.roomTypes[0]?.id ?? ''
  );
  const [chosenExtras, setChosenExtras] = useState<Record<string, number>>({});

  const departure = pkg.departures.find((d) => d.id === departureId);

  const inputs: PricingInputs = useMemo(
    () => ({
      currency: pkg.currency,
      adultPriceCents: departure?.pricePerPersonCents ?? pkg.fromPriceCents ?? 0,
      childPriceCents: departure?.childPriceCents ?? pkg.childPriceCents,
      infantPriceCents: pkg.infantPriceCents,
      singleSupplementCents: pkg.singleSupplementCents,
      roomTypes: pkg.roomTypes,
      extras: pkg.extras,
      deposit: pkg.deposit,
      taxRules,
      departureStartsOn: departure?.startsOn ?? null,
    }),
    [pkg, departure, taxRules]
  );

  const selection = useMemo(
    () => ({
      party: { adults, children, infants },
      roomTypeId: roomTypeId || null,
      extras: chosenExtras,
      promotion: null,
    }),
    [adults, children, infants, roomTypeId, chosenExtras]
  );

  const q = useMemo(() => quote(inputs, selection), [inputs, selection]);
  const problems = useMemo(
    () => validateSelection(inputs, selection, departure?.seatsAvailable ?? 0),
    [inputs, selection, departure?.seatsAvailable]
  );

  const pax = q.seats;
  const headcount = headcountFor(selection.party);

  // Carry the selection into A5 so nobody answers the same questions twice.
  const bookHref = departure
    ? `/book/${departure.id}?${new URLSearchParams({
        currency: pkg.currency,
        adults: String(adults),
        children: String(children),
        infants: String(infants),
        ...(roomTypeId ? { room: roomTypeId } : {}),
        ...(Object.entries(chosenExtras).some(([, n]) => n > 0)
          ? {
              extras: Object.entries(chosenExtras)
                .filter(([, n]) => n > 0)
                .map(([id, n]) => `${id}:${n}`)
                .join(','),
            }
          : {}),
      }).toString()}`
    : '';

  const label = 'block font-mono text-[10px] uppercase tracking-label text-stone';
  const field =
    'w-full rounded-field border border-line bg-bone px-3 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-flame';

  return (
    <div className="rounded-card border border-line bg-bone p-5 shadow-lift-panel">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[28px] font-semibold tracking-tight text-ink">
          {formatPrice(departure?.pricePerPersonCents ?? pkg.fromPriceCents, pkg.currency)}
        </span>
        <span className="text-[14px] text-stone">per person</span>
      </div>

      {bookable.length === 0 ? (
        <p className="mt-4 rounded-field bg-paper p-4 text-[14px] leading-relaxed text-stone">
          Every departure is sold out or closed. Get in touch and we will tell you when the next
          dates open.
        </p>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-4">
            <div>
              <label className={label} htmlFor="pp-departure">Departure</label>
              <select
                id="pp-departure" className={field}
                value={departureId}
                onChange={(e) => setDepartureId(e.target.value)}
              >
                {pkg.departures.map((d) => {
                  const left = seatsLabel(d.seatsAvailable);
                  const unavailable = d.seatsAvailable <= 0;
                  return (
                    <option key={d.id} value={d.id} disabled={unavailable}>
                      {formatDateRange(d.startsOn, d.endsOn)}
                      {d.pricePerPersonCents != null && ` · ${formatPrice(d.pricePerPersonCents, pkg.currency)}`}
                      {left ? ` · ${left}` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {([
                ['Adults', adults, setAdults, 1, 'pp-adults'],
                ['Children', children, setChildren, 0, 'pp-children'],
                ['Infants', infants, setInfants, 0, 'pp-infants'],
              ] as const).map(([name, value, set, min, id]) => (
                <div key={id}>
                  <label className={label} htmlFor={id}>{name}</label>
                  <select
                    id={id} className={field} value={value}
                    onChange={(e) => set(Number(e.target.value))}
                  >
                    {Array.from({ length: 9 }, (_, n) => n + min).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {pkg.roomTypes.length > 1 && (
              <div>
                <label className={label} htmlFor="pp-room">Room</label>
                <select
                  id="pp-room" className={field} value={roomTypeId}
                  onChange={(e) => setRoomTypeId(e.target.value)}
                >
                  {pkg.roomTypes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.priceAdjustmentCents !== 0 &&
                        ` · +${formatPrice(r.priceAdjustmentCents, pkg.currency)} pp`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {pkg.extras.length > 0 && (
              <fieldset>
                <legend className={label}>Add to your trip</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {pkg.extras.map((x) => {
                    const on = (chosenExtras[x.id] ?? 0) > 0;
                    return (
                      <label
                        key={x.id}
                        className="flex cursor-pointer items-start gap-3 rounded-field border border-line p-3 transition-colors hover:border-flame"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setChosenExtras((prev) => ({
                              ...prev,
                              [x.id]: e.target.checked ? (x.per === 'person' ? headcount : 1) : 0,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 accent-[var(--flame)]"
                        />
                        <span className="flex-1">
                          <span className="block text-[14px] text-ink">{x.name}</span>
                          {x.description && (
                            <span className="block text-[12.5px] leading-snug text-stone">{x.description}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[13px] text-stone">
                          {formatPrice(x.priceCents, pkg.currency)}
                          {x.per === 'person' ? ' pp' : ''}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>

          {/* ── Itemised breakdown (A4 + Part D) ───────────────────────── */}
          <div className="mt-6 border-t border-line pt-4">
            <ul className="flex flex-col gap-2">
              {q.lines.map((l, i) => (
                <li key={`${l.kind}-${i}`} className="flex items-baseline justify-between gap-4 text-[14px]">
                  <span className="text-ink">
                    {l.label}
                    {l.detail && <span className="ml-1.5 text-[12.5px] text-stone">{l.detail}</span>}
                  </span>
                  <span className={`shrink-0 tabular-nums ${l.amountCents < 0 ? 'text-flame' : 'text-ink'}`}>
                    {formatPrice(l.amountCents, pkg.currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="font-display text-[17px] font-semibold text-ink">Total</span>
              <span className="font-display text-[22px] tabular-nums text-ink">
                {formatPrice(q.totalCents, pkg.currency)}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-stone">
              All in, for {pax} {pax === 1 ? 'traveller' : 'travellers'}
              {infants > 0 && ` plus ${infants} ${infants === 1 ? 'infant' : 'infants'}`}.
              {taxRules.length > 0 ? ' Taxes and fees are itemised above.' : ' Taxes and fees are itemised before payment.'}
            </p>

            {q.depositDueCents > 0 && (
              <div className="mt-4 rounded-field bg-paper p-3">
                <div className="flex items-baseline justify-between text-[14px]">
                  <span className="text-ink">Due today</span>
                  <span className="font-display text-[17px] tabular-nums text-flame">
                    {formatPrice(q.depositDueCents, pkg.currency)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[13px] text-stone">
                  <span>
                    Balance{q.balanceDueOn && ` by ${formatDateRange(q.balanceDueOn, null)}`}
                  </span>
                  <span className="tabular-nums">{formatPrice(q.balanceCents, pkg.currency)}</span>
                </div>
              </div>
            )}
          </div>

          {problems.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 rounded-field bg-paper p-3">
              {problems.map((p) => (
                <li key={p.message} className="text-[13px] leading-relaxed text-ember">
                  {p.message}
                </li>
              ))}
            </ul>
          )}

          {problems.length === 0 && departure ? (
            <Link
              href={bookHref}
              className="mt-5 block w-full rounded-field bg-flame px-6 py-3.5 text-center font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
            >
              Book now
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="mt-5 w-full cursor-not-allowed rounded-field bg-stone/40 px-6 py-3.5 font-mono text-[11px] font-bold uppercase tracking-label text-white"
            >
              Book now
            </button>
          )}
          <p className="mt-3 text-center text-[12px] text-stone">
            You will not be charged until the final step.
          </p>
        </>
      )}
    </div>
  );
}
