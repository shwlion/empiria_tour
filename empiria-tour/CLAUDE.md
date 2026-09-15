# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Commands

All commands run from `empiria-tour/` (the inner directory):

```bash
bun --bun next dev      # Start dev server (localhost:3000)
bun --bun next build    # Production build
bun --bun next start    # Start production server
eslint                  # Lint
```

No test suite is configured.

## Architecture

### Repo layout
Double-nested like the sibling Empiria repos: the git root is `empiria-tour/`
(outer), the Next.js project lives at `empiria-tour/empiria-tour/` (inner).

### Stack
- **Next.js 16 App Router** with React 19 server components by default
- **Bun** runtime + package manager
- **Tailwind CSS v4** (PostCSS-based, no `tailwind.config.js`)
- **Supabase** via `lib/supabase.ts:getSupabaseAdmin()` — returns `null` until
  `SUPABASE_URL` + `SUPABASE_KEY` are set, so the design shell renders with no DB.

### Auth — IMPORTANT
This app does **NOT** use Auth0 (the shop/organizer/admin do). It will use
**Supabase Auth**. There is no `lib/auth0.ts` and no `proxy.ts` here yet. When
wiring auth:
- Add `@supabase/ssr` browser + server clients.
- Gate dashboards by the `role` column on `users`, keyed by the **Supabase auth
  UUID** (the replacement for the shop's `auth0_id`).
- See the header comment in `app/login/page.tsx`.

### Design — "Look B, Postcard" (September 2026)
The field-guide identity is retired. The storefront is **white**, with the
Empiria brand orange (`--flame #f15a29`, hover `--ember #d6420f`) reserved for
buttons and a teal secondary (`--teal #0e7c86`) for eyebrows, links, chips and
focus. Fonts: Plus Jakarta Sans (display), Figtree (body), Space Grotesk (the
mono "wayfinding" layer — not monospace, so `.font-mono` sets tabular numerals).
Cards are 20px-radius, fields 12px, chips pills. **The Tailwind token names
did not change** (`flame`, `ink`, `paper`, `bone`, `stone`, `line`, …) — only
their values in `app/globals.css` — so every page inherited the redesign
without markup edits. The design system, its history and the Superdesign
draft are in `.superdesign/design-system.md` and `.superdesign/resume.json`.

`components/Navbar.tsx` takes `tone` (`'light'` is the default: a sticky white
bar via `components/NavShell.tsx`; `'dark'` is the old floating plate) and
threads it into its menus. The footer is white sitewide.

### The landing page
`app/page.tsx` → `components/home/*`:
- **`HomeHero`** (client) owns the hero and the *takeover*. Its left column is
  a server-rendered slot (`HeroIntro`: headline, `SearchBar`, the Part D
  seller line). Its right column is the **postcard deck**.
- **`PostcardDeck`** renders the four illustrative postcards (`showcase_cards`,
  read by `getShowcaseCards`; edited in the admin console under Content →
  Showcase). They are content, not inventory: no dates, seats or prices. The
  stack is server-rendered from `lib/deck.ts` (slot maths, elastic curve,
  timeline — pure, tested) and animated by `useDeckEngine.ts`, a Web
  Animations API port of the GSAP CardSwap component: no dependency added.
  (The one GSAP consumer, the pinned horizontal "Where we would go first"
  gallery, was replaced by a plain grid at the client's request on 13 Sep
  2026; `gsap` is no longer a dependency at all.)
- **Tapping a postcard** expands its photo from the card rect to the viewport
  (a FLIP on a fixed `.zoom-layer`), the section becomes `position: fixed`
  (`html.takeover`), scroll is locked, everything outside is `inert`, the
  left column shows that postcard's words and one "Browse all tours" link; ✕
  or Escape flies it back and returns focus. `components/home/takeover.ts`
  holds the DOM chores. Reduced motion switches states instantly.
- **`EventsSpotlight`** — "Looking for something different?" — is Exhibit A
  A2's promotional placement for Empiria live events, in live form: six
  real upcoming events read from the Events platform's **public API**
  (`${APEX_URL}/api/events/by-culture`, `lib/events.ts`, cached 15 min),
  never from the Empiria-01 database. City chips and cards link to the
  Events shop in a new tab. With the API unreachable the section keeps its
  words and its link and shows no grid. Dates are composed in the event's
  own timezone with the day period spelled by hand — the same Bun/Chrome
  ICU disagreement `formatDateRange` works around. B6's admin-managed
  placement (schedule, active state, editable copy) is still to build.
- Below: `MonthStrip` (`?month=YYYY-MM` filters the catalogue; `lib/months.ts`),
  the curated grid (`TourCard` carries a lemon date stamp), destinations,
  "How booking works", the trust band. `Reveal` is the single
  IntersectionObserver behind `data-reveal` / `data-stagger` / `data-draw` /
  `data-count`. Load choreography (`.rise-in`, `.fade-in`, `.card-enter`)
  only hides content under `html.js`, which `app/layout.tsx` sets with an
  inline script before paint.

### The journal page
`/blog` is a cinematic scroll story and the published posts are its slider
cards. The composition it reproduces — layers, every CSS value, the per-frame
engine, the infinite slider — is a specification kept verbatim in
`app/blog/cinema.css` and `components/blog/CinemaScroll.tsx`; the words are
the journal's own, and the two large figures are live counts from
`getCatalogueCounts`. The spec's header is replaced by the site's
`<Navbar tone="dark" overlay />`, rendered by the page and fixed to the
viewport. Three adaptations let a standalone page live here, and each is the
smallest one that works:
- **Every selector is prefixed `.cinema-page`.** Route CSS persists across
  client navigations and `.facts` is already a class elsewhere.
- **The spec's `html`/`body` rules hang off `html.cinema-html`**, added on
  mount and removed on unmount — nothing of this page survives leaving it.
- **`max-width: none` on `.scene-img`.** Tailwind's preflight clamps `img` to
  100%; the bridge is 105vw, the splitframes 118vw and frame-two 122vw.
The engine writes its custom properties to `.cinema-page`, not `:root`. A
card click **navigates** to `/blog/[slug]` (the spec's click-to-centre is
replaced by that); the ← → buttons keep the sliding. **Removed from the spec
at the client's request:** the hero title, and every sideways movement — the
pointer parallax, the tower frames parting (with the lift and 1.74× scale
that only made sense alongside it — they fade out over the same window
instead, or they would cover the panels and the cards), and the cards flying
in from 420vw; the row fades in place. Everything vertical is still the
spec's. **Changed for visibility (13 Sep):** the active card is centred in
the viewport by a per-frame correction the engine measures (the spec pushed
it half off the left edge), it lifts with a deeper shadow, the ← → buttons
sit under it, the slider is z 4 so the bazaar layer no longer paints its
minarets through the cards, a dark scrim fades in behind the row, and the row
arrives at 2700–3150 rather than the spec's 2760–3560^1.55. **Each layer is
a box plus a photograph (13 Sep):** `.scene-img` is a div carrying the
spec's position and transform, `.scene-layer` the `<img>` inside it, and
on ≥1.5dppx screens the photograph is laid out at half size and scaled ×2
on the GPU so it rasters at 1× — a quarter of the pixels per layer, which
is what stopped the stutter and blank tiles on a 2560px Retina monitor.
The filters sit on the photograph, not the box, for the same reason. The
engine reads every measurement before it writes anything, so it no longer
forces a layout mid-frame. **No pixel caps
on the layers (13 Sep):** the spec's `min(118vw, 2240px)` on the frames,
`min(122vw, 2160px)` on the river close-up and `min(…, 2140px)` on the
bridge were sized for a ~1920px display; on a 2560px monitor they held the
frames at 87% of the width and left sky at the edges. Every layer is a 16:9
image sized in vw, so uncapped they draw the same shape at any width — a
uniform scale, not a stretch; above ~2900px the 2880px PNGs go a little
soft, which the client chose over gaps. The scene layers are raw
`<img>` with a file-level `no-img-element` disable and a stated reason. The
display face is served by `app/api/fonts/ogg/route.ts`: the spec's font host
sends no `Access-Control-Allow-Origin`, so a browser refuses it cross-origin
and the headline falls back to a system serif — the route fetches the same
file server-side and serves it from this origin. **The cards redesigned (14 Sep), at the client's request:** each is now the
post's hero photograph filling a 440–580 × 360 card (`min(86vw, 360px)` × 320
on phones), with the date, a two-line title and a two-line excerpt on a
gradient at its foot — in place of the spec's 220px cream plate — and the three
pin icons are gone. A post with no picture falls back to a teal-to-ink gradient
rather than a broken image. The height is `--sight-card-h` on `.cinema-page`,
read by both the card and `.sights-controls`, which had each carried their own
220. Known and accepted: on a first visit at ≤~720px tall the taller card puts
the ← → buttons under the cookie banner until it is dismissed. **A scroll cue (14 Sep):** "Scroll for the posts" with a bobbing arrow sits
under the tags inside `.intro-copy`, so it fades with the intro the moment
scrolling starts; it is a button that smooth-scrolls to 3300, where the row is
settled. Nothing on the first screen had said the cards were 2700px down. The copy is hard-coded in the
component; making it editable from the console is a follow-up.

### The contact page
`/contact` is B6's contact page with a form: name (optional), email, message.
It **stores nothing** — by the client's decision — and sends straight to the
contact address in Platform settings through **Amazon SES**, with the
sender's address as Reply-To. `lib/email/ses.ts` is one signed POST over
`fetch` (no SDK, like the Resend mailer); the signature is
`lib/email/sigv4.ts`, proved against AWS's published get-vanilla test vector
in `lib/email/sigv4.test.ts`. Four server-only env vars (`AWS_SES_REGION`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`); absent, the
form renders with Send disabled and says why. Bot protection is the partner
form's honeypot; Part F's real challenge is still unbuilt for all three
public forms. Two SES facts that read as bugs: a sandbox account may only send
*to* verified addresses, and the From must be a verified identity.

### The FAQ page
`/faq` renders the `faq` static page as dropdowns. The questions live in the
page's body in the console, one `## ` line per question with its answer
beneath (`lib/faq.ts`, tested), so Empiria edits them without a code change
as B6 requires; anything above the first question is the introduction, and a
body with no `##` renders as plain text like the other six pages. Each item
is a native `<details>` — no JavaScript, keyboard and screen-reader behaviour
for free — with answers through `renderBlogMarkdown`, which never turns the
author's text into markup. A `FAQPage` JSON-LD is emitted from the same
parse. The seeded questions describe how the platform works and point to
the policy pages for anything that is Empiria's decision; none of them
states a term.

### Saved travellers (A8)
`/account/travellers` is the third account tab: the people this account
books for, in `saved_travellers` (migration 0019 — one row per person per
account via `UNIQUE NULLS NOT DISTINCT (user_id, legal_name, date_of_birth)`,
a cap of twenty by trigger, own-row RLS, erased by `close_own_account`). The
account page writes through the user's own client so the policies decide;
`lib/savedTravellers.ts` reads under the service role filtered by user, as
`getProfile` does. The booking page offers the list on every traveller card
(a picker keyed on name + birthday, so it shows the pick and clears when the
name is edited), starts the lead traveller from the profile, and remembers
the booking's travellers afterwards when the signed-in traveller leaves the
box ticked — `rememberTravellers` updates the ones already there and adds
the rest up to the cap, in the server action, keyed on the server's user.
Not one upsert: the cap is a BEFORE INSERT trigger, which fires for `INSERT …
ON CONFLICT` before the conflict is found. Editing a profile never touches a
booking already made.

### Part F seams — bot protection and analytics
Both are built and both do nothing until Empiria pastes keys (§4.4(a): the
accounts are theirs). **Bot protection:** Cloudflare Turnstile.
`components/BotCheck.tsx` renders the widget only when
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set; `lib/botcheck.ts:verifyBotCheck`
verifies only when `TURNSTILE_SECRET_KEY` is — unset it returns
`{ ok: true, checked: false }`, set it refuses a missing token and fails
closed if Cloudflare is unreachable. On the contact form, the partner
application and the booking flow's last step (A5 "bot protection on
submission"). Forms verify *after* their field checks because a token is
single-use; the widget takes a `resetKey` (the form's last result) so a
refused submit fetches a fresh one. `lib/botcheck.test.ts` proves the round
trip with Cloudflare's published always-pass / always-fail secrets.
**Analytics:** `lib/analytics.ts:track(name, params)` sends to gtag.js or a
GTM container, whichever `components/Analytics.tsx` mounted — and it mounts
nothing until the visitor accepted the consent banner *and* a
`NEXT_PUBLIC_GTM_ID` / `NEXT_PUBLIC_GA_ID` exists. Events: `search`,
`begin_checkout`, `purchase` (once per reference, on the return from
Checkout), `generate_lead`. No manual page views: GA4's enhanced measurement
and a GTM history trigger already count them, and a second would double every
navigation.

### Two things the browser taught us
- **`Intl.formatRange` differs between ICU builds** (Bun: "May 1 – 8", Chrome:
  "May 1–8"), so `formatDateRange` in `lib/money.ts` composes the string
  itself. Before that, every tour page hydrated with a text mismatch.
- **Unlayered CSS beats Tailwind utilities.** A `z-index` written in
  `globals.css` silently overrode a `z-[5]` in JSX; stacking for the takeover
  layers therefore lives in the JSX, and `globals.css` sets none.

### Verifying it
`scripts/` has no browser harness yet; the one used during the redesign was a
40-line CDP driver over Node's built-in WebSocket against
`/Applications/Google Chrome.app` (screenshots, real clicks, Escape, an
overflow audit, console errors). If you need it again, that is all it is.
