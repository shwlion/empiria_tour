-- ===========================================================================
-- 0009_staff_roles.sql
--
-- B6: staff invitation, role assignment, and deactivation.
--
-- Until this existed, the only way to make somebody an administrator was a
-- hand-written UPDATE, which meant the developer was a permanent dependency of
-- the client's own console. It also meant nothing stopped the last
-- administrator being demoted, and nobody would find out until they tried to
-- sign in.
--
-- Four rules, all enforced here rather than in a form, because a form is one
-- of several ways to reach this table:
--
--   1. NOBODY CHANGES THEIR OWN ROLE OR CLOSES THEIR OWN ACCOUNT. The
--      accidental self-demotion is the classic way an admin console loses its
--      last admin, and the person who did it is the one who can no longer fix
--      it.
--
--   2. AN ACTIVE ADMINISTRATOR MUST ALWAYS REMAIN. Checked *after* the write
--      inside the same transaction, so a change that would empty the role
--      simply never happened. This is deliberately not a check on the row
--      being edited — it is a check on the state of the platform afterwards,
--      which is the thing that actually matters.
--
--   3. 'partner' IS NOT GRANTABLE HERE. There is exactly one route to becoming
--      a partner and it runs through approve_partner_application, so every
--      partner has an application behind them. A second door would make that
--      untrue quietly.
--
--   4. A PARTNER HOLDING PACKAGES CANNOT BE DEMOTED. Their packages would point
--      at somebody who can no longer reach them, and the storefront would carry
--      on selling those tours with nobody able to edit or withdraw them.
--
-- The bootstrap remains manual, and should: the very first administrator is
-- made with an UPDATE, because any in-app way to claim the first admin role is
-- a way for somebody else to claim it.
-- ===========================================================================

create or replace function public.set_user_role(
  p_user uuid, p_role text, p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text;
  v_owned int;
begin
  if p_user = p_actor then
    raise exception 'You cannot change your own role. Ask another administrator.'
      using errcode = '23514';
  end if;

  if p_role not in ('admin', 'agent', 'traveller') then
    raise exception 'A role can be set to admin, agent or traveller here. Partners are approved from an application.'
      using errcode = '23514';
  end if;

  select role into v_role from public.users where id = p_user for update;
  if v_role is null then
    raise exception 'That account no longer exists' using errcode = '23503';
  end if;

  if v_role = 'partner' then
    select count(*) into v_owned from public.packages where partner_id = p_user;
    if v_owned > 0 then
      raise exception 'That partner owns % package(s). Move or archive them before changing the role.', v_owned
        using errcode = '23514';
    end if;
  end if;

  update public.users set role = p_role where id = p_user;

  if not exists (
    select 1 from public.users where role = 'admin' and status = 'active'
  ) then
    raise exception 'That would leave the platform with no active administrator.'
      using errcode = '23514';
  end if;
end;
$fn$;

create or replace function public.set_user_status(
  p_user uuid, p_status text, p_actor uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_user = p_actor then
    raise exception 'You cannot close your own account from here.' using errcode = '23514';
  end if;
  if p_status not in ('active', 'closed') then
    raise exception 'An account is either active or closed' using errcode = '23514';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'That account no longer exists' using errcode = '23503';
  end if;

  update public.users
     set status = p_status,
         closed_at = case when p_status = 'closed' then now() else null end
   where id = p_user;

  if not exists (
    select 1 from public.users where role = 'admin' and status = 'active'
  ) then
    raise exception 'That would leave the platform with no active administrator.'
      using errcode = '23514';
  end if;
end;
$fn$;

revoke all on function public.set_user_role(uuid, text, uuid)   from public;
revoke all on function public.set_user_status(uuid, text, uuid) from public;
grant execute on function public.set_user_role(uuid, text, uuid)   to service_role;
grant execute on function public.set_user_status(uuid, text, uuid) to service_role;
