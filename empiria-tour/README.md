# Empiria Tour

Tour-booking web app that reuses the **Empiria Shop** design system, minus Auth0.

## Getting started

```bash
bun install
cp .env.local.example .env.local   # fill in when Supabase is ready
bun --bun next dev                 # http://localhost:3000
```

The home page renders **without a database** (design shell) — you'll see the hero
+ an empty "No upcoming tours" state until Supabase is wired up.

## Stack

- **Next.js 16** App Router · React 19 · **Tailwind v4** (PostCSS, no config file)
- **Bun** runtime / package manager
- **Supabase** (planned) — via `lib/supabase.ts:getSupabaseAdmin()`, returns `null`
  until env vars are set
- **Auth: Supabase Auth** (planned — this app does **not** use Auth0)

## What's here

Design shell copied from the shop:

- `app/globals.css`, `app/layout.tsx` — Tailwind + fonts + metadata
- `app/page.tsx` — home (hero slideshow + client-filtered tours grid)
- `app/components/` — `FeaturedHero`, `HomeContent`, `EventsGrid`, `EventCard`
- `components/` — `Navbar` (de-Auth0'd), `Footer`, `MobileNav`, `CurrencySelector`, `JsonLd`
- `lib/` — `urls`, `seo`, `utils`, `datetime`, `supabase`
- Stub routes: `app/events/[slug]`, `app/category/[slug]`, `app/city/[city]`, `app/login`

## TODO

- [ ] Create Supabase project; set `SUPABASE_URL` / `SUPABASE_KEY`
- [ ] Wire **Supabase Auth** in `app/login` + middleware (see file header there)
- [ ] Port ticketing/checkout from `empiria-shop`
- [ ] Add real `/public` assets (logo, hero banner, favicon)
