# Empiria Tours — where the build stands

Last updated 4 September 2026, against **Revision 1** of the Development
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

## Next, in order

**Ask before starting.** This is a considered ranking, not an instruction — the
person you are working with may have a reason to jump the queue, and items 2 and
3 are theirs to do rather than yours. Confirm which one is wanted, then go.

1. **Take one booking, end to end.** A `sk_test_` key, the storefront, the
   webhook, both consoles. It is the only untested thing in a large amount of
   built work, and it converts proof-by-harness into proof. `docs/STRIPE.md`.
2. **Fill in who the seller is, or unpublish.** Five packages are bookable and
   the site names no company and no travel registration. For a TICO-regulated
   seller that is an exposure, not a content gap.
3. **Settle §5.7 and the installment scope.** Contract conversations, not code,
   and cheaper before signature than after.
4. **The three missing policy pages.** What is left of the cheap Revision 1
   additions now that add-to-calendar and social sharing are built. Exhibit A
   wants seven; four exist, are linked from the footer, render from
   `static_pages` and have an editor. The other three need a route each, an
   entry in the admin's `REQUIRED_PAGES`, and a footer link — but **their names
   are in Exhibit A and nowhere in this repo**, so ask before guessing.
5. **A cron for `/api/email/tick`**, without which the time-based Part C
   messages never fire even once DNS lands.
6. **B3's tail** — refunds, cancellation, amending a booking — designed
   together with group 3a's revenue-share transfers. (B4 customers and B5
   reporting are built; B5's statement fills in as supplier costs are
   entered.)
7. **Installments.** The largest single item, and it changes the payment
   architecture rather than extending it. **Do not start before the commercial
   question in item 3 is answered** — it may not be paid work.
8. **The rest of Part F** — daily backups (§6.1, needs a paid Supabase tier),
   error monitoring, LCP. Sitemap, robots, bot protection and analytics are
   built; the last two wait only for Empiria's keys.

## Done since this list was last cut

**B4 customers, B5 reporting, B6's remainder (13 Sep).** Migration 0018:
the `customer_directory` view (every traveller account plus every guest who
booked, one row each, guest bookings attached to a later account by email),
`move_destination` (a slug or parent change rewrites every descendant's
path in one statement, refuses a cycle), and three receipt-wording columns
on the settings singleton. In the console: `/dashboard/customers` with
search, record, edit and CSV; `/dashboard/reports` with the six periods,
the eight metrics, two SVG charts, by-tour and by-destination tables, the
§4.6 statement with its caveats printed, and CSV; Content → Destinations
(the tree, SEO fields, publish state) and Content → Collections (membership
and the home page's featured row); Settings → Documents for the receipt's
title, intro and closing note, rendered by the storefront's receipt.

**A8 — saved traveller profiles (13 Sep).** `saved_travellers` (migration
0019, proved against the live database inside the migration: one row per
person per account with `UNIQUE NULLS NOT DISTINCT`, a cap of twenty by
trigger, RLS as a signed-in traveller, closure erasing the list and leaving
another account's alone). `/account/travellers` edits the list through the
user's own client; the booking page offers it on every traveller card, starts
the lead traveller from the profile, and — ticked by default for a signed-in
traveller — remembers the booking's travellers afterwards, updating the ones
already saved and adding the rest up to the cap. `lib/savedTravellers.ts`,
tested.

**Part F seams (13 Sep).** `lib/botcheck.ts` + `components/BotCheck.tsx`:
Cloudflare Turnstile on the contact form, the partner application and the
booking flow's last step, live once `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` are set; unset, every form behaves as before and the
verifier says it checked nothing. Proved against Cloudflare's always-pass and
always-fail dummy secrets. `lib/analytics.ts`: `track()` sends `search`,
`begin_checkout`, `purchase` and `generate_lead` to whichever of gtag.js or a
GTM container is on the page — which is nothing until the visitor accepts the
consent banner *and* Empiria sets an id. Tested; page views are left to the
provider so nothing is counted twice.

**The redesign — "Look B, Postcard" — is on the landing page (8 Sep).**
White ground, brand-orange buttons, teal secondary, new type; the token
*names* in `app/globals.css` stayed, so every page inherited it. The hero is
headline + search beside a **postcard deck**: four illustrative cards (no
dates, seats or prices — content, not inventory) in a leaning 3D stack that
swaps itself, a dependency-free Web Animations port of the GSAP CardSwap
component. Tapping a postcard expands its photo into the hero's full-screen
background (scroll locked, page inert, ✕/Escape returns). Migration **0012**,
applied 8 Sep, adds `showcase_cards` (RLS: anon reads published; proven by a
probe); the admin console edits them under Content → Showcase; types were
regenerated and copied to all three repos. Below the hero: a month strip
(`?month=`), stamped tour cards, destinations, "How booking works", scroll
reveals. Verified in headless Chrome at 1440 and 390: open/swap/close, focus,
inert, no console errors, no overflow. Two pre-existing defects found on the
way and fixed: `formatDateRange` hydrated with a text mismatch on every tour
page (Bun's and Chrome's `Intl.formatRange` disagree about the dash), and the
admin hard-coded `empiriatours.com` in two places (now `lib/storefront.ts`,
overridable with `NEXT_PUBLIC_TOUR_URL`). The showcase placeholder photos in
`public/showcase/` are Elevsoft stand-ins under §2.1.


**The RPCs anon could call.** Migration **0011, applied 4 Sep.** Ten SECURITY
DEFINER functions were executable by `anon` — which on Supabase means by
anybody, since the anon key ships in the browser bundle and PostgREST exposes
every `public` function at /rest/v1/rpc/<name>. `set_user_role` was the serious
one: its only actor check is `p_user = p_actor`, so it never asks whether the
caller is staff — authorisation lives in the console, which is sound only while
the console is the sole caller. Sign up, call the endpoint with your own id and
'admin', and you were an administrator. `enqueue_email` was a spam relay from
Empiria's verified domain the moment DNS lands.

Nothing legitimate lost access: every caller of all ten, across all three repos,
is a server action holding the service role. Revoked from `public` as well as
the two roles, because Postgres grants EXECUTE to PUBLIC by default and revoking
only the roles leaves that intact — the rule CLAUDE.md already states and
eighteen other functions already followed.

Also in 0011: the `email_messages_own_read` policy no longer re-evaluates
`auth.uid()` per row, and fourteen foreign keys got the covering index they
lacked. **The ~20 "unused index" notices were deliberately left alone** — there
are zero bookings, so every index on `bookings` and `payments` is unused by
definition, and dropping them would be acting on a statement about traffic
rather than about the index. After 0011 the linter reports no WARN-level finding
of either kind.

**Add-to-calendar.** `lib/calendar.ts` builds the ics and Google's prefilled URL
from one exclusive-end rule, so the two destinations agree by construction.
`GET /booking/[reference]/tour.ics` serves the file Apple Calendar and Outlook
take — neither has a template URL, so a route was the only way in — under
`getBookingForViewer`'s authorisation, the booking page's and the receipt's. A
closed booking 404s.

Entries are **all-day**, and that is a decision rather than a shortcut:
`departures` carries dates and a bare `start_time`, and **the Tours schema has no
timezone column anywhere**, so a timed entry means guessing a zone that is wrong
for every tour not leaving from it. `start_time` goes in the description as text.
**DTEND is exclusive** per RFC 5545 §3.6.1 — a trip ending 22 Nov emits 23 Nov —
and seven of the forty-two assertions in `lib/calendar.test.ts` exist for that
one line, because getting it wrong reads as the traveller's calendar
misbehaving rather than as ours. No dependency added, for the §5.7 reason the
mailer has no SDK. `AddToCalendar` is a server component: both destinations are
links, so it ships no JavaScript.

**Social sharing.** The native share sheet where the browser has one, a copyable
link and a `mailto:` where it does not — the sheet being the only option that
reaches the sender's own apps without a button per network and an SDK per
button. Offered after hydration only, since `navigator.share` cannot be detected
on the server. The shared address is always canonical, never the one in the bar:
the tour page takes a `?currency=`, and a shared link should not carry the
sender's currency to the reader.

**An open redirect closed.** Both `/login` and `/auth/callback` guarded `next`
with `startsWith('/') && !startsWith('//')`, which reads as airtight and is not:
browsers fold a backslash into a slash in a special scheme, so `/\evil.com`
satisfied both halves and `router.push` resolved it to another origin. Tab, CR
and LF are stripped before parsing and got through identically. The callback
copy was safe only by accident of prefixing `origin`. Both now share
`safeNextPath` in `lib/urls.ts`, which parses and compares `url.origin` rather
than blacklisting characters — the set a URL parser folds into a slash is not a
list that stays complete. 24 assertions in `lib/urls.test.ts`.

**PDF receipts.** `GET /booking/[reference]/receipt.pdf`, rendered on demand by
`lib/pdf/` with no dependency added — see `docs/RECEIPTS.md`. The booking page
and the account list both link it once a payment exists. What is left of it is
the Part C attachment, which is blocked on Empiria: it cannot be decided which
of the sixteen emails carries a receipt while none of them has a body.

**A7 — the traveller's own bookings.** `/account/bookings`, split into upcoming
and past, each row linking the booking and its receipt. Keyed on the auth UUID
and never on `lead_email`, which is typed by whoever made the booking; a booking
made while signed out is therefore reachable by reference and session cookie
only, and the empty state says so. `MobileNav` had linked "My bookings" to
`/bookings`, which never existed — the one place the no-404-links rule had
already been broken.

**A8 — the account itself.** `/account` edits name, phone, address and the
marketing opt-in through the `update own profile` policy rather than the service
role, so the policy's with-check pins `role` and escalation is impossible there.
Email is read-only: the address of record lives in `auth.users` and changing it
is an authentication event, not a profile edit. Closure runs through
`close_own_account` (migration **0010, applied 3 Sep**), proved against the live
database with a fifteen-assertion `do $$ … $$` harness that rolled itself back:
it anonymises the profile, retains the booking, traveller and payment rows, is
idempotent, refuses a null or unknown account, and refuses to close the last
active administrator — leaving no trace when it refuses. `getUser` treats a
closed account as signed out.

**Sign-in now returns you where you were.** `/login` and `/auth/callback` both
take a `next`, and both accept only same-origin relative paths. A7 and A8 were
the first screens that needed it.

## Live database readout (2 Sep)

| Signal | Now | Means |
| --- | --- | --- |
| Bookings | 0 | The revenue path has never run end to end |
| Payments | 0 | No Stripe event has ever been received |
| Published packages | 5 | The site is sellable today, on seed data |
| Administrators | 1 | Enough to work; a second is needed before anyone can be closed or demoted |
| Partners | 0 | No applications yet either |
| Email templates written | 15 of 16 drafted (0020) | Elevsoft's drafts, in a branded frame; the words are still Empiria's to sign off |
| Policy pages written | 0 of 7 | Terms, privacy, booking conditions, cancellation all placeholder |
| Registration number | not set | Five published packages, and the site names no seller |

That last row is a live exposure, not a content gap: a TICO-regulated seller
offering to take money while identifying no seller. Either fill the settings
form or unpublish until it is filled.

## What is left, by whose desk it is on

### Empiria — 6 items, none of them code

1. Content, pricing and imagery (§2.1). The catalogue is placeholder seed data.
2. Company name and travel registration number — both unset.
3. Seven policy pages, all placeholder, and the sign-off on fifteen drafted
   email bodies (0020 seeded them; the console is where they are edited).
   Every editor exists.
4. Resend DNS records. The only thing between a working outbox and sent mail.
5. Stripe account access (§4.4(b)), in Empiria World Inc.'s name.
6. Supplier cost per package (§2.1(b)). §4.6(b) gives the formula. Blocks B5.

### Contract decisions — before signature

1. **§5.7 and the LGPL dependency.** `@img/sharp-libvips` ships with
   `next/image`. One sentence of written consent, or narrow the clause.
2. **The installment scope.** Revision 1 moved four features into Exhibit A at
   no change in fee: per-tour installment plans, add-to-calendar, social
   sharing, and Admin-managed advertising of Empiria live events. Two of the
   four — add-to-calendar and social sharing — are now built, which leaves the
   conversation about the two that are not. §1.4 is the mechanism for it.
3. **A change order for the partner surface.** Dashboard and onboarding are both
   built; Exhibit A describes neither.

### Buildable now

- **The three missing policy pages** — a route, a `REQUIRED_PAGES` entry and a
  footer link each. Blocked only on which three Exhibit A names.
- **B3's tail** — refunds, cancellation, amending a booking, the audit-trail view.
- **Part C's unwired triggers** — 7 of 13 are wired; four need their triggering
  action (B3's tail), two need the installment schedule.
- **A cron for `/api/email/tick`.** Nothing schedules it yet.
- **Part F** — daily backups (§6.1, needs a paid Supabase tier), error
  monitoring, LCP. Bot protection and analytics are seams that light up when
  Empiria pastes a Turnstile key pair and a GTM or GA4 id (`.env.local.example`).
- **Installments** — the largest single item. Storing a card at booking and
  charging it later with nobody present is a different Stripe integration, not
  an extension of the current one. Do not start before the commercial question
  is answered.

## Module count against the revised Exhibit A

**35 of 43.** Add-to-calendar and social sharing, the two Revision 1 additions
that were code rather than content, are both built. Part A: 4 done, 4
substantial, **none unstarted** — A7 and A8 are both complete, including
closure and, since 13 Sep, saved traveller profiles (migration 0019) that
pre-fill the booking flow. Part B: B4 and B5 done and B6 complete but for ad placements (closed by
the client's acceptance of the live Events section), B1 and B2 substantial,
B3's tail open. Part C:
machinery done, nothing sending. Part D: mechanism done, receipts done,
wording left — every block renders on the receipt, and every one of them is
empty until Empiria writes it. Part E: 1 entity short (the installment
schedule; the client accepted the live Events section as A2's placement, so
no `ad_placements`). Part F: 5 done, 3 open — bot protection (Turnstile,
`lib/botcheck.ts`) and analytics events (`lib/analytics.ts`) are built as
seams and switch on with Empiria's keys; backups, error monitoring and LCP
remain.

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
- `docs/RECEIPTS.md` — the PDF, and why nothing is stored.
- `CLAUDE.md` in each of the three repos — architecture rules for that app.
