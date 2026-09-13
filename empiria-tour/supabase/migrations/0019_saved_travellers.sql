-- 0019 — A8: saved traveller profiles
--
-- Exhibit A A8: "Profile: name, email, phone, address, saved traveller
-- profiles" and "Saved traveller profiles pre-fill the booking flow".
--
-- A saved traveller is the part of a booking's traveller row that is about
-- the person rather than the trip: the name on their ID, their date of birth,
-- and the two notes that follow them from trip to trip. Nothing about a seat,
-- a room or a price. The booking's own `travellers` rows stay a snapshot —
-- editing a profile here changes the next booking, never a past one, which is
-- the same rule the account page already states for the profile itself.
--
-- Ownership is by `user_id`, and the traveller reaches the table only through
-- their own session: row-level security below, and the storefront's account
-- actions write through the user's client rather than the service role, so
-- the policies are the thing that decides. The booking flow's "save these
-- travellers" runs under the service role after `create_booking` with the
-- server's own idea of who is signed in — never an id from the client.
--
-- One row per person per account: UNIQUE NULLS NOT DISTINCT on (user, name,
-- birthday), so two "Ana Reyes" with no birthday given are the same row and
-- the flow's save is an upsert rather than a pile of duplicates. Twenty per
-- account, enforced by a trigger and not by the application, because the
-- application is not the only writer.
--
-- Closure (0010) erases these along with the profile: they are the traveller's
-- own list, not a record of a sale, so nothing in §2.2 asks for them to stay.

create table if not exists public.saved_travellers (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  legal_name          text not null,
  date_of_birth       date,
  dietary_notes       text,
  accessibility_notes text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint saved_travellers_name_length
    check (char_length(legal_name) between 1 and 200),
  constraint saved_travellers_notes_length
    check (coalesce(char_length(dietary_notes), 0) <= 500
       and coalesce(char_length(accessibility_notes), 0) <= 500),
  constraint saved_travellers_dob_plausible
    check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  constraint saved_travellers_one_per_person
    unique nulls not distinct (user_id, legal_name, date_of_birth)
);

comment on table public.saved_travellers is
  'A8: the people a traveller books for, kept on their account to pre-fill the next booking. Not a record of any sale.';

-- ── The cap ─────────────────────────────────────────────────────────────────
create or replace function public.cap_saved_travellers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if (select count(*) from public.saved_travellers where user_id = new.user_id) >= 20 then
    raise exception 'An account can keep at most 20 saved travellers' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

drop trigger if exists cap_saved_travellers on public.saved_travellers;
create trigger cap_saved_travellers
  before insert on public.saved_travellers
  for each row execute function public.cap_saved_travellers();

drop trigger if exists touch_saved_travellers on public.saved_travellers;
create trigger touch_saved_travellers
  before update on public.saved_travellers
  for each row execute function public.touch_updated_at();

revoke execute on function public.cap_saved_travellers() from public, anon, authenticated;
grant  execute on function public.cap_saved_travellers() to service_role;

-- ── Who may touch it ────────────────────────────────────────────────────────
alter table public.saved_travellers enable row level security;

revoke all on public.saved_travellers from anon;
grant select, insert, update, delete on public.saved_travellers to authenticated;
grant all on public.saved_travellers to service_role;

drop policy if exists "read own saved travellers" on public.saved_travellers;
create policy "read own saved travellers" on public.saved_travellers
  for select using ((select auth.uid()) = user_id);

drop policy if exists "add own saved travellers" on public.saved_travellers;
create policy "add own saved travellers" on public.saved_travellers
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "edit own saved travellers" on public.saved_travellers;
create policy "edit own saved travellers" on public.saved_travellers
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "remove own saved travellers" on public.saved_travellers;
create policy "remove own saved travellers" on public.saved_travellers
  for delete using ((select auth.uid()) = user_id);

-- ── Closure erases them ─────────────────────────────────────────────────────
-- 0010's function, restated with one more line: the saved travellers go with
-- the profile. Everything else is unchanged, including the refusal to close
-- the last active administrator.
create or replace function public.close_own_account(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  if p_user is null then
    raise exception 'No account was given to close.' using errcode = '22004';
  end if;

  select status into v_status from public.users where id = p_user;

  if v_status is null then
    raise exception 'That account no longer exists.' using errcode = '23503';
  end if;

  -- Idempotent: closing a closed account is a no-op rather than an error, so a
  -- double submit or a retried request cannot produce a failure for something
  -- that has already happened.
  if v_status = 'closed' then
    return;
  end if;

  -- The traveller's own list of people, not a record of any sale: erased.
  delete from public.saved_travellers where user_id = p_user;

  update public.users
     set full_name        = null,
         email            = null,
         phone            = null,
         address          = null,
         marketing_opt_in = false,
         status           = 'closed',
         closed_at        = now()
   where id = p_user;

  -- Rule 2 of 0009, restated. Checked on the state of the platform afterwards
  -- rather than on the row being edited, which is the thing that actually
  -- matters.
  if not exists (
    select 1 from public.users where role = 'admin' and status = 'active'
  ) then
    raise exception 'That would leave the platform with no active administrator.'
      using errcode = '23514';
  end if;
end;
$fn$;

revoke all on function public.close_own_account(uuid) from public;
revoke execute on function public.close_own_account(uuid) from anon, authenticated;
grant execute on function public.close_own_account(uuid) to service_role;

comment on function public.close_own_account(uuid) is
  'A8: the traveller''s own closure. Anonymises public.users, erases their saved travellers, and retains every booking, payment and traveller row (Agreement §2.2 — Empiria is merchant of record and the sale is its record to keep).';

-- ── Proof ───────────────────────────────────────────────────────────────────
-- Two throwaway accounts, created and removed inside this block. Everything
-- below raises on failure, which rolls the whole migration back.
do $$
declare
  v_a     uuid := gen_random_uuid();
  v_b     uuid := gen_random_uuid();
  v_count int;
  v_notes text;
  v_msg   text;
  i       int;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
          'harness-a-' || v_a || '@harness.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', v_b, 'authenticated', 'authenticated',
          'harness-b-' || v_b || '@harness.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
  -- handle_new_user normally creates the profile row; make sure of it either way.
  insert into public.users (id, email, role, status)
  values (v_a, 'harness-a@harness.invalid', 'traveller', 'active'),
         (v_b, 'harness-b@harness.invalid', 'traveller', 'active')
  on conflict (id) do nothing;

  -- (a) two people, one of them without a birthday
  insert into public.saved_travellers (user_id, legal_name, date_of_birth, dietary_notes)
  values (v_a, 'Ana Reyes', null, 'vegetarian'),
         (v_a, 'Tomas Reyes', date '1984-03-09', null);
  insert into public.saved_travellers (user_id, legal_name) values (v_b, 'Somebody Else');
  select count(*) into v_count from public.saved_travellers where user_id = v_a;
  if v_count <> 2 then raise exception 'HARNESS: expected 2 saved travellers, found %', v_count; end if;

  -- (b) the same person twice is one row, even with no birthday to tell them apart
  begin
    insert into public.saved_travellers (user_id, legal_name, date_of_birth) values (v_a, 'Ana Reyes', null);
    raise exception 'HARNESS: a duplicate with a null birthday was accepted' using errcode = 'P0001';
  exception
    when unique_violation then null;
  end;

  -- (c) …which is what makes the booking flow's save an upsert
  insert into public.saved_travellers (user_id, legal_name, date_of_birth, dietary_notes)
  values (v_a, 'Ana Reyes', null, 'vegan')
  on conflict (user_id, legal_name, date_of_birth)
  do update set dietary_notes = excluded.dietary_notes;
  select count(*), max(dietary_notes) filter (where legal_name = 'Ana Reyes')
    into v_count, v_notes from public.saved_travellers where user_id = v_a;
  if v_count <> 2 or v_notes <> 'vegan' then
    raise exception 'HARNESS: upsert produced % rows and notes %', v_count, v_notes;
  end if;

  -- (d) the cap: 20 is allowed, 21 is not
  for i in 3..20 loop
    insert into public.saved_travellers (user_id, legal_name) values (v_a, 'Traveller ' || i);
  end loop;
  begin
    insert into public.saved_travellers (user_id, legal_name) values (v_a, 'One too many');
    raise exception 'HARNESS: the 21st saved traveller was accepted' using errcode = 'P0001';
  exception
    when check_violation then null;
  end;

  -- (e) row-level security, as the signed-in traveller A
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', json_build_object('sub', v_a, 'role', 'authenticated')::text);

  select count(*) into v_count from public.saved_travellers;
  if v_count <> 20 then raise exception 'HARNESS: A sees % rows, expected only their own 20', v_count; end if;

  begin
    insert into public.saved_travellers (user_id, legal_name) values (v_b, 'Planted');
    raise exception 'HARNESS: A could add a traveller to B''s account' using errcode = 'P0001';
  exception
    when insufficient_privilege then null;
  end;

  update public.saved_travellers set legal_name = 'Renamed' where user_id = v_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'HARNESS: A could edit B''s traveller'; end if;

  delete from public.saved_travellers where user_id = v_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'HARNESS: A could remove B''s traveller'; end if;

  -- A may edit and remove their own
  update public.saved_travellers set dietary_notes = 'none' where user_id = v_a and legal_name = 'Traveller 20';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'HARNESS: A could not edit their own traveller'; end if;
  delete from public.saved_travellers where user_id = v_a and legal_name = 'Traveller 20';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'HARNESS: A could not remove their own traveller'; end if;

  -- and the function is out of reach from a browser session
  begin
    perform public.close_own_account(v_a);
    raise exception 'HARNESS: close_own_account is callable as authenticated' using errcode = 'P0001';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';

  -- (f) closure erases A's list and leaves B's alone
  perform public.close_own_account(v_a);
  select count(*) into v_count from public.saved_travellers where user_id = v_a;
  if v_count <> 0 then raise exception 'HARNESS: closure left % saved travellers behind', v_count; end if;
  select count(*) into v_count from public.saved_travellers where user_id = v_b;
  if v_count <> 1 then raise exception 'HARNESS: closure touched another account''s list'; end if;
  select status into v_msg from public.users where id = v_a;
  if v_msg <> 'closed' then raise exception 'HARNESS: closure did not close the account'; end if;

  -- (g) leave nothing behind: the auth rows cascade through users and saved_travellers
  delete from auth.users where id in (v_a, v_b);
  select count(*) into v_count from public.saved_travellers where user_id in (v_a, v_b);
  if v_count <> 0 then raise exception 'HARNESS: cleanup left % rows', v_count; end if;
  select count(*) into v_count from public.users where id in (v_a, v_b);
  if v_count <> 0 then raise exception 'HARNESS: cleanup left % profile rows', v_count; end if;
end $$;
