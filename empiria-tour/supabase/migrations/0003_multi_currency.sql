-- ===========================================================================
-- Empiria Tours — multi-currency pricing
-- ===========================================================================
-- Empiria charges in the currency the traveller is browsing in, so a price is
-- not a single number plus a conversion. Two consequences:
--
--   1. Prices are SET per currency, not derived. A Santorini trip is €1,450 and
--      CAD $2,150 because someone chose both numbers — not because 1450 × rate
--      produced $2,147.83. Part D wants an all-in price the traveller agreed to;
--      a rate that moved between page view and payment undermines that.
--
--   2. The Revenue Share in Agreement §4.6 has to report in ONE currency. So a
--      booking records what was charged AND a CAD equivalent, with the rate that
--      produced it frozen at purchase.
--
-- Fallback order for an effective price:
--     departure_prices → package_prices → packages.base_price_cents
-- The last only applies when the requested currency IS packages.currency.
--
-- Run AFTER 002_catalogue_and_booking.sql. Idempotent.
-- ===========================================================================

-- ── Currencies Empiria actually sells in ──────────────────────────────────
create table if not exists public.currencies (
  code       text primary key check (code ~ '^[A-Z]{3}$'),
  symbol     text not null,
  name       text not null,
  is_default boolean not null default false,
  sort_order int not null default 0,
  status     text not null default 'active' check (status in ('active', 'inactive'))
);
create unique index if not exists currencies_one_default_idx
  on public.currencies (is_default) where is_default;

insert into public.currencies (code, symbol, name, is_default, sort_order) values
  ('CAD', '$',  'Canadian dollar', true,  1),
  ('USD', 'US$','US dollar',       false, 2),
  ('EUR', '€',  'Euro',            false, 3)
on conflict (code) do nothing;

comment on table public.currencies is
  'The presentment currencies offered. is_default is the reporting currency for the §4.6 revenue share.';

-- ── Per-currency package pricing ──────────────────────────────────────────
create table if not exists public.package_prices (
  package_id              uuid not null references public.packages(id) on delete cascade,
  currency                text not null references public.currencies(code) on delete restrict,
  base_price_cents        int  not null check (base_price_cents >= 0),
  child_price_cents       int  check (child_price_cents >= 0),
  infant_price_cents      int  check (infant_price_cents >= 0),
  single_supplement_cents int  not null default 0 check (single_supplement_cents >= 0),
  deposit_value           int  check (deposit_value >= 0),   -- only when deposit_type = 'fixed'
  primary key (package_id, currency)
);
create index if not exists package_prices_currency_idx on public.package_prices (currency);

comment on table public.package_prices is
  'A real price per currency, set by Empiria — never a live conversion. Absent rows fall back to packages.base_price_cents, which is only valid for packages.currency.';

-- ── Per-currency departure overrides (seasonal pricing) ───────────────────
create table if not exists public.departure_prices (
  departure_id      uuid not null references public.departures(id) on delete cascade,
  currency          text not null references public.currencies(code) on delete restrict,
  base_price_cents  int  not null check (base_price_cents >= 0),
  child_price_cents int  check (child_price_cents >= 0),
  primary key (departure_id, currency)
);
create index if not exists departure_prices_currency_idx on public.departure_prices (currency);

-- ── Booking: what was charged, and the CAD equivalent for reporting ───────
alter table public.bookings
  add column if not exists fx_rate_to_base numeric(18,8),
  add column if not exists total_base_cents int,
  add column if not exists supplier_cost_base_cents int;

comment on column public.bookings.fx_rate_to_base is
  'Rate from bookings.currency to the default currency, frozen at purchase. 1.0 when they are the same.';
comment on column public.bookings.total_base_cents is
  'total_cents expressed in the default currency, so §4.6 can be computed across a mixed-currency period without re-running FX.';
comment on column public.bookings.supplier_cost_base_cents is
  'Empiria supplies supplier_cost_cents in the booking currency; this is its default-currency equivalent at the same frozen rate.';

alter table public.bookings drop constraint if exists bookings_fx_consistent;
alter table public.bookings
  add constraint bookings_fx_consistent
  check (fx_rate_to_base is null or fx_rate_to_base > 0);

-- ── Effective price helper ────────────────────────────────────────────────
-- One definition of "what does this departure cost in this currency", used by
-- the view below and by the booking flow. Keeps the fallback order in one place.
create or replace function public.effective_price_cents(
  p_departure_id uuid,
  p_currency     text
) returns int language sql stable set search_path = public as $$
  select coalesce(
           dp.base_price_cents,
           pp.base_price_cents,
           case when p_currency = pk.currency then pk.base_price_cents end
         )
    from public.departures d
    join public.packages pk on pk.id = d.package_id
    left join public.departure_prices dp
           on dp.departure_id = d.id and dp.currency = p_currency
    left join public.package_prices pp
           on pp.package_id = pk.id and pp.currency = p_currency
   where d.id = p_departure_id;
$$;

-- ── A3 card price, now one row per (package, currency) ────────────────────
drop view if exists public.package_from_price;
create view public.package_from_price as
select p.id                                   as package_id,
       c.code                                 as currency,
       min(coalesce(dp.base_price_cents,
                    pp.base_price_cents,
                    case when c.code = p.currency then p.base_price_cents end)
          )                                   as from_price_cents,
       min(d.starts_on)                       as next_departure_on,
       count(d.id)                            as bookable_departures
  from public.packages p
  cross join public.currencies c
  left join public.package_prices pp
         on pp.package_id = p.id and pp.currency = c.code
  left join public.departures d
         on d.package_id = p.id
        and d.status = 'open'
        and d.starts_on >= current_date
        and d.capacity - d.seats_booked - d.seats_held > 0
  left join public.departure_prices dp
         on dp.departure_id = d.id and dp.currency = c.code
 where c.status = 'active'
 group by p.id, c.code, p.currency, p.base_price_cents
having min(coalesce(dp.base_price_cents,
                    pp.base_price_cents,
                    case when c.code = p.currency then p.base_price_cents end)) is not null;

-- Must not bypass the caller's RLS — anon would otherwise read draft pricing.
alter view public.package_from_price set (security_invoker = on);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.currencies       enable row level security;
alter table public.package_prices   enable row level security;
alter table public.departure_prices enable row level security;

drop policy if exists "read active currencies" on public.currencies;
create policy "read active currencies" on public.currencies
  for select using (status = 'active');

-- Prices inherit the visibility of the package they belong to.
drop policy if exists "read prices of published packages" on public.package_prices;
create policy "read prices of published packages" on public.package_prices
  for select using (exists (
    select 1 from public.packages p
    where p.id = package_prices.package_id and p.status = 'published'));

drop policy if exists "read prices of published departures" on public.departure_prices;
create policy "read prices of published departures" on public.departure_prices
  for select using (exists (
    select 1 from public.departures d
    join public.packages p on p.id = d.package_id
    where d.id = departure_prices.departure_id and p.status = 'published'));

-- ── Privileges ────────────────────────────────────────────────────────────
revoke execute on function public.effective_price_cents(uuid, text) from public, anon, authenticated;
grant  execute on function public.effective_price_cents(uuid, text) to service_role;
