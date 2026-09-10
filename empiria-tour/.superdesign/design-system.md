# Empiria Tours — design system & product context

## Product
Empiria Tours is the public storefront of Empiria World Inc. (Toronto; TICO-regulated seller) for **small-group guided trips** — Greece, Italy, "and beyond" — sold with fixed departure dates, all-in pricing, and a deposit-then-balance (soon: installment) payment model. Sister products: Empiria Events (ticketing). Audience: travellers 30–65 browsing on phone and desktop, often couples or small families, comparing dates and prices before committing a deposit.

## Jobs to be done
1. **Find a trip I can actually take** — by place, month and party size; see real departures and what's left.
2. **Understand exactly what I get and what it costs** — itinerary day by day, inclusions, rooms, extras, and an itemised all-in total before any form.
3. **Reserve with confidence** — hold seats while I fill in travellers, agree to clearly-shown terms, pay a deposit or in full via Stripe, and get a reference I can come back to.
4. **Manage after booking** — see status, pay the balance, download a receipt, add to calendar.

## Key pages (current information architecture)
- `/` Home — hero with search (Where / When / Who), featured trips, destinations, collections, whole catalogue by category, trust band (seller identity, all-in pricing, human contact).
- `/tours` Results — filter rail (destination, month, travellers, duration, price, category, collection), sort, paginated cards, removable filter chips, helpful empty state.
- `/tours/[slug]` Trip — hero image + gallery, facts (length, where, effort, min age), overview, day-by-day itinerary, included / not included, rooms, practical info, cancellation policy & disclosures; **sticky price panel** with departure picker, party, room, extras, live itemised quote, deposit note, Book CTA.
- `/book/[departure]` Booking flow — 5 steps: Travellers → Extras → Review → Terms → (reserve) with a sticky quote + seat-hold countdown.
- `/booking/[ref]` Booking status & payment — status, itemised cost, travellers, acknowledgements, pay deposit / pay in full, calendar, receipt PDF.
- `/account`, `/account/bookings`, `/login`, `/partners`, policy pages.

## Hard requirements (regulatory / product — never design these away)
- Seller identity (company name + travel registration number) visible before payment and in the footer.
- **All-in pricing**: taxes and fees itemised; the number shown is the number charged. Deposit and balance-due date spelled out next to the smaller number.
- Disclosure blocks with acknowledgement checkboxes at defined placements (package page, each booking step, footer).
- Seat hold countdown during booking; sold-out / closed departures shown as unavailable, not hidden.
- Multi-currency (CAD default, USD, EUR) switcher; prices are set per currency, never converted live.
- Accessibility floor: visible focus, keyboard-operable menus/steppers, reduced-motion respected, alt text, colour contrast ≥ 4.5:1 for text.
- Mobile-first: search plate stacks vertically; price panel becomes a bottom sheet / sticky bar; cards single column.

## Brand identity (KEEP unless the brief says otherwise)
- **Logo**: `public/logo.png` (dark wordmark on light), `public/logo-white.png` (on ink). Always the real asset in logo positions.
- **Accent**: flame `#f15a29` (hover/press ember `#c7431a`). Used for CTAs, active states, eyebrows, focus rings, the dashed "route" motif.
- **Neutrals (warm)**: ink `#17130f`, soot `#241d17`, paper `#f6f2ea` (page), bone `#fcfaf5` (cards), stone `#6c6255` (secondary text), line `#e6ded1` (hairlines).
- **Type**: Bricolage Grotesque (display, 600), Instrument Sans (body), Space Mono (10–11px uppercase "wayfinding" labels, letter-spacing 0.22em).
- **Geometry**: squared corners (8 / 6 / 4px), 1px hairline borders, deep soft lift shadow on hover; light mode only.
- **Motifs**: dashed flame route-rule, corner-bracket "plate" frame, animated route thread, card lift (−4px, border → flame).
- **Motion**: 140–300ms ease transitions; hover lift; drifting dashed route; shake on form error; everything disabled under prefers-reduced-motion.

## Current tone
"Field guide" — surveyed, precise, warm. Copy is plain, honest and specific ("Real departures, all-in pricing, no guesswork"). Empty and error states give direction, never mood.

## Redesign brief (this round)
Goal: **very user-friendly and distinctive**. Priorities, in order: (1) find-a-trip in three taps on a phone; (2) price/date confidence on the trip page; (3) a booking flow that feels short and safe; (4) a look that could only be Empiria. Direction and inspiration per the user's answers in chat — recorded below when decided.

### Direction (decided 7 Sep 2026): COMPLETELY NEW LOOK — only the logo is kept
The current field-guide identity (flame orange, warm ink/paper, squared plates, Bricolage/Instrument/Space Mono) is **retired for this redesign**. Two candidate looks below; each draft uses exactly ONE of them. Both are Mediterranean by subject (sea, limestone, sun) and are chosen to avoid the generic "cream + serif + terracotta" and "black + neon" defaults.

Shared, non-negotiable for both: the real logo asset in every logo position; Where / When / Who search reachable within one scroll on mobile; itemised all-in price wording; seller identity line; departures shown as real dates with seats left; WCAG AA contrast; 44px minimum tap targets; reduced-motion respected.

#### Look A — "Departures" (board-driven, confident, nocturnal hero on a light body)
- Concept: the hero IS a live departures board — the next real departures as rows (destination · dates · days · seats left · from-price · "Hold seats"), like an airport/rail board reimagined for slow travel. Finding a trip is reading a list, not opening a search.
- Palette: night `#0b1a28` (hero / footer ground), sea `#1c6e8c` (primary actions, links), sea-dark `#155670` (hover), foam `#dff0f4` (tints, selected states), limestone `#f3eee4` (page ground), chalk `#fbfaf6` (cards), graphite `#1a1f24` (text on light), mist `#5a6470` (secondary text), signal sun `#f5b942` (seats-left badges, highlights — never body text), success `#2e8b57`, danger `#c0392b`. On the night ground: text `#f3eee4` / `#a9b7c2`.
- Type: **Syne** 700/800 for display (tight tracking −0.02em, sizes 40–72px), **Manrope** 400/500/600 for body (15–17px), **DM Mono** 400/500 for board numerals, dates, prices, labels (12–14px, uppercase labels at 11px with 0.14em tracking).
- Geometry: cards radius 14px; buttons radius 10px; chips full pills; 1px borders `#e4ddd0` on light, `rgba(255,255,255,.12)` on night; shadow `0 20px 50px -30px rgba(11,26,40,.45)` on hover only.
- Layout rhythm: 12-col grid, max-width 1200, section padding 96px desktop / 56px mobile; hero board rows 64px tall with mono columns; sticky compact search bar appears after scrolling past the board.
- Motion: board rows stagger in (60ms); seats-left counter ticks; card hover lifts 3px; 200ms ease-out; no parallax.

#### Look B — "Postcard" (image-led, airy, playful-but-precise)
- Concept: every trip is a postcard. **Hero (v5): white; headline + the inline Where / When / Who search plate on the left, and the POSTCARD DECK on the right** — a CardSwap-style leaning stack of four ILLUSTRATIVE postcards ("what a trip could be": photo fill, bottom gradient, white title + one-line description, a mood kicker such as "Islands · Slow travel"; no dates, seats or prices) that swaps every 5s with an elastic ease; pauses on hover. Content is editorial (admin-editable `showcase_cards`). Stacks under the search on phones.
- **Takeover (v5):** clicking a postcard FLIP-expands its image (900ms, radius 20→0) into the hero's full-screen background; the hero becomes a fixed dialog (scroll locked, everything else inert, ✕ top-right focused, Escape closes); the left column switches to the postcard's kicker, title, description and one teal CTA "Browse all tours" → /tours; the deck keeps the other three cards; clicking another postcard swaps the background; ✕ flies the image back into the front slot (700ms) and restores focus. Instant under reduced motion. Below: the horizontal **month strip** filters the grid; curated trip cards carry the lemon date stamp and a seats-left postmark.
- Palette: **white `#ffffff` (page ground — decided 7 Sep: the background is white; ivory retired)**, card white `#ffffff`, ink-olive `#1d2321` (text), moss `#6a716d` (secondary), **Empiria orange `#f15a29` for BUTTONS (hover/pressed `#d6420f` — the brand primary from the Events projects)**, Ionian teal `#0e7c86` for links, eyebrows, chips and focus (teal-dark `#0a5c64`), sand `#e9dfcf` (dividers, tints), lemon `#f3d35a` (accent stamps/highlights only), coral-danger `#d9534f`, success `#3a8f5c`.
- Type: **Plus Jakarta Sans** 800 for display (tracking −0.03em, 44–80px), **Figtree** 400/500/600 for body (16–17px), **Space Grotesk** 500 for stamps, dates, prices and labels (12–13px; labels uppercase 0.12em).
- Geometry: cards radius 20px with 1px `#ebe4d8` border; search card radius 24px with soft shadow `0 30px 60px -35px rgba(29,35,33,.35)`; pill buttons; generous whitespace; images 3:2.
- Layout rhythm: max-width 1240; hero 80vh on desktop / 60vh mobile with the search card overlapping the fold; month strip scrolls horizontally with snap; 3-col card grid → 1-col mobile with horizontal snap rails for "Featured".
- Motion system (v2 — "alive, not busy"; transform/opacity only; ease-out cubic-bezier(.2,.8,.2,1); everything off under prefers-reduced-motion with final states visible; vanilla JS only, content visible with JS disabled):
  - Load choreography: top bar fades in; headline lines rise 24px + fade with 80ms stagger; the search plate rises 40px + fades at 400ms; the deck fades in at 520ms.
  - Postcard deck (port of the CardSwap component): slots x = i·40, y = −i·44, z = −i·60, z-index = n−i, skewY 4°; every 5s the front card drops (+500px, elastic 2s) while the rest promote one slot with a 150ms stagger and the front returns to the back slot (elastic 2s); pause on hover and when the tab is hidden; static stack under reduced motion; cards are links with a visible focus ring.
  - Scroll reveals (IntersectionObserver, once, rootMargin −10%): section headings and cards fade-up 20px with 70ms stagger; month strip chips slide in from the right; the three "How booking works" steps connect with a dashed line whose dash-offset draws as it enters; "N trips" counters count up.
  - Ambient: the deck's own cycle is the only ambient motion above the fold (the ticker and the photo slideshow were retired in v4 to keep one focal animation).
  - Micro-interactions: cards lift 6px + photo scale 1.05 + stamp rotates −6° → −2°; buttons' arrow slides 4px right and the pill background sweeps; month chips share one sliding active indicator; destination tile captions slide up with photo zoom; footer links draw an underline; sticky top bar is white with backdrop-blur and gains a shadow after 80px (dark logo throughout).
  - Durations 200–600ms for interactions, 6–8s for ambient loops; no parallax, no autoplaying video, nothing that moves text while it is being read.
