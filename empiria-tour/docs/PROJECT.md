# Empiria Tours — where the build stands

Last updated 2 September 2026, against **Revision 1** of the Development
Agreement. Delivery pencilled for end of September (§1.5 makes it non-binding
and it extends for change orders and client delay).

## The number that matters

**Bookings ever taken: 0.** Not in production, not in test, not once.

There is a payment path proved against a local Postgres harness, an outbox with
five proved invariants, partner onboarding with seven, 27 console routes and a
scope audit that catches its own regressions. None of it has ever taken a
booking. Closing that gap is worth more than any new feature.

It needs a `sk_test_` Stripe key and about an hour. `docs/STRIPE.md` is the
runbook. **Do not use a live key** — §3.6(c) makes a single live booking
constitute Acceptance.

## Live database readout (2 Sep)

| Signal | Now | Means |
| --- | --- | --- |
| Bookings | 0 | The revenue path has never run end to end |
| Payments | 0 | No Stripe event has ever been received |
| Published packages | 5 | The site is sellable today, on seed data |
| Administrators | 1 | Enough to work; a second is needed before anyone can be closed or demoted |
| Partners | 0 | No applications yet either |
| Email templates written | 0 of 16 | Nothing would render even if DNS landed |
| Policy pages written | 0 of 7 | Terms, privacy, booking conditions, cancellation all placeholder |
| Registration number | not set | Five published packages, and the site names no seller |

That last row is a live exposure, not a content gap: a TICO-regulated seller
offering to take money while identifying no seller. Either fill the settings
form or unpublish until it is filled.

## What is left, by whose desk it is on

### Empiria — 6 items, none of them code

1. Content, pricing and imagery (§2.1). The catalogue is placeholder seed data.
2. Company name and travel registration number — both unset.
3. Sixteen email bodies and seven policy pages, all empty. Every editor exists.
4. Resend DNS records. The only thing between a working outbox and sent mail.
5. Stripe account access (§4.4(b)), in Empiria World Inc.'s name.
6. Supplier cost per package (§2.1(b)). §4.6(b) gives the formula. Blocks B5.

### Contract decisions — before signature

1. **§5.7 and the LGPL dependency.** `@img/sharp-libvips` ships with
   `next/image`. One sentence of written consent, or narrow the clause.
2. **The installment scope.** Revision 1 moved four features into Exhibit A at
   no change in fee: per-tour installment plans, add-to-calendar, social
   sharing, and Admin-managed advertising of Empiria live events. §1.4 is the
   mechanism for that conversation.
3. **A change order for the partner surface.** Dashboard and onboarding are both
   built; Exhibit A describes neither.

### Buildable now

- **A7 / A8** — the traveller's own account. Last unbuilt public screens.
- **PDF receipts** — A6, A7, Part C and Part D all depend on this. Do it before A7.
- **Add-to-calendar and social sharing** — days between them.
- **B4 customers**, **B5 reporting** (fully specified — §4.6(b) gives the formula).
- **B3's tail** — refunds, cancellation, amending a booking, the audit-trail view.
- **Part C's unwired triggers** — 7 of 13 are wired; four need their triggering
  action (B3's tail), two need the installment schedule.
- **A cron for `/api/email/tick`.** Nothing schedules it yet.
- **Part F** — sitemap, robots, real bot protection, daily backups (§6.1, needs a
  paid Supabase tier), error monitoring, LCP.
- **Installments** — the largest single item. Storing a card at booking and
  charging it later with nobody present is a different Stripe integration, not
  an extension of the current one. Do not start before the commercial question
  is answered.

## Module count against the revised Exhibit A

**24 of 43.** Part A: 2 done, 4 substantial, 2 to start. Part B: 1 done, 3
substantial, 2 to start. Part C: machinery done, nothing sending. Part D:
mechanism done, receipts and wording left. Part E: 2 entities short
(`ad_placements`, installment schedule). Part F: 3 done, 5 open.

## Things that will bite you

- **`lib/database.types.ts` exists in all three repos** and must be regenerated
  and copied to all three after every migration. It has drifted five times.
- **`NEXT_PUBLIC_*` is inlined at build time.** Change one → restart the dev
  server *and* `rm -rf .next`.
- **An empty env value is not a missing one.** `NEXT_PUBLIC_SUPABASE_URL=` with
  nothing after it passes a "key present" check and fails `isSupabaseConfigured()`.
  Check lengths, not presence.
- **All three apps need their own `.env.local`.** The consoles need four
  variables, not two: the `NEXT_PUBLIC_` pair plus `SUPABASE_URL` and
  `SUPABASE_KEY` (service role). Without the latter they open, show a read-only
  banner and list nothing — which reads as a bug, not as configuration.
- **The first administrator is made by hand**, deliberately: any in-app way to
  claim that role is a way for somebody else to claim it.
  `update public.users set role = 'admin' where email = '…';`

## Related documents

- `docs/STRIPE.md` — the live-run runbook.
- `docs/NOTIFICATIONS.md` — Part C's outbox, renderer and clock.
- `CLAUDE.md` in each of the three repos — architecture rules for that app.
