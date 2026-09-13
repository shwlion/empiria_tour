-- 0018 — B4's customer directory, B6's destination moves, B6's receipt wording
--
-- Three small things in one file because none of them is a table of its own:
-- a view over rows that already exist, one function that keeps a tree
-- consistent, and three nullable columns on the settings singleton. The
-- number was freed when the client accepted the live Events section as A2's
-- placement (no `ad_placements` table).

-- ── B4: who the customers are ───────────────────────────────────────────────
-- Exhibit A B4: "customer list with search; customer record with contact
-- details, booking history, lifetime value, communication preferences".
--
-- A customer is anybody who has booked, plus anybody who registered as a
-- traveller and has not booked yet. Bookings are open to guests, so the key
-- is the account when there is one and the lead email when there is not — and
-- a guest booking made under an address that later registers is attached to
-- that account, so a returning traveller is one record and not two. Lifetime
-- value is money actually received, in the default currency at each
-- booking's frozen rate (0003), never the value of bookings that were never
-- paid for.
--
-- security_invoker: the view runs as whoever queries it, so it grants nothing
-- the base tables would not. It is also revoked from the browser roles
-- outright: it is a staff directory, and the console reads it as service_role.
create or replace view public.customer_directory
with (security_invoker = true) as
with owned as (
  select b.user_id, b.lead_name, b.lead_email, b.lead_phone, b.created_at, b.status,
         b.amount_paid_cents, b.fx_rate_to_base,
         coalesce(b.user_id, u.id) as owner_id
  from public.bookings b
  left join public.users u
    on b.user_id is null and u.role = 'traveller' and u.email is not null
   and lower(u.email) = lower(b.lead_email)
),
agg as (
  select case when owner_id is not null then owner_id::text else 'guest:' || lower(lead_email) end as customer_key,
         owner_id as user_id,
         count(*)::int as bookings_count,
         coalesce(sum(round(amount_paid_cents * coalesce(fx_rate_to_base, 1))), 0)::bigint as lifetime_paid_base_cents,
         min(created_at) as first_booked_at,
         max(created_at) as last_booked_at,
         (array_agg(lead_name  order by created_at desc))[1] as latest_name,
         (array_agg(lead_email order by created_at desc))[1] as latest_email,
         (array_agg(lead_phone order by created_at desc) filter (where lead_phone is not null))[1] as latest_phone
  from owned
  group by 1, 2
),
travellers as (
  select id, email, full_name, phone, marketing_opt_in, status, created_at
  from public.users
  where role = 'traveller'
)
select coalesce(a.customer_key, t.id::text)        as customer_key,
       coalesce(a.user_id, t.id)                   as user_id,
       (t.id is not null)                          as registered,
       coalesce(t.full_name, a.latest_name)        as name,
       coalesce(t.email, a.latest_email)           as email,
       coalesce(t.phone, a.latest_phone)           as phone,
       coalesce(t.marketing_opt_in, false)         as marketing_opt_in,
       t.status                                    as account_status,
       coalesce(a.bookings_count, 0)               as bookings_count,
       coalesce(a.lifetime_paid_base_cents, 0)     as lifetime_paid_base_cents,
       a.first_booked_at,
       a.last_booked_at,
       coalesce(a.first_booked_at, t.created_at)   as since
from agg a
full outer join travellers t on t.id = a.user_id;

comment on view public.customer_directory is
  'B4: one row per customer — every account with the traveller role, plus every guest who booked, keyed on the account when there is one and the lead email when there is not. Lifetime value is money received, in the default currency.';

revoke all on public.customer_directory from public, anon, authenticated;
grant select on public.customer_directory to service_role;

-- ── B6: moving a destination without breaking its children ──────────────────
-- `destinations.path` is the materialised ancestry ('greece/cyclades/santorini')
-- the storefront filters on, and nothing maintained it: 0002 left it to the
-- application. Renaming a slug or re-parenting a place must rewrite every
-- descendant's path in the same statement, or a filter link that worked
-- yesterday lands on nothing today. So the console calls this rather than
-- updating the columns itself.
create or replace function public.move_destination(p_id uuid, p_parent uuid, p_slug text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old_path    text;
  v_parent_path text;
  v_new_path    text;
begin
  select path into v_old_path from public.destinations where id = p_id;
  if v_old_path is null then
    raise exception 'That destination no longer exists.' using errcode = 'P0002';
  end if;
  if p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'A web address is lowercase letters, digits and single hyphens.' using errcode = '23514';
  end if;

  if p_parent is null then
    v_new_path := p_slug;
  else
    if p_parent = p_id then
      raise exception 'A destination cannot sit inside itself.' using errcode = '23514';
    end if;
    select path into v_parent_path from public.destinations where id = p_parent;
    if v_parent_path is null then
      raise exception 'That parent destination no longer exists.' using errcode = '23503';
    end if;
    if v_parent_path like v_old_path || '/%' then
      raise exception 'A destination cannot be moved inside one of its own places.' using errcode = '23514';
    end if;
    v_new_path := v_parent_path || '/' || p_slug;
  end if;

  update public.destinations
     set parent_id = p_parent, slug = p_slug, path = v_new_path
   where id = p_id;

  if v_new_path <> v_old_path then
    update public.destinations
       set path = v_new_path || substr(path, length(v_old_path) + 1)
     where path like v_old_path || '/%';
  end if;
end;
$fn$;

revoke all on function public.move_destination(uuid, uuid, text) from public;
revoke execute on function public.move_destination(uuid, uuid, text) from anon, authenticated;
grant execute on function public.move_destination(uuid, uuid, text) to service_role;

comment on function public.move_destination(uuid, uuid, text) is
  'B6: set a destination''s parent and slug and rewrite every descendant''s path in the same statement. Refuses a cycle.';

-- ── B6: receipt wording ─────────────────────────────────────────────────────
-- "Receipt and document template configuration." The receipt is rendered from
-- immutable facts (docs/RECEIPTS.md); what Empiria can configure is the
-- wording around them: the document's own title, a line under the masthead,
-- and a closing note above the statutory notice. Legal wording still goes
-- through disclosure blocks placed on the receipt — this is copy, not Part D.
alter table public.platform_settings
  add column if not exists receipt_title  text,
  add column if not exists receipt_intro  text,
  add column if not exists receipt_footer text;

comment on column public.platform_settings.receipt_title is
  'B6: the word in the receipt''s masthead. Null renders "Receipt".';
comment on column public.platform_settings.receipt_intro is
  'B6: a line under the receipt''s masthead — a thank-you, or where to write with questions.';
comment on column public.platform_settings.receipt_footer is
  'B6: a closing paragraph above the statutory notice — how to pay a balance, what to bring.';

-- ── Proof ───────────────────────────────────────────────────────────────────
do $$
declare
  v_a uuid; v_b uuid; v_c uuid;
  v_path text;
  v_n int;
  v_bookings int;
  v_travellers int;
begin
  -- The directory: every booking is counted exactly once, every traveller
  -- account appears exactly once, and nothing is invented.
  select coalesce(sum(bookings_count), 0) into v_n from public.customer_directory;
  select count(*) into v_bookings from public.bookings;
  if v_n <> v_bookings then
    raise exception 'HARNESS: the directory counts % bookings, the table has %', v_n, v_bookings;
  end if;
  select count(*) into v_n from public.customer_directory where registered;
  select count(*) into v_travellers from public.users where role = 'traveller';
  if v_n <> v_travellers then
    raise exception 'HARNESS: the directory lists % accounts, there are %', v_n, v_travellers;
  end if;
  select count(*) into v_n from public.customer_directory group by customer_key having count(*) > 1 limit 1;
  if found then
    raise exception 'HARNESS: a customer key appears twice';
  end if;

  -- Moving a destination carries its children along.
  insert into public.destinations (slug, name, path) values ('hx-greece', 'HX Greece', 'hx-greece') returning id into v_a;
  insert into public.destinations (parent_id, slug, name, path) values (v_a, 'hx-cyclades', 'HX Cyclades', 'hx-greece/hx-cyclades') returning id into v_b;
  insert into public.destinations (parent_id, slug, name, path) values (v_b, 'hx-santorini', 'HX Santorini', 'hx-greece/hx-cyclades/hx-santorini') returning id into v_c;

  perform public.move_destination(v_b, v_a, 'hx-isles');
  select path into v_path from public.destinations where id = v_c;
  if v_path <> 'hx-greece/hx-isles/hx-santorini' then
    raise exception 'HARNESS: a renamed slug left a child at %', v_path;
  end if;

  perform public.move_destination(v_b, null, 'hx-isles');
  select path into v_path from public.destinations where id = v_c;
  if v_path <> 'hx-isles/hx-santorini' then
    raise exception 'HARNESS: re-parenting to the root left a child at %', v_path;
  end if;

  begin
    perform public.move_destination(v_b, v_c, 'hx-isles');
    raise exception 'HARNESS: a destination was moved inside its own child' using errcode = 'P0001';
  exception
    when check_violation then null;
  end;
  begin
    perform public.move_destination(v_a, null, 'Not A Slug');
    raise exception 'HARNESS: a bad slug was accepted' using errcode = 'P0001';
  exception
    when check_violation then null;
  end;

  delete from public.destinations where id in (v_c, v_b, v_a);
  select count(*) into v_n from public.destinations where slug like 'hx-%';
  if v_n <> 0 then
    raise exception 'HARNESS: cleanup left % destinations', v_n;
  end if;
end $$;
