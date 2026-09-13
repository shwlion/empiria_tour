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
arrives at 2700–3150 rather than the spec's 2760–3560^1.55. The scene layers are raw
`<img>` with a file-level `no-img-element` disable and a stated reason. The
display face is served by `app/api/fonts/ogg/route.ts`: the spec's font host
sends no `Access-Control-Allow-Origin`, so a browser refuses it cross-origin
and the headline falls back to a system serif — the route fetches the same
file server-side and serves it from this origin. The copy is hard-coded in the
component; making it editable from the console is a follow-up.

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
