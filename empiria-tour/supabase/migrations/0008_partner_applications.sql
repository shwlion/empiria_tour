-- ===========================================================================
-- 0008_partner_applications.sql
--
-- How somebody becomes a partner.
--
-- Not by choosing it. §2.2 makes Empiria the seller of record on its own TICO
-- registration, and a partner sets prices on packages Empiria then sells under
-- that registration. Someone self-electing as a supplier and publishing a
-- sellable package would mean Empiria selling travel from a business nobody
-- checked. So the shape here is the one every regulated marketplace converges
-- on: anyone may apply, and a human decides.
--
-- Three properties, proved against the live database before this landed:
--
--   1. AN APPLICATION IS NEVER A ROLE. `submit_partner_application` writes a
--      row and touches `users` not at all. `approve_partner_application` is the
--      only code path in the entire system that sets role = 'partner'.
--
--   2. A DECISION HAPPENS ONCE. Both review functions take `for update` and
--      refuse an application that is not pending, so a double-clicked Approve
--      cannot run twice and an approval cannot later be rejected.
--
--   3. STAFF CANNOT BE DEMOTED INTO A PARTNER. An admin has no partner_id to
--      scope on, so making one a partner would lock them out of their own
--      console while looking like a successful action.
--
-- Nothing here tells an applicant whether their email already has an account.
-- That would be an account-enumeration oracle on a public form. The conflict is
-- shown to the reviewer instead, who is the person who can actually act on it.
-- ===========================================================================

do $mig$ begin
  create type public.application_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $mig$;

create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website text,
  country text,
  operating_regions text,
  tour_types text,
  departures_per_year int,
  message text,
  status public.application_status not null default 'pending',
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  approved_user_id uuid references public.users (id) on delete set null,
  submitted_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A decided application has a decision date, and a pending one does not.
  constraint partner_applications_reviewed_together
    check ((status = 'pending') = (reviewed_at is null)),
  -- An approval that granted nothing to nobody is a bug, not a state.
  constraint partner_applications_approved_has_user
    check (status <> 'approved' or approved_user_id is not null)
);

-- One open application per business. A decided one does not block a later
-- re-application, which is the behaviour somebody who fixed their paperwork
-- expects.
create unique index if not exists partner_applications_one_pending_idx
  on public.partner_applications (lower(email)) where status = 'pending';

create index if not exists partner_applications_queue_idx
  on public.partner_applications (created_at desc) where status = 'pending';

comment on table public.partner_applications is
  'Someone asking to sell tours through Empiria. Never carries a role: approval is a separate, deliberate act by an administrator.';

alter table public.partner_applications enable row level security;
-- No policy at all, deliberately. An applicant has no account yet, so there is
-- nobody for a self-read policy to describe; and staff read through the
-- service-role client as everywhere else in Part B.

create or replace function public.submit_partner_application(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(trim(p_payload->>'email'), ''));
  v_company text := nullif(trim(p_payload->>'company_name'), '');
  v_contact text := nullif(trim(p_payload->>'contact_name'), '');
  v_id uuid;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A usable email address is required' using errcode = '22004';
  end if;
  if v_company is null then
    raise exception 'A company name is required' using errcode = '22004';
  end if;
  if v_contact is null then
    raise exception 'A contact name is required' using errcode = '22004';
  end if;

  insert into public.partner_applications (
    company_name, contact_name, email, phone, website, country,
    operating_regions, tour_types, departures_per_year, message, submitted_ip
  ) values (
    v_company, v_contact, v_email,
    nullif(trim(p_payload->>'phone'), ''),
    nullif(trim(p_payload->>'website'), ''),
    nullif(trim(p_payload->>'country'), ''),
    nullif(trim(p_payload->>'operating_regions'), ''),
    nullif(trim(p_payload->>'tour_types'), ''),
    nullif(p_payload->>'departures_per_year', '')::int,
    nullif(trim(p_payload->>'message'), ''),
    nullif(trim(p_payload->>'submitted_ip'), '')
  )
  -- A second application while one is pending is almost always somebody
  -- pressing submit twice. Return the one already on file rather than making
  -- them look at an error for being keen.
  on conflict (lower(email)) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.partner_applications
     where lower(email) = v_email and status = 'pending' limit 1;
  end if;

  return v_id;
end;
$fn$;

create or replace function public.approve_partner_application(
  p_application uuid, p_user uuid, p_reviewer uuid, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_app public.partner_applications;
  v_role text;
begin
  select * into v_app from public.partner_applications
   where id = p_application for update;
  if v_app is null then
    raise exception 'That application no longer exists' using errcode = '23503';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'That application was already %', v_app.status using errcode = '23505';
  end if;

  select role into v_role from public.users where id = p_user for update;
  if v_role is null then
    raise exception 'That account no longer exists' using errcode = '23503';
  end if;
  if v_role in ('admin', 'agent') then
    raise exception 'That account belongs to Empiria staff and cannot be made a partner'
      using errcode = '23514';
  end if;

  -- The one place in the system that grants this.
  update public.users set role = 'partner' where id = p_user;

  update public.partner_applications
     set status = 'approved',
         approved_user_id = p_user,
         reviewed_by = p_reviewer,
         reviewed_at = now(),
         review_note = p_note,
         updated_at = now()
   where id = p_application;
end;
$fn$;

create or replace function public.reject_partner_application(
  p_application uuid, p_reviewer uuid, p_note text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status public.application_status;
begin
  select status into v_status from public.partner_applications
   where id = p_application for update;
  if v_status is null then
    raise exception 'That application no longer exists' using errcode = '23503';
  end if;
  if v_status <> 'pending' then
    raise exception 'That application was already %', v_status using errcode = '23505';
  end if;

  update public.partner_applications
     set status = 'rejected',
         reviewed_by = p_reviewer,
         reviewed_at = now(),
         review_note = p_note,
         updated_at = now()
   where id = p_application;
end;
$fn$;

-- Three more templates. These are NOT part of Exhibit A's thirteen — partner
-- onboarding sits outside the specification entirely, alongside the partner
-- dashboard, pending a change order under §1.4.
insert into public.email_templates (key, name, subject, body_html, body_text, is_active)
values
  ('partner_application_received', 'Partner application received', '', '', null, true),
  ('partner_application_approved', 'Partner application approved', '', '', null, true),
  ('partner_application_declined', 'Partner application declined', '', '', null, true)
on conflict (key) do nothing;

revoke all on function public.submit_partner_application(jsonb)                from public;
revoke all on function public.approve_partner_application(uuid,uuid,uuid,text) from public;
revoke all on function public.reject_partner_application(uuid,uuid,text)       from public;

grant execute on function public.submit_partner_application(jsonb)                to service_role;
grant execute on function public.approve_partner_application(uuid,uuid,uuid,text) to service_role;
grant execute on function public.reject_partner_application(uuid,uuid,text)       to service_role;
