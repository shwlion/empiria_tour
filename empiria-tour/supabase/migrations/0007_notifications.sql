-- ===========================================================================
-- 0007_notifications.sql
--
-- Part C. Thirteen transactional messages, and the machinery to actually send
-- them.
--
-- The shape of this is decided by one fact: three of the thirteen are not
-- events. `balance_due`, `installment_due` and `pre_departure` fire at a
-- configurable interval *before* a date, which means nothing in the request
-- path can trigger them. Something has to run on a clock, look for what has
-- become due, and act. Once that exists, every other message may as well go
-- through it too — and then there is exactly one place that talks to the mail
-- provider, one place that records what was sent, and one answer to "did they
-- get it?".
--
-- So: an outbox. Three properties it has to hold.
--
--   1. ENQUEUE IS IDEMPOTENT. Stripe redelivers, and a webhook that succeeded
--      but whose 200 was lost arrives again. `dedupe_key` is unique, so the
--      second delivery enqueues nothing and the traveller gets one email. Same
--      mechanism as (provider, provider_ref) on payments, for the same reason.
--
--   2. THE FACTS FREEZE AT ENQUEUE; THE WORDING RESOLVES AT SEND. `merge_data`
--      is captured when the event happens, so a total that changes next week
--      does not rewrite what the confirmation said. The template body is read
--      when the message is actually sent, and the result is written back into
--      `subject_snapshot` / `body_snapshot` — so the log holds what genuinely
--      went out, not what the template says today. This is the same reasoning
--      as `booking_acknowledgements.body_snapshot`: an editable template and a
--      historical record are different things.
--
--   3. TWO DRAINERS NEVER SEND THE SAME MESSAGE. `claim_email_batch` takes
--      `for update skip locked`. A retry, an overlapping cron tick, or a second
--      instance can all run at once and no traveller is emailed twice.
--
-- Delivery itself is still blocked on Resend DNS. That blocks messages leaving
-- the outbox, not messages entering it — everything below works, and the queue
-- simply fills until the domain verifies.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE TWO MISSING TEMPLATES
-- ---------------------------------------------------------------------------
-- Rev 1 of the agreement took Part C from eleven triggers to thirteen by adding
-- installment plans. The rows are created empty, like the other eleven: Empiria
-- writes the wording (§2.1), the console is where they write it.

insert into public.email_templates (key, name, subject, body_html, body_text, is_active)
values
  ('installment_due',  'Installment due',  '', '', null, true),
  ('installment_paid', 'Installment paid', '', '', null, true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. CONFIGURABLE REMINDER INTERVALS
-- ---------------------------------------------------------------------------
-- Part C says "at a configurable interval before". Configurable means a row in
-- settings, not a constant in a scan.

alter table public.platform_settings
  add column if not exists balance_reminder_days     int not null default 14,
  add column if not exists installment_reminder_days int not null default 3,
  add column if not exists pre_departure_days        int not null default 7;

comment on column public.platform_settings.balance_reminder_days is
  'Part C: days before balance_due_on to send the balance reminder.';
comment on column public.platform_settings.installment_reminder_days is
  'Part C: days before an installment due date to send its reminder.';
comment on column public.platform_settings.pre_departure_days is
  'Part C: days before departure to send travel documents and practical information.';

-- ---------------------------------------------------------------------------
-- 3. THE OUTBOX
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.email_status as enum ('queued', 'sending', 'sent', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.email_messages (
  id            uuid primary key default gen_random_uuid(),
  template_key  text not null references public.email_templates (key) on delete restrict,

  -- Who it is going to. Held as plain text rather than a join, because an
  -- address is a historical fact about a send: if a traveller later changes
  -- their email, the log must still say where this one actually went.
  to_email      text not null,
  to_name       text,

  -- What it is about. All nullable — account_created has no booking, and an
  -- admin alert about a departure has no single traveller.
  booking_id    uuid references public.bookings (id)   on delete set null,
  departure_id  uuid references public.departures (id) on delete set null,
  user_id       uuid references public.users (id)      on delete set null,

  -- Frozen at enqueue. See property 2 above.
  merge_data    jsonb not null default '{}'::jsonb,

  -- Written at send. Null until then; never rewritten afterwards.
  subject_snapshot text,
  body_snapshot    text,

  status        public.email_status not null default 'queued',
  scheduled_for timestamptz not null default now(),

  -- Idempotence. Null means "this send is deliberately repeatable" — a staff
  -- member pressing Resend is exactly that, and must not be swallowed.
  dedupe_key    text,

  provider      text not null default 'resend',
  provider_ref  text,
  attempts      int  not null default 0,
  last_error    text,
  last_attempt_at timestamptz,

  created_at    timestamptz not null default now(),
  sent_at       timestamptz,

  constraint email_messages_sent_has_snapshot
    check (status <> 'sent' or (subject_snapshot is not null and body_snapshot is not null))
);

-- One send per dedupe key, ever. Partial, so the many null keys do not collide.
create unique index if not exists email_messages_dedupe_idx
  on public.email_messages (dedupe_key) where dedupe_key is not null;

-- The drainer's query: what is queued and due, oldest first.
create index if not exists email_messages_due_idx
  on public.email_messages (scheduled_for)
  where status = 'queued';

create index if not exists email_messages_booking_idx
  on public.email_messages (booking_id, created_at desc)
  where booking_id is not null;

comment on table public.email_messages is
  'Part C outbox and send log. Rows enter from events and from the scheduled scan, leave through the drainer, and stay forever as the record of what was sent.';

alter table public.email_messages enable row level security;

-- A traveller may read the log of what was sent to them, and nothing else.
-- Staff read through the service-role client, as everywhere else in Part B.
-- No write policy exists for anyone: rows are created by the functions below.
drop policy if exists email_messages_own_read on public.email_messages;
create policy email_messages_own_read on public.email_messages
  for select to authenticated
  using (
    user_id = auth.uid()
    or booking_id in (select id from public.bookings where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 4. ENQUEUE
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_email(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key    text := p_payload->>'template_key';
  v_dedupe text := nullif(p_payload->>'dedupe_key', '');
  v_email  text := nullif(p_payload->>'to_email', '');
  v_id     uuid;
begin
  if v_key is null then
    raise exception 'A message needs a template key' using errcode = '22004';
  end if;
  if v_email is null then
    raise exception 'A message needs somewhere to go' using errcode = '22004';
  end if;
  if not exists (select 1 from public.email_templates where key = v_key) then
    raise exception 'There is no template called %', v_key using errcode = '23503';
  end if;

  insert into public.email_messages (
    template_key, to_email, to_name,
    booking_id, departure_id, user_id,
    merge_data, dedupe_key, scheduled_for
  )
  values (
    v_key,
    v_email,
    nullif(p_payload->>'to_name', ''),
    nullif(p_payload->>'booking_id', '')::uuid,
    nullif(p_payload->>'departure_id', '')::uuid,
    nullif(p_payload->>'user_id', '')::uuid,
    coalesce(p_payload->'merge_data', '{}'::jsonb),
    v_dedupe,
    coalesce((p_payload->>'scheduled_for')::timestamptz, now())
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  -- Null means the dedupe key was already there. That is a success, not a
  -- failure: the message exists and the caller should carry on.
  if v_id is null and v_dedupe is not null then
    select id into v_id from public.email_messages where dedupe_key = v_dedupe;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. DRAIN
-- ---------------------------------------------------------------------------

create or replace function public.claim_email_batch(p_limit int default 20)
returns setof public.email_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    select id
    from public.email_messages
    where status = 'queued'
      and scheduled_for <= now()
      -- Exponential-ish backoff without a schedule column: an attempt that
      -- failed waits attempts^2 minutes before it is eligible again. Integer
      -- multiplication rather than power(), which returns double precision and
      -- would hand '4.0 minutes' to the interval cast.
      and (last_attempt_at is null
           or last_attempt_at < now() - ((attempts * attempts) || ' minutes')::interval)
    order by scheduled_for
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.email_messages m
     set status = 'sending',
         attempts = m.attempts + 1,
         last_attempt_at = now()
    from claimed
   where m.id = claimed.id
  returning m.*;
end;
$$;

create or replace function public.mark_email_sent(
  p_id uuid, p_provider_ref text, p_subject text, p_body text
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.email_messages
     set status = 'sent',
         provider_ref = p_provider_ref,
         subject_snapshot = p_subject,
         body_snapshot = p_body,
         sent_at = now(),
         last_error = null
   where id = p_id and status = 'sending';
$$;

create or replace function public.mark_email_failed(
  p_id uuid, p_error text, p_max_attempts int default 5
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.email_messages
     set status = case when attempts >= p_max_attempts then 'failed'::public.email_status
                       else 'queued'::public.email_status end,
         last_error = p_error
   where id = p_id and status = 'sending';
$$;

-- ---------------------------------------------------------------------------
-- 6. THE CLOCK
-- ---------------------------------------------------------------------------
-- What has become due since the last tick. Idempotent by construction: every
-- row it writes carries a dedupe key, so running it twice an hour, or twice a
-- second, produces the same queue.

create or replace function public.enqueue_due_reminders()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.platform_settings;
  v_count int := 0;
  v_row record;
begin
  select * into v_settings from public.platform_settings limit 1;
  if v_settings is null then
    return 0;
  end if;

  -- Balance reminders. Only where money is genuinely outstanding and a due date
  -- exists; a booking already paid in full is not chased.
  for v_row in
    select b.id, b.reference, b.lead_email, b.lead_name, b.balance_due_on,
           b.balance_cents, b.currency, b.user_id, b.departure_id,
           p.title as package_title, d.starts_on
      from public.bookings b
      join public.departures d on d.id = b.departure_id
      join public.packages   p on p.id = b.package_id
     where b.status in ('confirmed', 'balance_due')
       and b.balance_cents > 0
       and b.balance_due_on is not null
       and b.balance_due_on <= (current_date + v_settings.balance_reminder_days)
       and b.balance_due_on >= current_date
  loop
    perform public.enqueue_email(jsonb_build_object(
      'template_key', 'balance_due',
      'to_email', v_row.lead_email,
      'to_name',  v_row.lead_name,
      'booking_id', v_row.id,
      'departure_id', v_row.departure_id,
      'user_id', v_row.user_id,
      'dedupe_key', 'balance_due:' || v_row.id || ':' || v_row.balance_due_on,
      'merge_data', jsonb_build_object(
        'booking.reference', v_row.reference,
        'booking.balance_cents', v_row.balance_cents,
        'booking.balance_due_on', v_row.balance_due_on,
        'booking.currency', v_row.currency,
        'traveller.name', v_row.lead_name,
        'package.title', v_row.package_title,
        'departure.date', v_row.starts_on
      )
    ));
    v_count := v_count + 1;
  end loop;

  -- Pre-departure. Committed bookings only — a hold is not a passenger, and
  -- travel documents for a departure somebody never paid for are worse than
  -- nothing.
  for v_row in
    select b.id, b.reference, b.lead_email, b.lead_name, b.user_id, b.departure_id,
           p.title as package_title, p.meeting_point, p.what_to_bring,
           d.starts_on, d.start_time
      from public.bookings b
      join public.departures d on d.id = b.departure_id
      join public.packages   p on p.id = b.package_id
     where b.status in ('confirmed', 'balance_due', 'paid_in_full')
       and d.starts_on <= (current_date + v_settings.pre_departure_days)
       and d.starts_on >= current_date
  loop
    perform public.enqueue_email(jsonb_build_object(
      'template_key', 'pre_departure',
      'to_email', v_row.lead_email,
      'to_name',  v_row.lead_name,
      'booking_id', v_row.id,
      'departure_id', v_row.departure_id,
      'user_id', v_row.user_id,
      'dedupe_key', 'pre_departure:' || v_row.id,
      'merge_data', jsonb_build_object(
        'booking.reference', v_row.reference,
        'traveller.name', v_row.lead_name,
        'package.title', v_row.package_title,
        'departure.date', v_row.starts_on,
        'departure.start_time', v_row.start_time,
        'departure.meeting_point', v_row.meeting_point,
        'package.what_to_bring', v_row.what_to_bring
      )
    ));
    v_count := v_count + 1;
  end loop;

  -- installment_due belongs here too. It is deliberately absent: there is no
  -- installment schedule table yet, and the commercial scope of installments is
  -- unsettled (Rev 1 §1.4). When that table lands, its reminder is a third loop
  -- in this function keyed on the schedule row id.

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. GRANTS
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, which would put every function
-- above within reach of an anonymous request. Revoke from public — not merely
-- from anon and authenticated, which would leave the implicit grant in place.

revoke all on function public.enqueue_email(jsonb)                    from public;
revoke all on function public.claim_email_batch(int)                  from public;
revoke all on function public.mark_email_sent(uuid, text, text, text) from public;
revoke all on function public.mark_email_failed(uuid, text, int)      from public;
revoke all on function public.enqueue_due_reminders()                 from public;

grant execute on function public.enqueue_email(jsonb)                    to service_role;
grant execute on function public.claim_email_batch(int)                  to service_role;
grant execute on function public.mark_email_sent(uuid, text, text, text) to service_role;
grant execute on function public.mark_email_failed(uuid, text, int)      to service_role;
grant execute on function public.enqueue_due_reminders()                 to service_role;
