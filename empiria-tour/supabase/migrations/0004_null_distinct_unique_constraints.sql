-- ===========================================================================
-- Empiria Tours — fix three unique constraints that don't constrain
-- ===========================================================================
-- Postgres treats NULLs as distinct in a unique constraint by default, so a
-- constraint over a nullable column silently permits duplicates:
--
--     unique (package_id, starts_on, start_time)
--
-- reads like "one departure per package per date", but `start_time` is NULL for
-- every multi-day tour — and NULL <> NULL — so the same departure can be
-- inserted any number of times. Found by running the seed twice: 40 departures
-- became 81.
--
-- Three constraints in this schema have the flaw, all on columns that are NULL
-- in the common case rather than the edge case:
--
--   departures            (package_id, starts_on, start_time)   start_time NULL for multi-day
--   destinations          (parent_id, slug)                     parent_id NULL for countries
--   disclosure_placements (block_id, placement, package_id)     package_id NULL = "all packages"
--
-- NULLS NOT DISTINCT (Postgres 15+) makes them behave as written. Supabase runs
-- Postgres 17, so this is available.
--
-- This migration will FAIL LOUDLY if duplicates already exist. That is
-- deliberate — silently deleting rows from a live catalogue is worse than a
-- failed migration. The check below names the offenders so they can be resolved
-- by hand first.
-- ===========================================================================

do $$
declare
  dup_departures int;
  dup_destinations int;
  dup_placements int;
begin
  select count(*) into dup_departures from (
    select package_id, starts_on, start_time
      from public.departures group by 1,2,3 having count(*) > 1) x;
  select count(*) into dup_destinations from (
    select parent_id, slug
      from public.destinations group by 1,2 having count(*) > 1) x;
  select count(*) into dup_placements from (
    select block_id, placement, package_id
      from public.disclosure_placements group by 1,2,3 having count(*) > 1) x;

  if dup_departures + dup_destinations + dup_placements > 0 then
    raise exception using
      errcode = 'unique_violation',
      message = format(
        'Cannot tighten these constraints: duplicates exist (departures: %s, destinations: %s, placements: %s). Resolve them first — see the queries in this migration.',
        dup_departures, dup_destinations, dup_placements);
  end if;
end $$;

-- ── departures ────────────────────────────────────────────────────────────
alter table public.departures
  drop constraint if exists departures_package_id_starts_on_start_time_key;
alter table public.departures
  drop constraint if exists departures_unique_slot;
alter table public.departures
  add constraint departures_unique_slot
  unique nulls not distinct (package_id, starts_on, start_time);

comment on constraint departures_unique_slot on public.departures is
  'NULLS NOT DISTINCT: start_time is NULL for every multi-day tour, and without this a duplicate departure inserts cleanly.';

-- ── destinations ──────────────────────────────────────────────────────────
alter table public.destinations
  drop constraint if exists destinations_parent_id_slug_key;
alter table public.destinations
  drop constraint if exists destinations_unique_child;
alter table public.destinations
  add constraint destinations_unique_child
  unique nulls not distinct (parent_id, slug);

comment on constraint destinations_unique_child on public.destinations is
  'NULLS NOT DISTINCT: parent_id is NULL for top-level countries, which would otherwise allow two destinations named greece.';

-- ── disclosure_placements ─────────────────────────────────────────────────
alter table public.disclosure_placements
  drop constraint if exists disclosure_placements_block_id_placement_package_id_key;
alter table public.disclosure_placements
  drop constraint if exists disclosure_placements_unique_assignment;
alter table public.disclosure_placements
  add constraint disclosure_placements_unique_assignment
  unique nulls not distinct (block_id, placement, package_id);

comment on constraint disclosure_placements_unique_assignment on public.disclosure_placements is
  'NULLS NOT DISTINCT: package_id NULL means "every package", and that global assignment must be unique per block and placement.';
