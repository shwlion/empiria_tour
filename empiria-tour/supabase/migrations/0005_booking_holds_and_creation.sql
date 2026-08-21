-- ===========================================================================
-- 0005_booking_holds_and_creation.sql
--
-- A5, the booking flow. Two things the application layer cannot do safely on
-- its own:
--
--   1. Reserving seats. "Read the count, then write the count" is a race, and
--      the thing being raced over is the last seat on a departure. Every claim
--      here takes a row lock on the departure first, so concurrent travellers
--      serialise instead of both winning.
--
--   2. Creating a booking. It is one booking row plus its price lines,
--      travellers, custom-field answers and acknowledgements — and a booking
--      that exists without the wording its traveller agreed to is worse than no
--      booking at all. supabase-js cannot open a transaction, so the whole
--      write happens inside one function call.
--
-- Pricing is deliberately NOT computed here. It lives in lib/pricing.ts so the
-- same code runs in the browser for instant feedback and on the server as the
-- authority. Duplicating it in PL/pgSQL would create exactly the drift that
-- module exists to prevent — this function persists the numbers, it does not
-- decide them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. SCHEMA ADDITIONS
-- ---------------------------------------------------------------------------

-- A hold outlives step 1: once a booking exists it keeps holding that booking's
-- seats until payment either succeeds or the window closes.
alter table public.booking_holds
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

create index if not exists booking_holds_booking_idx
  on public.booking_holds (booking_id) where booking_id is not null;

comment on column public.booking_holds.booking_id is
  'Set when the hold is carried into a created booking. Until payment resolves, this row is what stops the seats being resold.';

-- Browsing and paying deserve different windows: 20 minutes is generous for
-- filling in a form and mean for finding your card, calling your partner, and
-- coming back.
alter table public.platform_settings
  add column if not exists payment_window_minutes int not null default 60;

do $$
begin
  alter table public.platform_settings
    add constraint platform_settings_payment_window_positive
    check (payment_window_minutes > 0);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. EXPIRY
-- ---------------------------------------------------------------------------

-- Called opportunistically before every availability read and every claim,
-- rather than from a scheduler. A seat that a lapsed hold is still counting is
-- a seat nobody can buy, and the moment that matters is the moment somebody
-- tries.
create or replace function public.expire_stale_holds(p_departure uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_count int := 0;
begin
  for r in
    with expired as (
      update public.booking_holds h
         set released_at = now()
       where h.released_at is null
         and h.expires_at <= now()
         and (p_departure is null or h.departure_id = p_departure)
      returning h.departure_id, h.seats, h.booking_id
    )
    select * from expired
  loop
    update public.departures
       set seats_held = greatest(seats_held - r.seats, 0)
     where id = r.departure_id;

    -- A booking whose hold lapsed is holding nothing. Leaving it as
    -- "pending payment" would misreport both the seat and the sale.
    if r.booking_id is not null then
      update public.bookings
         set status         = 'cancelled',
             cancelled_at   = now(),
             notes_internal = concat_ws(
               E'\n', notes_internal,
               'Auto-cancelled: the payment window closed and the seats were returned to inventory.')
       where id = r.booking_id
         and status = 'pending_payment';
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_stale_holds(uuid) is
  'Releases lapsed holds and returns their seats. Safe to call as often as you like; it only touches rows whose window has already passed.';

-- ---------------------------------------------------------------------------
-- 3. CLAIMING SEATS
-- ---------------------------------------------------------------------------

create or replace function public.claim_seats(
  p_departure uuid,
  p_seats     int,
  p_session   text,
  p_user      uuid default null
)
returns public.booking_holds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep       public.departures;
  v_existing  public.booking_holds;
  v_hold      public.booking_holds;
  v_minutes   int;
  v_delta     int;
  v_available int;
begin
  if p_seats < 1 then
    raise exception 'A hold needs at least one seat' using errcode = '22023';
  end if;
  if coalesce(p_session, '') = '' then
    raise exception 'A hold needs a session token' using errcode = '22023';
  end if;

  perform public.expire_stale_holds(p_departure);

  select coalesce(hold_minutes, 20) into v_minutes from public.platform_settings where id;
  v_minutes := coalesce(v_minutes, 20);

  -- The lock is the whole point of this function. Everything below reads and
  -- writes seat counts, and without it two sessions can each be told the last
  -- seat is theirs.
  select * into v_dep from public.departures where id = p_departure for update;
  if not found then
    raise exception 'That departure no longer exists' using errcode = 'P0002';
  end if;
  if v_dep.status <> 'open' then
    raise exception 'That departure is not open for booking' using errcode = '22023';
  end if;
  if v_dep.sales_open_at is not null and now() < v_dep.sales_open_at then
    raise exception 'Sales for that departure have not opened yet' using errcode = '22023';
  end if;
  if v_dep.sales_close_at is not null and now() > v_dep.sales_close_at then
    raise exception 'Sales for that departure have closed' using errcode = '22023';
  end if;

  -- One live hold per session per departure. Going back to change the party
  -- size adjusts the hold in place; it must not stack a second one on top and
  -- quietly consume twice the inventory.
  select * into v_existing
    from public.booking_holds
   where departure_id  = p_departure
     and session_token = p_session
     and released_at is null
     and expires_at > now()
     and booking_id is null
   order by created_at desc
   limit 1
   for update;

  v_delta     := p_seats - coalesce(v_existing.seats, 0);
  v_available := v_dep.capacity - v_dep.seats_booked - v_dep.seats_held;

  if v_delta > v_available then
    raise exception 'Only % seat(s) left on that departure',
      greatest(v_available + coalesce(v_existing.seats, 0), 0)
      using errcode = '23514';
  end if;

  update public.departures
     set seats_held = seats_held + v_delta
   where id = p_departure;

  if v_existing.id is not null then
    update public.booking_holds
       set seats      = p_seats,
           user_id    = coalesce(p_user, user_id),
           expires_at = now() + make_interval(mins => v_minutes)
     where id = v_existing.id
    returning * into v_hold;
  else
    insert into public.booking_holds (departure_id, user_id, session_token, seats, expires_at)
    values (p_departure, p_user, p_session, p_seats, now() + make_interval(mins => v_minutes))
    returning * into v_hold;
  end if;

  return v_hold;
end;
$$;

comment on function public.claim_seats(uuid, int, text, uuid) is
  'A5 step 1. Atomically reserves seats for a browsing session. Raises rather than overselling.';

-- ---------------------------------------------------------------------------
-- 4. KEEPING, AND GIVING BACK
-- ---------------------------------------------------------------------------

-- Extends a live hold. Scoped by session token so one traveller cannot keep
-- another traveller's seats alive, or their own after abandoning them.
create or replace function public.extend_hold(p_hold uuid, p_session text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minutes int;
  v_expires timestamptz;
begin
  select coalesce(hold_minutes, 20) into v_minutes from public.platform_settings where id;
  v_minutes := coalesce(v_minutes, 20);

  update public.booking_holds
     set expires_at = now() + make_interval(mins => v_minutes)
   where id = p_hold
     and session_token = p_session
     and released_at is null
     and expires_at > now()
  returning expires_at into v_expires;

  return v_expires;   -- null when the hold had already lapsed
end;
$$;

create or replace function public.release_hold(p_hold uuid, p_session text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep   uuid;
  v_seats int;
begin
  update public.booking_holds
     set released_at = now()
   where id = p_hold
     and session_token = p_session
     and released_at is null
  returning departure_id, seats into v_dep, v_seats;

  if v_dep is null then
    return false;
  end if;

  update public.departures
     set seats_held = greatest(seats_held - v_seats, 0)
   where id = v_dep;

  return true;
end;
$$;

-- A6 will call this on a confirmed payment: the seats stop being held and
-- start being booked. Availability is never decremented on anything less than
-- money actually arriving.
create or replace function public.confirm_hold_seats(p_booking uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dep   uuid;
  v_seats int;
begin
  select departure_id, seats into v_dep, v_seats
    from public.booking_holds
   where booking_id = p_booking and released_at is null
   for update;

  if v_dep is null then
    return false;
  end if;

  update public.departures
     set seats_held   = greatest(seats_held - v_seats, 0),
         seats_booked = seats_booked + v_seats
   where id = v_dep;

  update public.booking_holds set released_at = now() where booking_id = p_booking and released_at is null;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. CREATING THE BOOKING
-- ---------------------------------------------------------------------------

create or replace function public.create_booking(p_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold      public.booking_holds;
  v_dep       public.departures;
  v_booking   public.bookings;
  v_minutes   int;
  v_seats_needed int;
  v_traveller jsonb;
  v_line      jsonb;
  v_ack       jsonb;
  v_field     jsonb;
  v_tid       uuid;
  v_position  int;
  v_map       jsonb := '{}'::jsonb;
  v_line_sum  int;
begin
  select coalesce(payment_window_minutes, 60) into v_minutes from public.platform_settings where id;
  v_minutes := coalesce(v_minutes, 60);

  -- Lock the departure before touching the hold, so this orders identically to
  -- claim_seats and the two cannot deadlock against each other.
  select * into v_dep
    from public.departures
   where id = (p_payload->>'departure_id')::uuid
   for update;
  if not found then
    raise exception 'That departure no longer exists' using errcode = 'P0002';
  end if;

  -- Idempotency. People double-click Confirm, and a second booking for the same
  -- party is a far worse outcome than a slow button. If this hold has already
  -- been spent by this same session, hand back what it bought.
  select b.* into v_booking
    from public.booking_holds h
    join public.bookings b on b.id = h.booking_id
   where h.id = (p_payload->>'hold_id')::uuid
     and h.session_token = p_payload->>'session_token';
  if found then
    return v_booking;
  end if;

  select * into v_hold
    from public.booking_holds
   where id = (p_payload->>'hold_id')::uuid
     and session_token = p_payload->>'session_token'
     and departure_id  = v_dep.id
     and released_at is null
     and booking_id is null
   for update;

  if not found then
    raise exception 'Your seats are no longer held — the window closed while you were filling this in'
      using errcode = '23514';
  end if;
  if v_hold.expires_at <= now() then
    raise exception 'Your seats are no longer held — the window closed while you were filling this in'
      using errcode = '23514';
  end if;

  -- Infants travel on a lap and are priced separately, so they do not consume
  -- a seat. The hold must still cover everyone who does.
  v_seats_needed := coalesce((p_payload#>>'{party,adults}')::int, 0)
                  + coalesce((p_payload#>>'{party,children}')::int, 0);
  if v_hold.seats < v_seats_needed then
    raise exception 'The party grew to % seat(s) but only % are held', v_seats_needed, v_hold.seats
      using errcode = '23514';
  end if;

  -- Two invariants worth failing loudly on, because both produce a booking that
  -- is internally inconsistent and neither is visible until much later — one in
  -- the departure manifest, the other on the invoice.
  --
  -- The travellers list must describe exactly the party the price was computed
  -- from. A booking sold as two adults but carrying four names is a manifest
  -- that will not match the coach.
  if jsonb_array_length(coalesce(p_payload->'travellers', '[]'::jsonb)) <> (
       coalesce((p_payload#>>'{party,adults}')::int, 0)
     + coalesce((p_payload#>>'{party,children}')::int, 0)
     + coalesce((p_payload#>>'{party,infants}')::int, 0))
  then
    raise exception 'The traveller list does not match the party that was priced'
      using errcode = '23514';
  end if;

  -- Price lines must reconcile to the total. Discounts are negative lines, so
  -- every visible line sums to exactly what is charged — if it does not, the
  -- itemised breakdown Part D requires is not a breakdown of anything.
  select coalesce(sum((value->>'amount_cents')::int), 0)
    into v_line_sum
    from jsonb_array_elements(coalesce(p_payload->'price_lines', '[]'::jsonb));

  if v_line_sum <> coalesce((p_payload#>>'{totals,total_cents}')::int, 0) then
    raise exception 'Price lines sum to % but the total is % — the breakdown does not reconcile',
      v_line_sum, coalesce((p_payload#>>'{totals,total_cents}')::int, 0)
      using errcode = '23514';
  end if;

  insert into public.bookings (
    departure_id, package_id, user_id,
    lead_name, lead_email, lead_phone, lead_address,
    adults, children, infants,
    room_type_id, single_supplement,
    currency, subtotal_cents, discount_cents, tax_cents, fees_cents, total_cents,
    deposit_due_cents, balance_due_on, promotion_id, status
  ) values (
    v_dep.id,
    (p_payload->>'package_id')::uuid,
    nullif(p_payload->>'user_id', '')::uuid,
    p_payload#>>'{lead,name}',
    lower(p_payload#>>'{lead,email}'),
    nullif(p_payload#>>'{lead,phone}', ''),
    nullif(p_payload#>'{lead,address}', 'null'::jsonb),
    coalesce((p_payload#>>'{party,adults}')::int, 1),
    coalesce((p_payload#>>'{party,children}')::int, 0),
    coalesce((p_payload#>>'{party,infants}')::int, 0),
    nullif(p_payload->>'room_type_id', '')::uuid,
    coalesce((p_payload->>'single_supplement')::boolean, false),
    coalesce(p_payload->>'currency', 'CAD'),
    coalesce((p_payload#>>'{totals,subtotal_cents}')::int, 0),
    coalesce((p_payload#>>'{totals,discount_cents}')::int, 0),
    coalesce((p_payload#>>'{totals,tax_cents}')::int, 0),
    coalesce((p_payload#>>'{totals,fees_cents}')::int, 0),
    coalesce((p_payload#>>'{totals,total_cents}')::int, 0),
    coalesce((p_payload#>>'{totals,deposit_due_cents}')::int, 0),
    nullif(p_payload->>'balance_due_on', '')::date,
    nullif(p_payload->>'promotion_id', '')::uuid,
    'pending_payment'
  )
  returning * into v_booking;

  for v_line in select * from jsonb_array_elements(coalesce(p_payload->'price_lines', '[]'::jsonb))
  loop
    insert into public.booking_price_lines
      (booking_id, kind, label, quantity, unit_cents, amount_cents, extra_id, sort_order)
    values (
      v_booking.id,
      v_line->>'kind',
      v_line->>'label',
      coalesce((v_line->>'quantity')::int, 1),
      (v_line->>'unit_cents')::int,
      (v_line->>'amount_cents')::int,
      nullif(v_line->>'extra_id', '')::uuid,
      coalesce((v_line->>'sort_order')::int, 0)
    );
  end loop;

  for v_traveller in select * from jsonb_array_elements(coalesce(p_payload->'travellers', '[]'::jsonb))
  loop
    v_position := (v_traveller->>'position')::int;
    insert into public.travellers
      (booking_id, position, traveller_type, legal_name, date_of_birth,
       is_lead, dietary_notes, accessibility_notes, emergency_contact)
    values (
      v_booking.id,
      v_position,
      v_traveller->>'traveller_type',
      v_traveller->>'legal_name',
      nullif(v_traveller->>'date_of_birth', '')::date,
      coalesce((v_traveller->>'is_lead')::boolean, false),
      nullif(v_traveller->>'dietary_notes', ''),
      nullif(v_traveller->>'accessibility_notes', ''),
      nullif(v_traveller->'emergency_contact', 'null'::jsonb)
    )
    returning id into v_tid;

    -- Custom-field answers arrive keyed by position, because the traveller ids
    -- do not exist until this loop runs.
    v_map := v_map || jsonb_build_object(v_position::text, v_tid);
  end loop;

  for v_field in select * from jsonb_array_elements(coalesce(p_payload->'custom_fields', '[]'::jsonb))
  loop
    insert into public.custom_field_responses (booking_id, traveller_id, field_id, value)
    values (
      v_booking.id,
      nullif(v_map->>(v_field->>'traveller_position'), '')::uuid,
      (v_field->>'field_id')::uuid,
      nullif(v_field->>'value', '')
    );
  end loop;

  -- Part D. The wording is snapshotted by the caller and stored verbatim: what
  -- matters in a dispute is what was on screen that day, not what the block
  -- says now.
  for v_ack in select * from jsonb_array_elements(coalesce(p_payload->'acknowledgements', '[]'::jsonb))
  loop
    insert into public.booking_acknowledgements
      (booking_id, block_id, label, body_snapshot, ip_address, user_agent)
    values (
      v_booking.id,
      nullif(v_ack->>'block_id', '')::uuid,
      v_ack->>'label',
      v_ack->>'body_snapshot',
      nullif(v_ack->>'ip_address', '')::inet,
      nullif(v_ack->>'user_agent', '')
    );
  end loop;

  -- The hold now belongs to the booking and runs on the payment clock.
  update public.booking_holds
     set booking_id = v_booking.id,
         user_id    = coalesce(v_booking.user_id, user_id),
         expires_at = now() + make_interval(mins => v_minutes)
   where id = v_hold.id;

  return v_booking;
end;
$$;

comment on function public.create_booking(jsonb) is
  'A5 step 5. One transaction: booking, price lines, travellers, custom-field answers, acknowledgements, and the hold handed over to the payment window.';

-- ---------------------------------------------------------------------------
-- 6. PRIVILEGES
-- ---------------------------------------------------------------------------
-- Every function above is SECURITY DEFINER, so the implicit PUBLIC EXECUTE
-- grant would let any anon browser session move seat counts around and mint
-- bookings directly through PostgREST. Revoking from anon/authenticated alone
-- is not enough — PUBLIC is where the grant actually comes from.

do $$
declare f text;
begin
  foreach f in array array[
    'public.expire_stale_holds(uuid)',
    'public.claim_seats(uuid, int, text, uuid)',
    'public.extend_hold(uuid, text)',
    'public.release_hold(uuid, text)',
    'public.confirm_hold_seats(uuid)',
    'public.create_booking(jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant  execute on function %s to service_role', f);
  end loop;
end $$;
