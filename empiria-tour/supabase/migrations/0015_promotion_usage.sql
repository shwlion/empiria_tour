-- Promotion codes: usage accounting, and enforcement where it holds.
--
-- The tables have existed since 0002 and the storefront has applied codes for
-- weeks, but three things were never true:
--
--   1. usage_count was never written. lookupPromotion compared against it, so
--      a usage limit was a number that could not be reached.
--   2. per_user_limit was never read.
--   3. create_booking accepted whatever promotion_id and discount_cents the
--      payload carried. The application re-checked before calling, but a check
--      in application code cannot hold a lock, so two travellers could both pass
--      "one use left" and both book. This project's rule is that guards live in
--      the database; promotions were the one place it did not.
--
-- usage_count is now maintained by a trigger on bookings rather than by an
-- increment in create_booking. A stored count that is incremented in one place
-- has to be decremented in every place a booking stops counting — abandon,
-- expiry, and the cancellation function that is coming — and one of those will
-- be forgotten. A trigger that recomputes from the bookings table cannot be.
-- A cancelled booking releases its use; a refunded one does not, because the
-- code was spent and the money coming back is a different fact.

-- ---------------------------------------------------------------------------
-- 1. usage_count follows the bookings table
-- ---------------------------------------------------------------------------

create or replace function public.sync_promotion_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  -- Both the promotion the row points at now and the one it pointed at before,
  -- so re-pointing a booking (which nothing does today) keeps both counts right.
  v_ids := array_remove(array[
    case when tg_op = 'DELETE' then null else new.promotion_id end,
    case when tg_op = 'INSERT' then null else old.promotion_id end
  ], null);
  if array_length(v_ids, 1) is null then
    return null;
  end if;

  update public.promotions p
     set usage_count = (
       select count(*)
         from public.bookings b
        where b.promotion_id = p.id
          and b.status <> 'cancelled')
   where p.id = any (v_ids);
  return null;
end;
$$;

drop trigger if exists sync_promotion_usage on public.bookings;
create trigger sync_promotion_usage
  after insert or delete or update of status, promotion_id on public.bookings
  for each row execute function public.sync_promotion_usage();

-- Whatever the count was before this migration, it was wrong.
update public.promotions p
   set usage_count = (
     select count(*) from public.bookings b
      where b.promotion_id = p.id and b.status <> 'cancelled');

-- ---------------------------------------------------------------------------
-- 2. The check that holds the lock
-- ---------------------------------------------------------------------------
-- Split out of create_booking so it can be proved on its own and reused by
-- amendment later. Every refusal is check_violation (23514) with a sentence a
-- traveller can be shown; the storefront's friendly() passes those through.

create or replace function public.check_promotion(
  p_promotion      uuid,
  p_package        uuid,
  p_currency       text,
  p_user           uuid,
  p_email          text,
  p_subtotal_cents int,
  p_discount_cents int
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_promo    public.promotions;
  v_used     int;
  v_expected int;
begin
  if p_promotion is null then
    -- No code, no discount. A payload that asserts one without the other is
    -- not a traveller's mistake.
    if coalesce(p_discount_cents, 0) <> 0 then
      raise exception 'A discount was applied without a promotion code' using errcode = '23514';
    end if;
    return;
  end if;

  -- FOR UPDATE is the whole point. The counts below are read under this lock
  -- and the trigger that moves them runs inside this same transaction, so a
  -- concurrent booking on the same code waits here and sees the new count.
  select * into v_promo from public.promotions where id = p_promotion for update;
  if not found or v_promo.status <> 'active' then
    raise exception 'That promotion code is no longer valid' using errcode = '23514';
  end if;
  if v_promo.valid_from is not null and v_promo.valid_from > now() then
    raise exception 'That promotion code is not valid yet' using errcode = '23514';
  end if;
  if v_promo.valid_until is not null and v_promo.valid_until < now() then
    raise exception 'That promotion code has expired' using errcode = '23514';
  end if;
  -- A fixed discount is denominated; a percentage travels between currencies.
  if v_promo.discount_type = 'fixed' and v_promo.currency <> p_currency then
    raise exception 'That promotion code is not valid in this currency' using errcode = '23514';
  end if;
  -- No rows in promotion_packages means the promotion applies everywhere.
  if exists (select 1 from public.promotion_packages s where s.promotion_id = p_promotion)
     and not exists (select 1 from public.promotion_packages s
                      where s.promotion_id = p_promotion and s.package_id = p_package) then
    raise exception 'That promotion code is not valid for this tour' using errcode = '23514';
  end if;
  if v_promo.usage_limit is not null and v_promo.usage_count >= v_promo.usage_limit then
    raise exception 'That promotion code has been used as many times as it allows' using errcode = '23514';
  end if;
  -- Per person: the account when there is one, else the lead email. A guest
  -- booking converts to an account later, so both are matched, not either.
  if v_promo.per_user_limit is not null then
    select count(*) into v_used
      from public.bookings b
     where b.promotion_id = p_promotion
       and b.status <> 'cancelled'
       and (   (p_user  is not null and b.user_id = p_user)
            or (p_email is not null and lower(b.lead_email) = lower(p_email)));
    if v_used >= v_promo.per_user_limit then
      raise exception 'You have already used that promotion code' using errcode = '23514';
    end if;
  end if;

  -- The same arithmetic as lib/pricing.ts: discount the subtotal, never more
  -- than the subtotal, nothing at all on a zero subtotal. If the payload's
  -- figure differs from this one, the payload is wrong.
  if coalesce(p_subtotal_cents, 0) <= 0 then
    v_expected := 0;
  elsif v_promo.discount_type = 'percent' then
    v_expected := least(round(p_subtotal_cents::numeric * v_promo.discount_value / 100)::int, p_subtotal_cents);
  else
    v_expected := least(v_promo.discount_value, p_subtotal_cents);
  end if;
  v_expected := greatest(v_expected, 0);

  if coalesce(p_discount_cents, 0) <> v_expected then
    raise exception 'The discount does not match the promotion — % expected, % given',
      v_expected, coalesce(p_discount_cents, 0)
      using errcode = '23514';
  end if;
end;
$$;

comment on function public.check_promotion(uuid, uuid, text, uuid, text, int, int) is
  'A5. Validates a promotion under a row lock and recomputes its discount. Called by create_booking; raises check_violation with a sentence a traveller can read.';

-- ---------------------------------------------------------------------------
-- 3. create_booking, now calling it
-- ---------------------------------------------------------------------------
-- The body is 0005's, unchanged except for the check_promotion call placed
-- after the price lines reconcile and before the booking row is written.

create or replace function public.create_booking(p_payload jsonb)
returns public.bookings
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- The promotion, if any, is validated here and nowhere else that counts.
  -- The application checked it when the code was typed and again before this
  -- call, but both of those are courtesy: this is the one that holds a lock on
  -- the promotion row, so two bookings racing the last use of a limited code
  -- serialise on it and the second is refused rather than both succeeding. It
  -- also recomputes the discount from the subtotal and refuses a payload whose
  -- discount_cents says otherwise, which closes the last way a discount could
  -- be asserted rather than earned.
  perform public.check_promotion(
    nullif(p_payload->>'promotion_id', '')::uuid,
    (p_payload->>'package_id')::uuid,
    coalesce(p_payload->>'currency', 'CAD'),
    nullif(p_payload->>'user_id', '')::uuid,
    p_payload#>>'{lead,email}',
    coalesce((p_payload#>>'{totals,subtotal_cents}')::int, 0),
    coalesce((p_payload#>>'{totals,discount_cents}')::int, 0)
  );

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
  'A5 step 5. One transaction: booking, price lines, travellers, custom-field answers, acknowledgements, and the hold handed over to the payment window. Validates the promotion under a lock (0015).';

-- ---------------------------------------------------------------------------
-- 4. PRIVILEGES
-- ---------------------------------------------------------------------------
-- Revoke from public as well as the two roles: Postgres grants EXECUTE to
-- PUBLIC on every new function and revoking only the roles leaves that intact.
-- create_booking keeps its grants across CREATE OR REPLACE; restated anyway,
-- because a migration that assumes is a migration that eventually assumes wrong.

revoke execute on function public.sync_promotion_usage()                                    from public, anon, authenticated;
revoke execute on function public.check_promotion(uuid, uuid, text, uuid, text, int, int)   from public, anon, authenticated;
revoke execute on function public.create_booking(jsonb)                                     from public, anon, authenticated;
grant  execute on function public.sync_promotion_usage()                                    to service_role;
grant  execute on function public.check_promotion(uuid, uuid, text, uuid, text, int, int)   to service_role;
grant  execute on function public.create_booking(jsonb)                                     to service_role;

-- ---------------------------------------------------------------------------
-- 5. PROOF
-- ---------------------------------------------------------------------------
-- Runs on apply, inside the migration's transaction; any failed assertion rolls
-- the whole migration back. Uses an existing departure and package so it
-- creates nothing but the bookings and promotions it deletes at the end.
--
-- What it cannot prove: the two-connection race. One session cannot open two
-- transactions. The lock is the mechanism — the same FOR UPDATE that
-- claim_seats was proved with across two connections — and it is stated here
-- rather than claimed.

do $$
declare
  v_dep      public.departures;
  v_other    uuid;
  v_user     uuid;
  v_p1       uuid;
  v_p2       uuid;
  v_b1       uuid;
  v_b2       uuid;
  v_count    int;
  v_msg      text;
begin
  select * into v_dep from public.departures order by created_at limit 1;
  if not found then
    raise exception 'HARNESS: no departure to test against';
  end if;
  select id into v_other from public.packages where id <> v_dep.package_id limit 1;
  select id into v_user from public.users limit 1;

  insert into public.promotions (code, discount_type, discount_value, currency, usage_limit, per_user_limit)
  values ('HARNESS10', 'percent', 10, 'CAD', 2, 1) returning id into v_p1;
  insert into public.promotions (code, discount_type, discount_value, currency)
  values ('HARNESS500', 'fixed', 500, 'CAD') returning id into v_p2;

  -- (a) the arithmetic: 10% of 100000 is 10000, and only 10000 is accepted
  perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'a@harness.invalid', 100000, 10000);
  begin
    perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'a@harness.invalid', 100000, 10001);
    raise exception 'HARNESS: a mismatched discount was accepted' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  -- (b) a discount with no code is refused
  begin
    perform public.check_promotion(null, v_dep.package_id, 'CAD', null, null, 100000, 1);
    raise exception 'HARNESS: a discount with no promotion was accepted' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  -- (c) a zero subtotal earns nothing, even with a code
  perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, null, 0, 0);

  -- (d) the trigger: a booking counts, a cancelled one does not
  insert into public.bookings (departure_id, package_id, lead_name, lead_email, promotion_id)
  values (v_dep.id, v_dep.package_id, 'Harness One', 'a@harness.invalid', v_p1) returning id into v_b1;
  select usage_count into v_count from public.promotions where id = v_p1;
  if v_count <> 1 then raise exception 'HARNESS: usage_count is % after one booking, expected 1', v_count; end if;

  -- (e) per-user: the same email is refused, a different one is not
  begin
    perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'A@Harness.invalid', 100000, 10000);
    raise exception 'HARNESS: per_user_limit was not enforced by email' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'b@harness.invalid', 100000, 10000);
  if v_user is not null then
    update public.bookings set user_id = v_user where id = v_b1;
    begin
      perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', v_user, 'c@harness.invalid', 100000, 10000);
      raise exception 'HARNESS: per_user_limit was not enforced by user id' using errcode = 'P0001';
    exception when check_violation then null;
    end;
  end if;

  -- (f) usage limit: a second booking fills it, a third is refused
  insert into public.bookings (departure_id, package_id, lead_name, lead_email, promotion_id)
  values (v_dep.id, v_dep.package_id, 'Harness Two', 'b@harness.invalid', v_p1) returning id into v_b2;
  select usage_count into v_count from public.promotions where id = v_p1;
  if v_count <> 2 then raise exception 'HARNESS: usage_count is % after two bookings, expected 2', v_count; end if;
  begin
    perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'c@harness.invalid', 100000, 10000);
    raise exception 'HARNESS: usage_limit was not enforced' using errcode = 'P0001';
  exception when check_violation then null;
  end;

  -- (g) cancelling releases the use; refunding does not
  update public.bookings set status = 'cancelled' where id = v_b1;
  select usage_count into v_count from public.promotions where id = v_p1;
  if v_count <> 1 then raise exception 'HARNESS: usage_count is % after a cancellation, expected 1', v_count; end if;
  perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'c@harness.invalid', 100000, 10000);
  update public.bookings set status = 'refunded' where id = v_b2;
  select usage_count into v_count from public.promotions where id = v_p1;
  if v_count <> 1 then raise exception 'HARNESS: a refund released a use (count %)', v_count; end if;

  -- (h) scope: once scoped to another package, this one is refused
  if v_other is not null then
    insert into public.promotion_packages (promotion_id, package_id) values (v_p1, v_other);
    begin
      perform public.check_promotion(v_p1, v_dep.package_id, 'CAD', null, 'c@harness.invalid', 100000, 10000);
      raise exception 'HARNESS: package scope was not enforced' using errcode = 'P0001';
    exception when check_violation then null;
    end;
    perform public.check_promotion(v_p1, v_other, 'CAD', null, 'c@harness.invalid', 100000, 10000);
    delete from public.promotion_packages where promotion_id = v_p1;
  end if;

  -- (i) a fixed discount is denominated, and is clamped to the subtotal
  begin
    perform public.check_promotion(v_p2, v_dep.package_id, 'USD', null, null, 100000, 500);
    raise exception 'HARNESS: a fixed CAD code was accepted in USD' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  perform public.check_promotion(v_p2, v_dep.package_id, 'CAD', null, null, 100000, 500);
  perform public.check_promotion(v_p2, v_dep.package_id, 'CAD', null, null, 300, 300);

  -- (j) the window and the switch
  update public.promotions set valid_from = now() + interval '1 day' where id = v_p2;
  begin
    perform public.check_promotion(v_p2, v_dep.package_id, 'CAD', null, null, 100000, 500);
    raise exception 'HARNESS: a code valid from tomorrow was accepted' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  update public.promotions set valid_from = null, valid_until = now() - interval '1 day' where id = v_p2;
  begin
    perform public.check_promotion(v_p2, v_dep.package_id, 'CAD', null, null, 100000, 500);
    raise exception 'HARNESS: an expired code was accepted' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  update public.promotions set valid_until = null, status = 'inactive' where id = v_p2;
  begin
    perform public.check_promotion(v_p2, v_dep.package_id, 'CAD', null, null, 100000, 500);
    raise exception 'HARNESS: an inactive code was accepted' using errcode = 'P0001';
  exception when check_violation then null;
  end;
  -- and the message is one a traveller can be shown
  begin
    perform public.check_promotion(v_p2, v_dep.package_id, 'CAD', null, null, 100000, 500);
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg <> 'That promotion code is no longer valid' then
      raise exception 'HARNESS: unexpected message %', v_msg;
    end if;
  end;

  -- Never leave test data behind.
  delete from public.bookings where id in (v_b1, v_b2);
  delete from public.promotions where id in (v_p1, v_p2);
  if exists (select 1 from public.promotions where code like 'HARNESS%')
     or exists (select 1 from public.bookings where lead_email like '%@harness.invalid') then
    raise exception 'HARNESS: cleanup left rows behind';
  end if;
  raise notice 'promotion harness: 21 assertions passed, rows deleted';
end $$;
