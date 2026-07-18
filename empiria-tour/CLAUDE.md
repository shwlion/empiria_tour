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

### Design origin
The UI is copied from `empiria-shop` (same Tailwind tokens, Geist fonts, floating
pill navbar, EventCard/EventsGrid/FeaturedHero). Product copy is retargeted from
"events" to "tours". Keep visual parity with the shop when adding components.

### Data flow (home)
`app/page.tsx` (server) fetches published events + featured + categories from
Supabase when configured, sorts by soonest upcoming occurrence, and passes them
to `HomeContent` → `FeaturedHero` (hero slideshow) + `EventsGrid` (client-side
category filter + search + pagination). All wrapped in try/catch so a missing
schema degrades to the empty state instead of crashing.
