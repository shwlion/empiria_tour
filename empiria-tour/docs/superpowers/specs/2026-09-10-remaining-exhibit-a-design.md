# Closing Exhibit A — design

10 September 2026. Covers every module Exhibit A (Revision 1) describes and the
platform does not yet have, **except per-tour installments**, which the client
has excluded from this piece of work.

The audit against the agreement that produced this list is in `PROJECT.md`.
The short version: 30 of 43 modules are built, and none of them has ever taken
a booking.

## What this is not

Not a plan. It records the decisions that span more than one group, so that ten
separate pieces of work make one coherent platform rather than ten. Sequencing
lives in the group list at the end.

## The decision this reverses

`empiria-tour-admin/CLAUDE.md` records: *"B3 edits almost nothing. No touching
totals, status, seats or price lines."*

Exhibit A B3 requires the opposite — *"amend extras and occupancy with automatic
recalculation of the balance"* and *"cancel a booking and issue a full or partial
refund through the payment provider (Admin only)"*. Exhibit A governs, so the
prohibition goes.

The principle under it does not. What that rule protected was not "the console
must not change bookings" but **"seats and money move in one place, under a
lock, and never in application code."** That survives intact: the new console
actions call new database functions, exactly as they already defer to
`claim_seats` and `record_payment`. The rule becomes:

> **B3 never writes seats or money itself.** It asks a function that holds the
> row lock to do it.

Anything that would write `seats_booked`, `seats_held`, `total_cents`,
`amount_paid_cents` or a price line directly from a server action is still
wrong, and still the thing to refuse in review.

## Refunds

A refund is two facts — Stripe moved money, and our ledger says so — and they
must not be written from the same place.

- The console action calls Stripe's refund API and writes **nothing**.
- The `charge.refunded` webhook writes the ledger, through `record_payment`
  with a negative amount, idempotent on `(provider, provider_ref)` where
  `provider_ref` is the Stripe refund id.

This is the existing rule about who may say a payment happened, applied to the
reverse direction. Writing the ledger from the API response would mean a
network failure after Stripe succeeded leaves the two disagreeing, with the
money gone and the booking still saying paid.

A partial refund does not change booking status. A full refund does, and it
does so through `cancel_booking` rather than by an update — see below.

`STRIPE_SECRET_KEY` must be present in the **admin** app for this, and today it
is not. The control detects its absence and is disabled with a stated reason,
the way the consoles already handle a missing `SUPABASE_KEY`. A control that
throws at click time reads as a bug; one that says why it is grey reads as
configuration.

## Cancellation and seats

Exhibit A A6: *"Availability decrements on confirmation and restores on
cancellation."* Nothing restores seats today, and `cancel_booking` does not
exist.

New function, mirroring `claim_seats`:

```
cancel_booking(p_booking uuid, p_reason text, p_actor uuid)
```

- Takes the departure row lock before touching counters, for the reason
  `claim_seats` does: two concurrent cancellations that each read-then-write
  restore the seats twice.
- Restores `seats_booked` by the booking's seat count.
- Sets status to `cancelled`.
- **Idempotent.** Called twice, it restores once. A webhook retry and an
  impatient administrator are the same event.
- Refuses a booking already `cancelled`, and refuses to take `seats_booked`
  below zero — a refusal, not a clamp, because a clamp hides the arithmetic
  error that produced it.

Proved with a `do $$ … $$` harness against the live database, rows deleted
after, per the migration conventions in `CLAUDE.md`.

## Amendment

Changing occupancy changes seats, so amendment cannot be an `update`. New
function taking the same lock:

```
amend_booking(p_booking uuid, p_adults int, p_children int, p_infants int,
              p_extras jsonb, p_actor uuid)
```

It recomputes price lines from the same inputs `lib/pricing.ts` uses, adjusts
the seat count against the departure under the lock, and refuses an increase
the departure cannot seat. The balance follows from the recomputed total and
`amount_paid_cents`; when the total falls below what was paid, the surplus
becomes a refund the administrator must issue explicitly — the function will
not conjure one, because deciding to return money is a commercial act.

**The pricing engine stays single.** The server recomputes with `lib/pricing.ts`
and compares; disagreement writes nothing. That is the existing rule for
booking, and amendment is a booking whose numbers changed.

## Promotions

*Corrected 11 September.* The audit said "no UI or validation anywhere". Wrong:
the storefront already had the code field, a server-side lookup, and the
pricing engine applying the discount to the subtotal before fees and tax —
with assertions. What was missing was narrower and worse: `usage_count` was
never written, `per_user_limit` was never read, the admin screen did not
exist, and `create_booking` trusted whatever `promotion_id` and
`discount_cents` the payload carried.

**The discount applies to the subtotal — base plus occupancy plus extras —
before taxes and fees.** Not cosmetic: §4.6(b) subtracts *taxes collected and
remitted* from Net Platform Profit, so tax computed on an undiscounted total
would overstate the remittance and mis-state your own revenue share in the
direction that costs you. Already true in `lib/pricing.ts`; now also checked
by the database.

**Enforcement is `check_promotion`, under a row lock, called from
`create_booking`** (migration 0015). It re-checks status, window, scope,
currency, both limits, and recomputes the discount from the subtotal. Two
people racing the last use of a code serialise on the lock; the second is
refused. Everything the storefront and console check before that is courtesy,
so the person is told early — the database is what holds.

**`usage_count` is a trigger on `bookings`, not an increment.** A stored count
incremented in one place must be decremented in every place a booking stops
counting — abandon, expiry, and group 3's cancellation — and one of those
would be forgotten. A recomputing trigger cannot be. A cancelled booking
releases its use; a refunded one does not.

**A code any booking names is switched off, never deleted.**
`bookings.promotion_id` is `on delete set null`; deleting would erase from the
booking's history the fact that a discount was applied.

## Part F, where it needs an account Empiria does not have

§4.4(a) makes third-party accounts Empiria's. Analytics, bot protection and
error monitoring all need one. Building nothing until they exist would leave
A1's consent banner, A5's bot protection and Part F's analytics as Major
defects at Acceptance; building against a provider we cannot configure would
ship something that has never run.

So each ships as a seam with a no-op default:

- `lib/analytics.ts` — a `track()` that does nothing until an env var names a
  provider, gated on consent. The consent banner itself is real and works now.
- `lib/botcheck.ts` — verifies a Turnstile token when `TURNSTILE_SECRET_KEY` is
  set; returns pass when it is not.

Empiria pastes a key and both light up. Nothing breaks while unconfigured, and
nothing pretends to be configured. The seam is the deliverable; the provider is
Empiria's to choose.

## The three static pages

`PROJECT.md` says their names are "in Exhibit A and nowhere in this repo, so ask
before guessing." They are in Exhibit A **B6**, which lists all seven: *terms of
service, privacy policy, booking conditions, cancellation policy, about,
contact, FAQ*. Four exist. The missing three are **about, contact, FAQ**. No
guessing required; that item is unblocked.

## Group 3a — the revenue share, at source

*Added 11 September, at the client's direction: the Tours payment structure
must match the Events platform's, because the 20% is per transaction.*

**What Events does.** Every sale lands on Empiria's Stripe account and the
webhook pushes Elevsoft's cut out on that same transaction: an *intent ledger*
is written to the order before any money moves (a failed write throws, so
Stripe retries and nothing is sent), then `stripe.transfers.create` to
`ELEVSOFT_STRIPE_ACCOUNT_ID` under an idempotency key, the transfer id
recorded. On `charge.refunded` the transfer is reversed proportionally to the
newly-refunded delta, clamped to what is still reversible, keyed on the Stripe
event id; failures go to a `failed_reversals` ledger. The admin revenue page
shows the Elevsoft share as a line.

**Where it does not transplant.** Events' share base — the service fee — is
known at checkout. Tours' base is §4.6(b)'s Net Platform Profit, whose
largest term is **supplier cost**, which Empiria enters after the fact. And
§4.6(d) describes monthly remittance by Empiria, not transfer at source.

**Decision (client, 11 September): per charge, once supplier cost is known.**

- The Events machinery — ledger first, idempotent transfer, proportional
  reversal, `failed_reversals`, console visibility — is built in Tours.
- **Supplier cost moves to the package** (`packages.supplier_cost_cents`),
  where §2.1(b) puts it, stamped onto each booking at creation and still
  editable per booking. For a costed package, NPP is known when a payment
  lands, and that charge's transfer fires then — 20% × (this payment − its
  processor fee − its share of tax − its pro-rata share of supplier cost).
- A payment on an **uncosted** package accrues in the ledger and does not
  transfer. The console shows the gap: *"N bookings owe a revenue-share
  transfer; their package has no supplier cost."* Elevsoft's payment then
  depends on Empiria meeting an obligation the contract already gives it,
  rather than on Empiria remembering a favour.
- Refunds reverse per charge, from the Events code path. Promotions need
  nothing: the discount is already inside `total_cents`, so gross is
  post-discount by construction.
- B5's monthly statement becomes a **readout of this ledger** — the same
  numbers the transfers used — which is what makes §4.6(e) and §4.6(f)
  trivially consistent.
- Tours is on the **same Stripe platform account as Events** (client, 11
  September), so the existing `ELEVSOFT_STRIPE_ACCOUNT_ID` connected account
  is reused as-is. Everything is env-gated regardless: absent the id, the
  ledger accrues and no transfer is attempted.

**Contract note.** §4.6(d) should be amended to say remittance is by transfer
at source, or "may be". The agreement is still a draft for discussion; this
is cheap now and expensive after signature.

This sits **before group 3's refunds**, because refund reversal has to be
designed together with refund issuance.

## Discipline that applies to every group

- Migrations, renumbered after 0014 took the static-page seed:
  `0015_promotion_usage` (done), `0016_revenue_share` (group 3a),
  `0017_cancellation_and_amendment`, `0018_customers_destinations_documents` (done),
  `0019_saved_travellers` (done) — each proved with a `do $$ … $$` harness and its
  test rows deleted.
- `lib/database.types.ts` regenerated and copied to **all three repos in the
  same commit** as the migration. It has drifted five times.
- Every console mutation writes an audit row from the same action as the change.
- `npx tsc --noEmit && npx eslint . --max-warnings=0` per repo, plus
  `npm run check` in the partner repo, before each commit.
- The partner repo's scope audit is re-negative-tested whenever its rules change.

## Groups, in order

| # | Group | Migration | Notes |
|---|---|---|---|
| 1 | `sitemap.ts`, `robots.ts`, about/contact/FAQ | 0014 | Done |
| 2 | Promotion codes (A5, B6, pricing) | 0015 | Done |
| 3a | Revenue share at source (see above) | 0016 | Before 3 |
| 3 | B3 tail + A7 cancellation | 0017 | Unlocks 4 Part C triggers |
| 4 | B4 Customers | 0018 (view) | Done (13 Sep) |
| 5 | B5 Reporting + Revenue Share | — | Done (13 Sep); the statement prints its caveats until supplier costs and processor fees are complete |
| 6 | B6 remainder — destinations, collections, receipt template, staff invitation | 0018 | Done (13 Sep); staff invitation had existed already |
| 7 | Ad placements | — | Done (13 Sep): the client accepted the live Empiria Events section on the home page (`EventsSpotlight`, real events from the Events API) as A2's placement; no `ad_placements` table and no admin editor for it |
| 8 | B2 bulk departures by recurrence | — | |
| 9 | A8 saved traveller profiles | 0019 | Done (13 Sep) |
| 10 | Consent banner, analytics seam, bot-check seam | — | Done (13 Sep): `lib/analytics.ts`, `lib/botcheck.ts` + `components/BotCheck.tsx` |

Group 3 sits early among the substantial ones because it is the largest
Acceptance risk and unlocks four of the six unwired Part C triggers as a side
effect.

## Out of scope, and staying that way

The blog and the partner surface are both built and neither appears in Exhibit
A. §3.4 means they earn nothing at Acceptance. They are noted here so nobody
later mistakes them for contract work.

Per-tour installments (A4, A5, A6, A7, B1, B3, two Part C templates, the Part E
schedule entity) are excluded from this work at the client's direction.
