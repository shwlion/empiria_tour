'use client';

import { useMemo, useState } from 'react';
import { formatPrice, formatDateRange, seatsLabel } from '@/lib/money';
import type { PackageDetail } from '@/lib/catalogue';

type Line = { label: string; detail?: string; cents: number };

/**
 * A4's live cost panel.
 *
 * Recalculates on every change of departure, occupancy, room type or extra, and
 * shows the full itemised breakdown before anyone proceeds — both are explicit
 * A4 requirements, and Part D wants the all-in figure with components visible
 * rather than a single number that appears from nowhere.
 *
 * The arithmetic here is for DISPLAY. The booking flow recomputes server-side
 * and writes the result to `booking_price_lines`, because a price a browser
 * calculated is not a price anyone should be charged.
 */
export default function PricePanel({ pkg }: { pkg: PackageDetail }) {
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
  const room = pkg.roomTypes.find((r) => r.id === roomTypeId);

  const { lines, total, deposit, balanceDueOn } = useMemo(() => {
    const out: Line[] = [];
    const perPerson = departure?.pricePerPersonCents ?? pkg.fromPriceCents ?? 0;
    const childPer = departure?.childPriceCents ?? pkg.childPriceCents ?? perPerson;
    const infantPer = pkg.infantPriceCents ?? 0;

    if (adults > 0) {
      out.push({
        label: 'Adults',
        detail: `${formatPrice(perPerson, pkg.currency)} × ${adults}`,
        cents: perPerson * adults,
      });
    }
    if (children > 0) {
      out.push({
        label: 'Children',
        detail: `${formatPrice(childPer, pkg.currency)} × ${children}`,
        cents: childPer * children,
      });
    }
    if (infants > 0) {
      out.push({
        label: 'Infants',
        detail: infantPer === 0 ? 'No charge' : `${formatPrice(infantPer, pkg.currency)} × ${infants}`,
        cents: infantPer * infants,
      });
    }
    // A lone adult in a twin room pays the supplement.
    if (adults === 1 && children === 0 && pkg.singleSupplementCents > 0) {
      out.push({ label: 'Single supplement', cents: pkg.singleSupplementCents });
    }
    if (room && room.priceAdjustmentCents !== 0) {
      out.push({
        label: room.name,
        detail: `${formatPrice(room.priceAdjustmentCents, pkg.currency)} × ${adults + children}`,
        cents: room.priceAdjustmentCents * (adults + children),
      });
    }
    for (const [id, qty] of Object.entries(chosenExtras)) {
      if (!qty) continue;
      const x = pkg.extras.find((e) => e.id === id);
      if (!x) continue;
      const units = x.per === 'person' ? qty : 1;
      out.push({
        label: x.name,
        detail: x.per === 'person' ? `${formatPrice(x.priceCents, pkg.currency)} × ${units}` : undefined,
        cents: x.priceCents * units,
      });
    }

    const sum = out.reduce((n, l) => n + l.cents, 0);

    let dep = 0;
    if (pkg.deposit.type === 'percent') dep = Math.round((sum * pkg.deposit.value) / 100);
    else if (pkg.deposit.type === 'fixed') dep = Math.min(pkg.deposit.value, sum);

    let due: string | null = null;
    if (dep > 0 && departure?.startsOn) {
      const [y, m, d] = departure.startsOn.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - pkg.deposit.balanceDueDaysBefore);
      due = dt.toISOString().slice(0, 10);
    }

    return { lines: out, total: sum, deposit: dep, balanceDueOn: due };
  }, [departure, adults, children, infants, room, chosenExtras, pkg]);

  const pax = adults + children;
  const overCapacity = departure ? pax > departure.seatsAvailable : false;
  const overRoom = room ? pax > room.maxOccupancy : false;

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
                              [x.id]: e.target.checked ? (x.per === 'person' ? pax : 1) : 0,
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
              {lines.map((l, i) => (
                <li key={i} className="flex items-baseline justify-between gap-4 text-[14px]">
                  <span className="text-ink">
                    {l.label}
                    {l.detail && <span className="ml-1.5 text-[12.5px] text-stone">{l.detail}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {formatPrice(l.cents, pkg.currency)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
              <span className="font-display text-[17px] font-semibold text-ink">Total</span>
              <span className="font-display text-[22px] tabular-nums text-ink">
                {formatPrice(total, pkg.currency)}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-stone">
              All in, for {pax} {pax === 1 ? 'traveller' : 'travellers'}
              {infants > 0 && ` plus ${infants} ${infants === 1 ? 'infant' : 'infants'}`}. Taxes and
              fees are itemised before payment.
            </p>

            {deposit > 0 && (
              <div className="mt-4 rounded-field bg-paper p-3">
                <div className="flex items-baseline justify-between text-[14px]">
                  <span className="text-ink">Due today</span>
                  <span className="font-display text-[17px] tabular-nums text-flame">
                    {formatPrice(deposit, pkg.currency)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-[13px] text-stone">
                  <span>
                    Balance{balanceDueOn && ` by ${formatDateRange(balanceDueOn, null)}`}
                  </span>
                  <span className="tabular-nums">{formatPrice(total - deposit, pkg.currency)}</span>
                </div>
              </div>
            )}
          </div>

          {(overCapacity || overRoom) && (
            <p className="mt-4 rounded-field bg-paper p-3 text-[13px] leading-relaxed text-ember">
              {overCapacity
                ? `Only ${departure?.seatsAvailable} ${departure?.seatsAvailable === 1 ? 'place' : 'places'} left on that departure.`
                : `${room?.name} sleeps ${room?.maxOccupancy}. Choose another room or split the party.`}
            </p>
          )}

          <button
            type="button"
            disabled={overCapacity || overRoom || pax === 0}
            className="mt-5 w-full rounded-field bg-flame px-6 py-3.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember disabled:cursor-not-allowed disabled:bg-stone/40"
          >
            Book now
          </button>
          <p className="mt-3 text-center text-[12px] text-stone">
            You will not be charged until the final step.
          </p>
        </>
      )}
    </div>
  );
}
