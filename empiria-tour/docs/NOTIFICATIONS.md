# Part C — the notification outbox

Migration `0007_notifications.sql`. **Nothing sends yet**, and that is not a code
problem: Empiria owes the Resend DNS records and the sixteen template bodies.
Everything below works and the queue simply fills until those land.

## Why an outbox rather than send calls

Three of the thirteen Part C triggers are not events. `balance_due`,
`installment_due` and `pre_departure` fire at a configurable interval *before* a
date, so nothing in the request path can trigger them — something has to run on
a clock. Once that exists, every other message may as well go through it too,
and then there is exactly one place that talks to the mail provider, one record
of what was sent, and one answer to "did they get it?".

## Three properties, proved against the live database

1. **Enqueue is idempotent.** `email_messages.dedupe_key` is uniquely indexed
   (partial, so the many nulls do not collide). A redelivered Stripe webhook
   enqueues nothing. A **null** key is the deliberate exception: staff pressing
   Resend means "send it again" and must not be swallowed by a guard meant for
   machines.
2. **The facts freeze at enqueue; the wording resolves at send.** `merge_data` is
   captured when the event happens, so a total that changes next week does not
   rewrite what the confirmation said. The template is read at send time and the
   result written into `subject_snapshot` / `body_snapshot`, so the log holds
   what actually went out. Same reasoning as
   `booking_acknowledgements.body_snapshot`.
3. **Two drainers never send the same message.** `claim_email_batch` takes
   `for update skip locked`, so an overlapping cron tick, a retry and a second
   instance can all run at once.

Also proved: the retry path (four failures requeue, the fifth marks `failed`),
backoff, and a check constraint refusing a `sent` row with no snapshot.

## The renderer — `lib/email/render.ts`

Pure, no I/O, **37 assertions** in `render.test.ts`:

```bash
node --experimental-strip-types lib/email/render.test.ts
```

- **Fails rather than sends.** An unknown or unsupplied merge field throws
  `TemplateError`; the message is marked failed and stops consuming attempts.
- **Escapes into HTML, not into the subject or plain-text body.** Names are user
  input and the body is markup; the other two are not.
- **Raw values in, formatted out.** `FIELD_KINDS` maps each field to
  `money | date | time | int | text | url`. Dates parse as calendar dates so no
  timezone shifts a departure by a day.
- An explicit `undefined` means the enqueuer forgot, and throws. `null` is a real
  answer — a nullable column with no value renders empty.

`lib/email/fields.ts` mirrors `MERGE_FIELDS` in the admin repo's
`lib/admin/content.ts`. **The two must agree**: a chip offering a field the
renderer does not know is a template that cannot render.

## Sending — `lib/email/mailer.ts`

Resend over `fetch`, **not the SDK**. One POST with a bearer token; an SDK buys
nothing and costs a dependency, and §5.7 makes every dependency a licence
question. 4xx is not retried (the message is wrong); 5xx and 429 are.

## The clock — `POST /api/email/tick`

Runs `enqueue_due_reminders()` then drains. Behind a constant-time shared secret
(`CRON_SECRET`); **no secret configured means 404**, so a deployment that forgot
to set it does nothing rather than everything. POST only — a GET would be
followed by every crawler that saw the URL.

**Not scheduled anywhere yet.** Whatever runs it (Vercel Cron, a GitHub Action,
pg_cron) needs setting up at deploy.

## Triggers

Wired: `booking_confirmed`, `deposit_taken`, `balance_paid`, `admin_alert`,
`refund_issued` (all from the Stripe webhook), plus `balance_due` and
`pre_departure` from the scheduled scan.

Not wired: `account_created`, `booking_amended`, `booking_cancelled`,
`departure_change` — each needs its triggering action, which is B3's unbuilt
tail. `installment_due` and `installment_paid` need the schedule table.

Which message goes out after a payment is decided by reading the booking *after*
`record_payment`, not by what the caller thinks happened.

**Enqueueing never throws into its caller.** A webhook that recorded a payment
and then failed to queue an email must still return 200 — the money is the fact
that matters, and a missing email is recoverable from the console.

## Environment

```
RESEND_API_KEY=            # from Resend
EMAIL_FROM=                # must be on the verified domain
ADMIN_ALERT_EMAIL=         # falls back to platform_settings.contact_email
ADMIN_URL=                 # deep link inside admin alerts
CRON_SECRET=               # unset ⇒ /api/email/tick returns 404
```
