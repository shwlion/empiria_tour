-- ===========================================================================
-- 0006_payments.sql
--
-- A6. Recording that money arrived.
--
-- One function, because a payment is never one write. It is a payment row, a
-- new balance on the booking, a status that has to follow from that balance,
-- and — the part that actually matters — seats moving from held to booked.
-- Those must all happen or none of them must, and supabase-js cannot open a
-- transaction.
--
-- Two properties this has to hold that ordinary application code would not:
--
--   1. IDEMPOTENCE. Stripe redelivers. A webhook that succeeded but whose
--      200 was lost arrives again, sometimes days later, and must not double
--      a traveller's balance or double-decrement a departure. The unique index
--      on (provider, provider_ref) from migration 0002 is the whole mechanism:
--      the second delivery inserts nothing and the function returns the
--      booking untouched.
--
--   2. SEATS MOVE ONLY HERE. `confirm_hold_seats` is called on the first
--      successful payment and nowhere else. Availability has never been
--      decremented by anything short of money arriving, and this is the point
--      at which it finally is.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. SCHEMA
-- ---------------------------------------------------------------------------

-- Stripe's session id, kept so a returning traveller can be shown the outcome
-- of the checkout they just came back from, before the webhook has landed.
alter table public.bookings
  add column if not exists checkout_session_ref text;

create index if not exists bookings_checkout_session_idx
  on public.bookings (checkout_session_ref) where checkout_session_ref is not null;

comment on column public.bookings.checkout_session_ref is
  'A6: the most recent Stripe Checkout session. The webhook is what actually confirms a booking; this only lets the return page say something true while waiting.';

-- ---------------------------------------------------------------------------
-- 2. RECORDING A PAYMENT
-- ---------------------------------------------------------------------------

create or replace function public.record_payment(p_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking   public.bookings;
  v_payment   uuid;
  v_amount    int;
  v_kind      text;
  v_status    text;
  v_paid      int;
  v_first     boolean;
  v_next      text;
begin
  v_amount := coalesce((p_payload->>'amount_cents')::int, 0);
  v_kind   := coalesce(p_payload->>'kind', 'full');
  v_status := coalesce(p_payload->>'status', 'succeeded');

  -- Lock the booking first. Two Stripe events for the same booking can arrive
  -- concurrently — a deposit and a balance, or a payment and a refund — and
  -- both read amount_paid_cents before either writes it.
  select * into v_booking
    from public.bookings
   where id = (p_payload->>'booking_id')::uuid
   for update;
  if not found then
    raise exception 'No booking % to record a payment against', p_payload->>'booking_id'
      using errcode = 'P0002';
  end if;

  -- Was anything already paid? Read before the insert, because the answer
  -- decides whether the seats still need converting.
  v_first := v_booking.amount_paid_cents = 0;

  insert into public.payments
    (booking_id, kind, amount_cents, currency, status, provider, provider_ref,
     processor_fee_cents, recorded_by)
  values (
    v_booking.id,
    v_kind,
    v_amount,
    coalesce(p_payload->>'currency', v_booking.currency),
    v_status,
    coalesce(p_payload->>'provider', 'stripe'),
    nullif(p_payload->>'provider_ref', ''),
    nullif(p_payload->>'processor_fee_cents', '')::int,
    nullif(p_payload->>'recorded_by', '')::uuid
  )
  on conflict (provider, provider_ref) where provider_ref is not null
  do nothing
  returning id into v_payment;

  -- Already recorded. Stripe is retrying, or two webhook workers raced. Hand
  -- back what is already true rather than adding to it.
  if v_payment is null then
    return v_booking;
  end if;

  -- Only settled money moves the balance. A failed attempt is worth recording
  -- and worth nothing else.
  if v_status <> 'succeeded' then
    return v_booking;
  end if;

  v_paid := v_booking.amount_paid_cents + v_amount;

  -- Status follows from the balance rather than from which button was pressed:
  -- a "deposit" that happens to cover the whole total leaves nothing owing, and
  -- calling that booking merely confirmed would be wrong.
  if v_paid <= 0 then
    v_next := case when v_amount < 0 then 'refunded' else 'pending_payment' end;
  elsif v_paid >= v_booking.total_cents then
    v_next := 'paid_in_full';
  else
    v_next := 'confirmed';
  end if;

  update public.bookings
     set amount_paid_cents = v_paid,
         status            = v_next,
         updated_at        = now()
   where id = v_booking.id
  returning * into v_booking;

  -- The seats. Held until now, booked from now — and only once, however many
  -- further payments the balance takes.
  if v_first and v_amount > 0 then
    perform public.confirm_hold_seats(v_booking.id);
  end if;

  return v_booking;
end;
$$;

comment on function public.record_payment(jsonb) is
  'A6. Idempotent on (provider, provider_ref): a redelivered Stripe event records nothing twice. Converts held seats to booked on the first successful payment.';

-- ---------------------------------------------------------------------------
-- 3. RELEASING A BOOKING THAT WAS NEVER PAID
-- ---------------------------------------------------------------------------

-- Checkout can be abandoned, and the payment window then lapses. Migration
-- 0005's expire_stale_holds already cancels those and returns the seats; this
-- exists so a traveller who presses Cancel is not made to wait out a clock for
-- seats they have just told us they do not want.
create or replace function public.abandon_booking(p_booking uuid, p_session text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  -- Scoped by the same session token that created the hold, so one traveller
  -- cannot cancel another's booking by guessing a reference.
  select exists (
    select 1
      from public.bookings b
      join public.booking_holds h on h.booking_id = b.id
     where b.id = p_booking
       and b.status = 'pending_payment'
       and b.amount_paid_cents = 0
       and h.session_token = p_session
  ) into v_ok;

  if not v_ok then
    return false;
  end if;

  update public.bookings
     set status         = 'cancelled',
         cancelled_at   = now(),
         notes_internal = concat_ws(E'\n', notes_internal, 'Cancelled by the traveller before payment.')
   where id = p_booking;

  -- Give the seats straight back rather than leaving them held to expire.
  update public.booking_holds h
     set released_at = now()
    from public.departures d
   where h.booking_id = p_booking
     and h.released_at is null
     and d.id = h.departure_id;

  update public.departures d
     set seats_held = greatest(d.seats_held - agg.seats, 0)
    from (
      select departure_id, sum(seats) as seats
        from public.booking_holds
       where booking_id = p_booking
       group by departure_id
    ) agg
   where d.id = agg.departure_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. PRIVILEGES
-- ---------------------------------------------------------------------------
-- Both are SECURITY DEFINER, and record_payment in particular would let anyone
-- who could call it mark any booking paid. The implicit PUBLIC grant is where
-- that reach comes from, so it goes first.

do $$
declare f text;
begin
  foreach f in array array[
    'public.record_payment(jsonb)',
    'public.abandon_booking(uuid, text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant  execute on function %s to service_role', f);
  end loop;
end $$;
