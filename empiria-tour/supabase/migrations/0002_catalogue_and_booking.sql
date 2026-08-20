-- ===========================================================================
-- Empiria Tours — catalogue, booking, and compliance schema
-- ===========================================================================
-- Implements Exhibit A Part E (Data Model Summary) of the Empiria Tours
-- Development Agreement, plus the structures Parts A–D imply but Part E does
-- not name explicitly: inventory holds, the acknowledgement log, the audit
-- trail, and the disclosure-block placement system.
--
-- Run AFTER supabase/schema.sql (which creates public.users + the auth trigger).
-- Idempotent: safe to re-run.
--
-- CONVENTIONS
--   Money   integer cents, never float, always beside a currency column.
--   Time    timestamptz everywhere. Travel dates that are genuinely date-only
--           (a departure's calendar day) use date.
--   Deletes catalogue rows are archived, never deleted. Booking rows are never
--           deleted at all — §6 of the Agreement and the audit trail need them.
-- ===========================================================================

-- No pgcrypto: gen_random_uuid() is core Postgres since 13, and installing an
-- extension into `public` trips the Supabase security linter (extension_in_public).

-- ===========================================================================
-- 1. ROLES — reconcile with Exhibit A
-- ===========================================================================
-- schema.sql shipped with ('customer','partner','admin'), inherited from the
-- shop. Exhibit A names three roles — traveller < agent < admin — but Empiria
-- has since confirmed a fourth: PARTNER, who reuses the admin feature set
-- behind a different dashboard, scoped to their own packages.
--
-- Partner is NOT described in Exhibit A. It follows the precedent already set by
-- the Events platform, where `organizer` is a subset of `admin` scoped through
-- events.organizer_id (see empiria-organizer/lib/organizer-access.ts). Treat it
-- as change-order scope commercially; it is modelled here so the shape is right.
--
-- Capability order:  traveller  <  partner (own packages)  <  agent  <  admin

alter table public.users drop constraint if exists users_role_check;

update public.users set role = 'traveller' where role = 'customer';

alter table public.users
  alter column role set default 'traveller',
  add constraint users_role_check
    check (role in ('traveller', 'partner', 'agent', 'admin'));

alter table public.users
  add column if not exists phone         text,
  add column if not exists address       jsonb,
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists status        text not null default 'active'
                                         check (status in ('active', 'closed')),
  add column if not exists closed_at     timestamptz;

comment on column public.users.status is
  'A8: account closure anonymises the profile but retains booking records.';

-- Role helpers used by every staff-facing policy below.
create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in ('agent', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

create or replace function public.is_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'partner', false);
$$;

-- owns_package() is defined after public.packages exists — see section 3.

-- ===========================================================================
-- 2. DESTINATIONS, CATEGORIES, COLLECTIONS  (Part E: Destination; B6)
-- ===========================================================================
-- Hierarchical: country → region → city, any depth. A2 renders destination
-- tiles with a package count and a from-price; A1's destination menu is driven
-- by whatever is published here.

create table if not exists public.destinations (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.destinations(id) on delete restrict,
  slug         text not null,
  name         text not null,
  path         text not null unique,     -- 'greece/cyclades/santorini'
  description  text,
  hero_image   text,
  meta_title   text,
  meta_description text,
  status       text not null default 'draft'
               check (status in ('draft', 'published', 'archived')),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (parent_id, slug)
);
create index if not exists destinations_parent_idx on public.destinations (parent_id);
create index if not exists destinations_status_idx on public.destinations (status);

comment on column public.destinations.path is
  'Materialised ancestry so /destinations/greece/cyclades/santorini resolves in one query.';

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  hero_image  text,
  sort_order  int not null default 0,
  status      text not null default 'published'
              check (status in ('draft', 'published', 'archived'))
);

-- Themed collections (A2: "Island Hopping", "Culinary", "Family"), curated in
-- Admin. Distinct from categories: a package has one category, many collections.
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  hero_image  text,
  sort_order  int not null default 0,
  status      text not null default 'draft'
              check (status in ('draft', 'published', 'archived'))
);

-- ===========================================================================
-- 3. PACKAGES  (Part E: Package; A4, B1)
-- ===========================================================================

create table if not exists public.packages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  destination_id  uuid references public.destinations(id) on delete restrict,
  category_id     uuid references public.categories(id) on delete set null,
  tags            text[] not null default '{}',

  summary         text,
  overview        text,                      -- rich text (HTML), A4

  duration_days   int  check (duration_days > 0),
  duration_nights int  check (duration_nights >= 0),
  duration_label  text,                      -- '8 days / 7 nights', '5-6 hours'

  hero_image      text,
  gallery         text[] not null default '{}',

  -- Pricing (B1). Departures may override; see departures.price_override_cents.
  base_price_cents      int not null check (base_price_cents >= 0),
  child_price_cents     int check (child_price_cents >= 0),
  infant_price_cents    int check (infant_price_cents >= 0),
  single_supplement_cents int not null default 0 check (single_supplement_cents >= 0),
  currency              text not null default 'CAD',

  -- Deposit and balance rules (A4, A6, Part D).
  deposit_type          text not null default 'none'
                        check (deposit_type in ('none', 'percent', 'fixed')),
  deposit_value         int  not null default 0 check (deposit_value >= 0),
  balance_due_days_before int not null default 30 check (balance_due_days_before >= 0),

  -- Practical information (A4).
  meeting_point   text,
  minimum_age     int,
  physical_rating text,
  what_to_bring   text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),

  cancellation_policy_id uuid,               -- FK added after policies table
  status          text not null default 'draft'
                  check (status in ('draft', 'published', 'archived')),
  is_featured     boolean not null default false,

  meta_title       text,
  meta_description text,

  -- Ownership. Null = Empiria's own package; set = a partner's, and every
  -- partner-facing query filters on it.
  partner_id      uuid references public.users(id) on delete restrict,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.users(id)
);
create index if not exists packages_status_idx      on public.packages (status);
create index if not exists packages_destination_idx on public.packages (destination_id);
create index if not exists packages_featured_idx    on public.packages (is_featured) where is_featured;
create index if not exists packages_tags_idx        on public.packages using gin (tags);
create index if not exists packages_partner_idx     on public.packages (partner_id)
  where partner_id is not null;

comment on column public.packages.partner_id is
  'Ownership for the partner dashboard. Every partner-facing query filters on this, exactly as the Events organizer app filters on events.organizer_id. Null means the package is Empiria''s own.';

-- Does the current user own this package? The single predicate every partner
-- surface scopes on — the Tours equivalent of events.organizer_id.
create or replace function public.owns_package(pkg uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.packages p
    where p.id = pkg and p.partner_id = auth.uid()
  );
$$;


comment on column public.packages.deposit_type is
  'A5 step 5 offers deposit-or-full only where the package permits it. none = full payment only.';

create table if not exists public.package_collections (
  package_id    uuid not null references public.packages(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  sort_order    int not null default 0,
  primary key (package_id, collection_id)
);

-- Day-by-day itinerary (A4, B1): ordered blocks of title/description/image.
create table if not exists public.itinerary_days (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages(id) on delete cascade,
  position    int  not null,
  title       text not null,
  description text,
  image       text,
  unique (package_id, position)
);

create table if not exists public.package_inclusions (
  id         uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  kind       text not null check (kind in ('included', 'excluded')),
  position   int  not null,
  text       text not null
);
create index if not exists package_inclusions_pkg_idx on public.package_inclusions (package_id, kind, position);

-- Accommodation summary + room types with price adjustments (A4, B1).
create table if not exists public.room_types (
  id              uuid primary key default gen_random_uuid(),
  package_id      uuid not null references public.packages(id) on delete cascade,
  name            text not null,             -- 'Twin share', 'Deluxe sea view'
  description     text,
  price_adjustment_cents int not null default 0,   -- may be negative
  max_occupancy   int not null default 2 check (max_occupancy > 0),
  is_default      boolean not null default false,
  sort_order      int not null default 0
);
create unique index if not exists room_types_one_default_idx
  on public.room_types (package_id) where is_default;

-- Optional extras / add-ons with per-unit price and capacity (A4, B1).
create table if not exists public.package_extras (
  id              uuid primary key default gen_random_uuid(),
  package_id      uuid not null references public.packages(id) on delete cascade,
  name            text not null,
  description     text,
  price_cents     int not null check (price_cents >= 0),
  capacity        int,                       -- null = unlimited
  per             text not null default 'person'
                  check (per in ('person', 'booking')),
  sort_order      int not null default 0,
  status          text not null default 'active'
                  check (status in ('active', 'inactive'))
);

-- Configurable custom booking fields per package (A5 step 3, B1).
create table if not exists public.package_custom_fields (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages(id) on delete cascade,
  key         text not null,
  label       text not null,
  field_type  text not null check (field_type in ('text', 'textarea', 'dropdown', 'checkbox', 'date')),
  options     text[],                        -- dropdown only
  is_required boolean not null default false,
  applies_to  text not null default 'booking'
              check (applies_to in ('booking', 'traveller')),
  sort_order  int not null default 0,
  unique (package_id, key)
);

-- ===========================================================================
-- 4. DEPARTURES  (Part E: Departure; A3, A4, B2)
-- ===========================================================================

create table if not exists public.departures (
  id            uuid primary key default gen_random_uuid(),
  package_id    uuid not null references public.packages(id) on delete cascade,
  starts_on     date not null,
  ends_on       date,
  start_time    time,                        -- day tours; null for multi-day
  capacity      int  not null check (capacity >= 0),
  seats_booked  int  not null default 0 check (seats_booked >= 0),
  seats_held    int  not null default 0 check (seats_held  >= 0),

  price_override_cents       int check (price_override_cents >= 0),
  child_price_override_cents int check (child_price_override_cents >= 0),

  sales_open_at   timestamptz,
  sales_close_at  timestamptz,

  status        text not null default 'open'
                check (status in ('open', 'closed', 'sold_out', 'cancelled')),
  created_at    timestamptz not null default now(),
  unique (package_id, starts_on, start_time)
);
create index if not exists departures_package_date_idx on public.departures (package_id, starts_on);
create index if not exists departures_bookable_idx     on public.departures (starts_on)
  where status = 'open';

comment on column public.departures.seats_held is
  'A5: seats reserved by an in-progress booking flow. Released when the hold expires.';

-- Seats a traveller can actually buy right now.
create or replace function public.departure_seats_available(d public.departures)
returns int language sql stable set search_path = public as $$
  select greatest(d.capacity - d.seats_booked - d.seats_held, 0);
$$;

-- B2: overbooking prevented. Belt and braces alongside the application check.
alter table public.departures drop constraint if exists departures_capacity_not_exceeded;
alter table public.departures
  add constraint departures_capacity_not_exceeded
  check (seats_booked + seats_held <= capacity);

-- A3: the card price is the lowest per-person price across bookable departures.
create or replace view public.package_from_price as
  select p.id as package_id,
         p.currency,
         min(coalesce(d.price_override_cents, p.base_price_cents)) as from_price_cents,
         min(d.starts_on) filter (where d.starts_on >= current_date) as next_departure_on,
         count(*) filter (
           where d.status = 'open'
             and d.starts_on >= current_date
             and d.capacity - d.seats_booked - d.seats_held > 0
         ) as bookable_departures
  from public.packages p
  left join public.departures d
    on d.package_id = p.id
   and d.status = 'open'
   and d.starts_on >= current_date
  group by p.id, p.currency;

-- SECURITY: without security_invoker the view runs with the definer's rights and
-- silently bypasses RLS — anon could read pricing for draft packages through it.
alter view public.package_from_price set (security_invoker = on);

-- ===========================================================================
-- 5. INVENTORY HOLDS  (A5: "selection held for a configurable window")
-- ===========================================================================

create table if not exists public.booking_holds (
  id            uuid primary key default gen_random_uuid(),
  departure_id  uuid not null references public.departures(id) on delete cascade,
  user_id       uuid references public.users(id) on delete set null,
  session_token text not null,               -- guest flows have no user yet
  seats         int  not null check (seats > 0),
  expires_at    timestamptz not null,
  released_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists booking_holds_live_idx
  on public.booking_holds (departure_id, expires_at) where released_at is null;

comment on table public.booking_holds is
  'Default window 20 minutes, configurable in platform_settings.hold_minutes.';

-- ===========================================================================
-- 6. POLICIES, DISCLOSURE BLOCKS  (Part D; B6)
-- ===========================================================================

create table if not exists public.policies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  kind        text not null check (kind in ('cancellation', 'refund', 'booking_conditions')),
  body        text not null,
  is_default  boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.packages drop constraint if exists packages_cancellation_policy_fk;
alter table public.packages
  add constraint packages_cancellation_policy_fk
  foreign key (cancellation_policy_id) references public.policies(id) on delete set null;

-- Named, reusable wording assignable to placements. Empiria owns the content;
-- Elevsoft owns the mechanism (Part D, and §2.3 of the Agreement).
create table if not exists public.disclosure_blocks (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  body       text not null,
  requires_acknowledgement boolean not null default false,
  status     text not null default 'active'
             check (status in ('active', 'inactive')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

comment on table public.disclosure_blocks is
  'Content is supplied by Empiria. Elevsoft warrants the placement mechanism, not the wording (Agreement §2.3).';

create table if not exists public.disclosure_placements (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.disclosure_blocks(id) on delete cascade,
  placement   text not null check (placement in (
                'package_page', 'booking_review', 'booking_travellers',
                'booking_additional', 'booking_terms', 'booking_payment',
                'receipt', 'email_confirmation', 'footer')),
  package_id  uuid references public.packages(id) on delete cascade,  -- null = all packages
  sort_order  int not null default 0,
  unique (block_id, placement, package_id)
);

-- ===========================================================================
-- 7. PROMOTIONS  (A5 step 5; B6)
-- ===========================================================================

create table if not exists public.promotions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  description   text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value int not null check (discount_value > 0),   -- percent, or cents
  currency      text not null default 'CAD',
  valid_from    timestamptz,
  valid_until   timestamptz,
  usage_limit   int,                        -- null = unlimited
  usage_count   int not null default 0,
  per_user_limit int,
  status        text not null default 'active'
                check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now()
);
create index if not exists promotions_code_idx on public.promotions (upper(code));

create table if not exists public.promotion_packages (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  package_id   uuid not null references public.packages(id) on delete cascade,
  primary key (promotion_id, package_id)
);
comment on table public.promotion_packages is
  'Scope. No rows for a promotion means it applies to every package.';

-- ===========================================================================
-- 8. BOOKINGS  (Part E: Booking, Traveller, Payment; A5–A7, B3)
-- ===========================================================================

create sequence if not exists public.booking_reference_seq start 1000;

-- Human-quotable reference. Crockford-ish alphabet: no I, L, O, U.
create or replace function public.next_booking_reference()
returns text language plpgsql set search_path = public as $$
declare
  n     bigint := nextval('public.booking_reference_seq');
  chars text   := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  out   text   := '';
begin
  while n > 0 loop
    out := substr(chars, (n % 32)::int + 1, 1) || out;
    n := n / 32;
  end loop;
  return 'EMP-' || lpad(out, 5, '0');
end;
$$;

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique default public.next_booking_reference(),
  departure_id   uuid not null references public.departures(id) on delete restrict,
  package_id     uuid not null references public.packages(id) on delete restrict,
  user_id        uuid references public.users(id) on delete set null,

  -- Lead traveller (A5 step 2). Denormalised so the record survives account closure.
  lead_name      text not null,
  lead_email     text not null,
  lead_phone     text,
  lead_address   jsonb,

  adults         int not null default 1 check (adults   >= 0),
  children       int not null default 0 check (children >= 0),
  infants        int not null default 0 check (infants  >= 0),
  room_type_id   uuid references public.room_types(id) on delete set null,
  single_supplement boolean not null default false,

  -- Pricing snapshot. Never recomputed after payment — see booking_price_lines.
  currency       text not null default 'CAD',
  subtotal_cents int  not null default 0,
  discount_cents int  not null default 0,
  tax_cents      int  not null default 0,
  fees_cents     int  not null default 0,
  total_cents    int  not null default 0,

  deposit_due_cents int not null default 0,
  amount_paid_cents int not null default 0,
  balance_cents     int generated always as (total_cents - amount_paid_cents) stored,
  balance_due_on    date,

  -- Required for the Revenue Share calculation, Agreement §4.6. Empiria
  -- populates it; the platform never derives it.
  supplier_cost_cents int,

  promotion_id   uuid references public.promotions(id) on delete set null,

  status         text not null default 'pending_payment' check (status in (
                   'pending_payment', 'confirmed', 'balance_due',
                   'paid_in_full', 'travelled', 'cancelled', 'refunded')),

  notes_internal text,
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (adults + children >= 1)
);
create index if not exists bookings_user_idx      on public.bookings (user_id, created_at desc);
create index if not exists bookings_departure_idx on public.bookings (departure_id);
create index if not exists bookings_status_idx    on public.bookings (status);
create index if not exists bookings_email_idx     on public.bookings (lower(lead_email));

comment on column public.bookings.supplier_cost_cents is
  'Agreement §4.6 / Exhibit A Part E: Empiria must populate this per booking or the Revenue Share cannot be calculated.';

-- Itemised breakdown (A4 "full itemised cost breakdown", Part D "all-in price
-- with taxes and fees broken out"). One row per visible line.
create table if not exists public.booking_price_lines (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  kind        text not null check (kind in (
                'base_fare', 'child_fare', 'infant_fare', 'single_supplement',
                'room_adjustment', 'extra', 'discount', 'tax', 'fee')),
  label       text not null,
  quantity    int  not null default 1,
  unit_cents  int  not null,            -- captured at purchase, never re-read
  amount_cents int not null,
  extra_id    uuid references public.package_extras(id) on delete set null,
  sort_order  int not null default 0
);
create index if not exists booking_price_lines_booking_idx on public.booking_price_lines (booking_id, sort_order);

create table if not exists public.travellers (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  position      int  not null,
  traveller_type text not null check (traveller_type in ('adult', 'child', 'infant')),
  legal_name    text not null,               -- as per passport, A5 step 2
  date_of_birth date,
  is_lead       boolean not null default false,
  dietary_notes text,
  accessibility_notes text,
  emergency_contact jsonb,
  unique (booking_id, position)
);

create table if not exists public.custom_field_responses (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  traveller_id uuid references public.travellers(id) on delete cascade,
  field_id    uuid not null references public.package_custom_fields(id) on delete restrict,
  value       text
);

-- Each required acknowledgement recorded with a timestamp (A5, Part D).
create table if not exists public.booking_acknowledgements (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  block_id     uuid references public.disclosure_blocks(id) on delete set null,
  label        text not null,               -- snapshot of the wording shown
  body_snapshot text not null,              -- exact text the traveller agreed to
  accepted_at  timestamptz not null default now(),
  ip_address   inet,
  user_agent   text
);
comment on table public.booking_acknowledgements is
  'body_snapshot is deliberately duplicated: what matters later is the wording shown at the time, not the current version of the block.';

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete restrict,
  kind          text not null check (kind in ('deposit', 'balance', 'full', 'manual', 'refund')),
  amount_cents  int  not null,               -- refunds are negative
  currency      text not null default 'CAD',
  status        text not null default 'pending'
                check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  provider      text not null default 'stripe',
  provider_ref  text,                        -- payment_intent / charge / refund id
  processor_fee_cents int,                   -- feeds the §4.6 Net Platform Profit
  recorded_by   uuid references public.users(id),   -- manual payments only
  created_at    timestamptz not null default now()
);
create unique index if not exists payments_provider_ref_idx
  on public.payments (provider, provider_ref) where provider_ref is not null;
comment on index public.payments_provider_ref_idx is
  'A6: idempotent webhook handling. A retried Stripe event cannot create a second payment row.';

create table if not exists public.booking_documents (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  kind        text not null check (kind in ('receipt', 'invoice', 'voucher', 'other')),
  filename    text not null,
  storage_path text not null,
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- 9. AUDIT TRAIL  (B3: "audit trail of who changed what and when")
-- ===========================================================================

create table if not exists public.audit_log (
  id          bigserial primary key,
  actor_id    uuid references public.users(id) on delete set null,
  actor_email text,
  entity      text not null,
  entity_id   uuid,
  action      text not null,               -- 'create' | 'update' | 'cancel' | 'refund' | ...
  summary     text,
  before      jsonb,
  after       jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, occurred_at desc);

-- ===========================================================================
-- 10. CONTENT AND SETTINGS  (B6; Part C)
-- ===========================================================================

create table if not exists public.static_pages (
  slug        text primary key,            -- 'terms', 'privacy', 'booking-conditions'
  title       text not null,
  body        text not null,
  meta_title  text,
  meta_description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.users(id)
);

create table if not exists public.email_templates (
  key         text primary key,            -- 'booking_confirmed', 'balance_due', ...
  name        text not null,
  subject     text not null,
  body_html   text not null,
  body_text   text,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now()
);

insert into public.email_templates (key, name, subject, body_html) values
  ('account_created',    'Account created',    'Verify your email',                 ''),
  ('booking_confirmed',  'Booking confirmed',  'Your booking is confirmed',          ''),
  ('deposit_taken',      'Deposit taken',      'Deposit received',                   ''),
  ('balance_due',        'Balance due',        'Your balance is due soon',           ''),
  ('balance_paid',       'Balance paid',       'Paid in full',                       ''),
  ('booking_amended',    'Booking amended',    'Your booking has changed',           ''),
  ('booking_cancelled',  'Booking cancelled',  'Your booking has been cancelled',    ''),
  ('refund_issued',      'Refund issued',      'Your refund has been issued',        ''),
  ('departure_change',   'Departure change',   'A change to your departure',         ''),
  ('pre_departure',      'Pre-departure',      'Getting ready for your trip',        ''),
  ('admin_alert',        'Admin alert',        'Empiria Tours: action required',     '')
on conflict (key) do nothing;

-- Single-row settings table. The check constraint is the lock.
create table if not exists public.platform_settings (
  id                    boolean primary key default true check (id),
  company_name          text,
  registration_number   text,               -- travel-industry registration, Part D
  statutory_notice      text,
  contact_email         text,
  contact_phone         text,
  contact_address       jsonb,
  default_currency      text not null default 'CAD',
  hold_minutes          int  not null default 20 check (hold_minutes > 0),
  tax_rates             jsonb not null default '[]'::jsonb,
  social_links          jsonb not null default '{}'::jsonb,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.users(id)
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

comment on column public.platform_settings.registration_number is
  'A1/Part D: rendered sitewide and on documents. Configurable so Empiria can change it without a code change.';

-- ===========================================================================
-- 11. ROW LEVEL SECURITY
-- ===========================================================================
-- Rule for the whole platform: the anon/SSR client may read published
-- catalogue data and a traveller''s own bookings. Everything else — all
-- catalogue writes, all booking writes, all staff surfaces — goes through the
-- service-role client, which bypasses RLS. No staff write policies are
-- defined here on purpose: the Admin console authenticates, then acts as
-- service role after checking is_admin()/is_staff() in application code.

do $$
declare t text;
begin
  foreach t in array array[
    'destinations','categories','collections','packages','package_collections',
    'itinerary_days','package_inclusions','room_types','package_extras',
    'package_custom_fields','departures','booking_holds','policies',
    'disclosure_blocks','disclosure_placements','promotions','promotion_packages',
    'bookings','booking_price_lines','travellers','custom_field_responses',
    'booking_acknowledgements','payments','booking_documents','audit_log',
    'static_pages','email_templates','platform_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ── Public catalogue reads ────────────────────────────────────────────────
drop policy if exists "read published destinations" on public.destinations;
create policy "read published destinations" on public.destinations
  for select using (status = 'published');

drop policy if exists "read published categories" on public.categories;
create policy "read published categories" on public.categories
  for select using (status = 'published');

drop policy if exists "read published collections" on public.collections;
create policy "read published collections" on public.collections
  for select using (status = 'published');

drop policy if exists "read published packages" on public.packages;
create policy "read published packages" on public.packages
  for select using (status = 'published');

-- Package children inherit their parent''s visibility.
do $$
declare t text;
begin
  foreach t in array array['itinerary_days','package_inclusions','room_types',
                           'package_extras','package_custom_fields','departures',
                           'package_collections'] loop
    execute format($f$
      drop policy if exists "read children of published packages" on public.%1$I;
      create policy "read children of published packages" on public.%1$I
        for select using (exists (
          select 1 from public.packages p
          where p.id = %1$I.package_id and p.status = 'published'));
    $f$, t);
  end loop;
end $$;

drop policy if exists "read active disclosure blocks" on public.disclosure_blocks;
create policy "read active disclosure blocks" on public.disclosure_blocks
  for select using (status = 'active');

drop policy if exists "read disclosure placements" on public.disclosure_placements;
create policy "read disclosure placements" on public.disclosure_placements
  for select using (true);

drop policy if exists "read policies" on public.policies;
create policy "read policies" on public.policies for select using (true);

drop policy if exists "read static pages" on public.static_pages;
create policy "read static pages" on public.static_pages for select using (true);

-- Settings are rendered in the footer sitewide, so they are readable. Nothing
-- secret belongs in this table.
drop policy if exists "read platform settings" on public.platform_settings;
create policy "read platform settings" on public.platform_settings for select using (true);

-- ── A traveller''s own records ─────────────────────────────────────────────
drop policy if exists "read own bookings" on public.bookings;
create policy "read own bookings" on public.bookings
  for select using ((select auth.uid()) = user_id);

do $$
declare t text;
begin
  foreach t in array array['booking_price_lines','travellers','custom_field_responses',
                           'booking_acknowledgements','payments','booking_documents'] loop
    execute format($f$
      drop policy if exists "read own booking children" on public.%1$I;
      create policy "read own booking children" on public.%1$I
        for select using (exists (
          select 1 from public.bookings b
          where b.id = %1$I.booking_id and b.user_id = (select auth.uid())));
    $f$, t);
  end loop;
end $$;

-- DELIBERATE: promotions, promotion_packages, booking_holds, audit_log and
-- email_templates have RLS enabled and NO policy at all. In Postgres that denies
-- every anon/authenticated read, which is the intent — promotion codes must not
-- be enumerable from a browser, and the audit log is staff-only. All five reach
-- the app through the service-role client, which bypasses RLS.
--
-- The Supabase linter reports these as `rls_enabled_no_policy` at INFO level.
-- That finding is expected and must NOT be "fixed" by adding a read policy.

-- ── Base-schema policies, re-stated with auth.uid() wrapped ───────────────
-- schema.sql wrote these as `auth.uid() = id`, which Postgres re-evaluates for
-- every candidate row. Wrapping it in a scalar subquery turns it into an
-- InitPlan evaluated once per query (Supabase linter: auth_rls_initplan).
drop policy if exists "read own profile" on public.users;
create policy "read own profile" on public.users
  for select using ((select auth.uid()) = id);

drop policy if exists "update own profile" on public.users;
create policy "update own profile" on public.users
  for update
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = (select u.role from public.users u where u.id = (select auth.uid()))
  );

-- ── Foreign keys on read or cascade paths get a covering index ────────────
-- (Supabase linter: unindexed_foreign_keys.) Deliberately NOT indexed:
-- packages.created_by / cancellation_policy_id, disclosure_blocks.updated_by,
-- platform_settings.updated_by, static_pages.updated_by, payments.recorded_by,
-- bookings.cancelled_by, bookings.room_type_id, booking_acknowledgements.block_id.
-- Those are low-cardinality
-- attribution columns that no screen filters on; an index would cost writes and
-- buy nothing. The linter will keep listing them — that is expected.
create index if not exists audit_log_actor_idx           on public.audit_log (actor_id, occurred_at desc);
create index if not exists bookack_booking_idx           on public.booking_acknowledgements (booking_id);
create index if not exists bookdoc_booking_idx           on public.booking_documents (booking_id);
create index if not exists holds_user_idx                on public.booking_holds (user_id);
create index if not exists price_lines_extra_idx         on public.booking_price_lines (extra_id);
create index if not exists bookings_package_idx          on public.bookings (package_id);
create index if not exists bookings_promotion_idx        on public.bookings (promotion_id);
create index if not exists cfr_booking_idx               on public.custom_field_responses (booking_id);
create index if not exists cfr_field_idx                 on public.custom_field_responses (field_id);
create index if not exists cfr_traveller_idx             on public.custom_field_responses (traveller_id);
create index if not exists disclosure_placements_pkg_idx on public.disclosure_placements (package_id);
create index if not exists pkg_collections_coll_idx      on public.package_collections (collection_id);
create index if not exists package_extras_pkg_idx        on public.package_extras (package_id);
create index if not exists packages_category_idx         on public.packages (category_id);
create index if not exists payments_booking_idx          on public.payments (booking_id);
create index if not exists promotion_packages_pkg_idx    on public.promotion_packages (package_id);

-- ===========================================================================
-- 12. updated_at maintenance
-- ===========================================================================

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['destinations','packages','bookings','platform_settings',
                           'static_pages','email_templates','policies','disclosure_blocks'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format('create trigger touch_%1$s before update on public.%1$I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ===========================================================================
-- 13. PRIVILEGES  (runs last: every function must already exist)
-- ===========================================================================
-- ── Lock down SECURITY DEFINER functions ──────────────────────────────────
-- Anything in `public` is exposed by PostgREST as /rest/v1/rpc/<name>. A
-- SECURITY DEFINER function reachable that way runs with the definer's rights
-- for any caller, so EXECUTE is revoked from the two public-facing roles.
-- (Supabase linter: anon_security_definer_function_executable and
-- authenticated_security_definer_function_executable — both already firing on
-- handle_new_user() in the live Tours project before this migration.)
--
-- Safe because none of these are called by a client:
--   handle_new_user()   runs as a trigger, which executes as the table owner
--   the role helpers     are called from server code running as service_role
-- IF one of these is ever used inside an RLS policy, `authenticated` must be
-- granted EXECUTE back on it, or the policy will fail for signed-in users.
-- NOTE: revoking from anon/authenticated alone is NOT enough — Postgres grants
-- EXECUTE to PUBLIC by default, and that implicit grant is what actually makes
-- these callable. PUBLIC must be revoked explicitly, then service_role granted
-- back so server-side code can still call the helpers.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.current_role() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_partner() from public, anon, authenticated;
revoke execute on function public.owns_package(uuid) from public, anon, authenticated;
revoke execute on function public.next_booking_reference() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

grant  execute on function public.handle_new_user() to service_role;
grant  execute on function public.current_role() to service_role;
grant  execute on function public.is_staff() to service_role;
grant  execute on function public.is_admin() to service_role;
grant  execute on function public.is_partner() to service_role;
grant  execute on function public.owns_package(uuid) to service_role;
grant  execute on function public.next_booking_reference() to service_role;
grant  execute on function public.touch_updated_at() to service_role;

-- ===========================================================================
-- After running this:
--   1. Set the registration number and statutory notice:
--      update public.platform_settings
--         set company_name = 'Empiria World Inc.',
--             registration_number = '<TICO number>',
--             statutory_notice = '<wording supplied by Empiria>';
--   2. Grant yourself admin:
--      update public.users set role = 'admin' where email = 'you@empiria.com';
--   3. Confirm RLS is on everywhere:
--      select tablename, rowsecurity from pg_tables
--       where schemaname = 'public' order by 1;
-- ===========================================================================
