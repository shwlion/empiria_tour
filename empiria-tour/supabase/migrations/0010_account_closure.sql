-- ===========================================================================
-- 0010_account_closure.sql
--
-- A8: a traveller closing their own account.
--
-- Migration 0002 wrote the columns and the intent:
--
--   comment on column public.users.status is
--     'A8: account closure anonymises the profile but retains booking records.'
--
-- and nothing has ever performed that transition. `set_user_status` (0009) is
-- the console's function and is the wrong one here twice over: it refuses
-- `p_user = p_actor` on purpose, and it does not anonymise anything — it flips a
-- flag, which is what an administrator deactivating somebody else should do.
--
-- ── Why anonymise the profile but keep the bookings ────────────────────────
--
-- Empiria is the seller and merchant of record on every booking (§2.2), under
-- its own Ontario travel registration. The booking record is therefore not the
-- traveller's to delete: it is the seller's evidence of a sale, and TICO expects
-- it to survive. What *is* the traveller's is the profile — the name, address
-- and phone number they gave the platform to hold on their behalf.
--
-- So this splits them. `public.users` is emptied of identifying fields;
-- `bookings.lead_name`, `bookings.lead_email`, `travellers.legal_name` and the
-- payment rows are untouched. `bookings.user_id` is also untouched, deliberately
-- — orphaning the rows would destroy the very link that makes the retained
-- record meaningful.
--
-- ── Why a function rather than an UPDATE from the application ──────────────
--
-- The `update own profile` policy would in fact permit a signed-in traveller to
-- write every one of these columns themselves. Three reasons it is done here
-- instead:
--
--   1. Anonymising is one operation, not seven, and it must not be possible to
--      half-do it. A client that cleared `full_name` and then lost its
--      connection would leave a phone number behind on a closed account.
--   2. The definition of "anonymised" belongs next to the columns, so a column
--      added to `users` later is a diff away from the thing that clears it.
--   3. Rule 2 of migration 0009 — an active administrator must always remain —
--      applies just as much when an admin closes their own account from the
--      storefront as when another admin closes it from the console. It is
--      checked after the write and inside the transaction, so a closure that
--      would empty the role simply never happened.
--
-- Takes the account as an argument rather than reading `auth.uid()`, matching
-- every other function here: it is called by server code running as
-- `service_role`, which is trusted to pass the session's own user and nobody
-- else's. `authenticated` is not granted EXECUTE, so it is not reachable from a
-- browser.
-- ===========================================================================

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

-- PUBLIC must be revoked explicitly: Postgres grants EXECUTE to PUBLIC by
-- default, and revoking anon/authenticated alone leaves that implicit grant
-- intact — which is what would actually make this callable from a browser.
revoke all on function public.close_own_account(uuid) from public;
revoke execute on function public.close_own_account(uuid) from anon, authenticated;
grant execute on function public.close_own_account(uuid) to service_role;

comment on function public.close_own_account(uuid) is
  'A8: the traveller''s own closure. Anonymises public.users and retains every booking, payment and traveller row (Agreement §2.2 — Empiria is merchant of record and the sale is its record to keep).';
