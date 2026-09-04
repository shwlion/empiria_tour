-- 0011 — close the RPCs anon could call, and two performance findings.
--
-- Ten SECURITY DEFINER functions were executable by `anon`, which on a Supabase
-- project means executable by anybody at all: the anon key is compiled into the
-- browser bundle by design, and PostgREST exposes every function in `public` at
-- /rest/v1/rpc/<name>.
--
-- The worst of them is `set_user_role`. Its only actor check is
-- `p_user = p_actor`, which stops you changing your own role and never asks
-- whether the caller is staff — authorisation lives in the admin console, which
-- is sound as long as the console is the only caller. It was not. Sign up, then
-- call the endpoint with your own id, 'admin', and any other uuid as p_actor,
-- and you are an administrator. That is exactly the door CLAUDE.md says must not
-- exist: "any in-app way to claim that role is a way for somebody else to claim
-- it."
--
-- `enqueue_email` is the other one worth naming: open to anon, it is a spam
-- relay sending from Empiria's verified domain the moment Resend DNS lands.
--
-- Nothing legitimate loses access. Every caller of all ten, across all three
-- repos, is a server action or route using `getSupabaseAdmin()` — the service
-- role, which is unaffected by a revoke from public/anon/authenticated.
--
-- Revoking from `public` as well as the two roles is the point rather than
-- belt-and-braces: Postgres grants EXECUTE to PUBLIC on every new function, so
-- revoking only anon and authenticated leaves that default grant intact and the
-- function still reachable. Eighteen other functions in this schema already
-- follow that rule; these ten were the ones that missed it.

-- ─── 1. The ten functions anon could execute ────────────────────────────────

revoke execute on function public.set_user_role(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.set_user_status(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.approve_partner_application(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.reject_partner_application(uuid, uuid, text)
  from public, anon, authenticated;
-- Public form, but it reaches this through a server action holding the service
-- role — `app/partners/actions.ts` uses getSupabaseAdmin(). Anon never calls it
-- directly, and an unauthenticated writer into partner_applications is a spam
-- queue for whoever reviews them.
revoke execute on function public.submit_partner_application(jsonb)
  from public, anon, authenticated;

revoke execute on function public.enqueue_email(jsonb)
  from public, anon, authenticated;
revoke execute on function public.enqueue_due_reminders()
  from public, anon, authenticated;
revoke execute on function public.claim_email_batch(integer)
  from public, anon, authenticated;
revoke execute on function public.mark_email_sent(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.mark_email_failed(uuid, text, integer)
  from public, anon, authenticated;

-- `departure_seats_available(departures)` is deliberately left alone: it is
-- SECURITY INVOKER and read-only, and PostgREST needs it callable to expose the
-- computed column the catalogue reads.

-- ─── 2. The RLS policy that re-planned auth.uid() per row ───────────────────
--
-- `auth.uid()` bare in a policy is re-evaluated for every candidate row.
-- Wrapped in a scalar subquery it is evaluated once and treated as a constant
-- by the planner. Same rows, same access; it is a planning change, not a
-- permission change.

drop policy if exists email_messages_own_read on public.email_messages;

create policy email_messages_own_read on public.email_messages
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or booking_id in (
      select id from public.bookings where user_id = (select auth.uid())
    )
  );

-- ─── 3. Foreign keys without a covering index ───────────────────────────────
--
-- Fourteen of them. An unindexed FK makes the referenced side's deletes and
-- updates scan the referencing table, and makes the obvious joins seq-scan.
-- Cheap now while every table is small; awkward to notice later, because the
-- symptom is a slow console page rather than an error.

create index if not exists bookack_block_idx
  on public.booking_acknowledgements (block_id);
create index if not exists bookings_cancelled_by_idx
  on public.bookings (cancelled_by);
create index if not exists bookings_room_type_idx
  on public.bookings (room_type_id);
create index if not exists disclosure_blocks_updated_by_idx
  on public.disclosure_blocks (updated_by);
create index if not exists email_messages_departure_idx
  on public.email_messages (departure_id);
create index if not exists email_messages_template_idx
  on public.email_messages (template_key);
create index if not exists email_messages_user_idx
  on public.email_messages (user_id);
create index if not exists packages_cancellation_policy_idx
  on public.packages (cancellation_policy_id);
create index if not exists packages_created_by_idx
  on public.packages (created_by);
create index if not exists partner_apps_approved_user_idx
  on public.partner_applications (approved_user_id);
create index if not exists partner_apps_reviewed_by_idx
  on public.partner_applications (reviewed_by);
create index if not exists payments_recorded_by_idx
  on public.payments (recorded_by);
create index if not exists platform_settings_updated_by_idx
  on public.platform_settings (updated_by);
create index if not exists static_pages_updated_by_idx
  on public.static_pages (updated_by);

-- Deliberately NOT dropping the ~20 indexes the linter calls unused. There are
-- zero bookings in this database, so every index on bookings, payments and
-- booking_holds is unused by definition. "Never been scanned" is a statement
-- about the traffic, not about the index.

-- ─── 4. Prove it, or none of it happened ────────────────────────────────────

do $$
declare
  v_locked text[] := array[
    'set_user_role', 'set_user_status',
    'approve_partner_application', 'reject_partner_application',
    'submit_partner_application',
    'enqueue_email', 'enqueue_due_reminders', 'claim_email_batch',
    'mark_email_sent', 'mark_email_failed'
  ];
  v_bad int;
  v_names text;
begin
  -- (a) None of the ten is reachable by anon or authenticated any more.
  select count(*), coalesce(string_agg(distinct p.proname, ', '), '')
    into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any(v_locked)
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_bad > 0 then
    raise exception '0011: % function(s) still reachable by anon/authenticated: %',
      v_bad, v_names;
  end if;

  -- (b) …and the service role still is, or every server action breaks.
  select count(*), coalesce(string_agg(distinct p.proname, ', '), '')
    into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any(v_locked)
     and not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_bad > 0 then
    raise exception '0011: % function(s) no longer reachable by service_role: %',
      v_bad, v_names;
  end if;

  -- (c) All ten still exist. A typo'd signature above would revoke nothing and
  --     silently pass (a), so assert the count we expect to have touched.
  select count(distinct p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any(v_locked);
  if v_bad <> array_length(v_locked, 1) then
    raise exception '0011: expected % of the named functions, found %',
      array_length(v_locked, 1), v_bad;
  end if;

  -- (d) Every foreign key in the schema now has a covering index.
  select count(*) into v_bad
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   where c.contype = 'f' and n.nspname = 'public'
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::smallint[])[0:array_length(c.conkey, 1) - 1] = c.conkey
     );
  if v_bad > 0 then
    raise exception '0011: % foreign key(s) still without a covering index', v_bad;
  end if;

  -- (e) The policy still exists, still restricts to the owner, and no longer
  --     calls auth.uid() per row.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'email_messages'
       and policyname = 'email_messages_own_read'
  ) then
    raise exception '0011: email_messages_own_read is missing — the table would be unreadable';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'email_messages'
       and policyname = 'email_messages_own_read'
       and lower(qual) like '%select auth.uid()%'
       and lower(qual) like '%user_id%'
  ) then
    raise exception '0011: email_messages_own_read is not the wrapped owner-only policy';
  end if;

  raise notice '0011: all assertions passed — 10 functions locked, 14 indexes, 1 policy rewritten';
end $$;
