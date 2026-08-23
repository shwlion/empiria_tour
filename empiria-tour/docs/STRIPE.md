# Turning payment on

A6 is built. It needs an account and two keys, and neither can be put in place
from a sandbox — the environments this was developed in have no route to
`api.stripe.com`, so the end-to-end run below is yours.

**Never paste a secret key into a chat, an issue or a commit.** `sk_test_…` and
`sk_live_…` can both read and refund every charge on the account they belong to.
They go in `.env.local`, which is gitignored, and nowhere else.

---

## 1. A test account

<https://dashboard.stripe.com/register> — no business details are needed to use
test mode. Leave the dashboard toggle on **Test mode**.

**Developers → API keys → Secret key**, reveal it, and put it in
`empiria-tour/.env.local`:

```
STRIPE_SECRET_KEY=sk_test_...
```

The booking page shows a **Test mode** badge whenever it sees an `sk_test_` key,
so nobody demonstrates a live charge by accident.

## 2. The webhook

Payment is confirmed by the webhook and by nothing else — not by the page
Stripe redirects to, which a traveller can open by hand and a real one can miss
by closing the tab. Until the webhook is running, a payment will go through at
Stripe and the booking will stay unpaid.

Locally, install the CLI (`brew install stripe/stripe-cli/stripe`), then:

```
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

It prints a signing secret on startup. That goes in `.env.local` too, and it
changes each time you restart `stripe listen`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

Deployed, it is **Developers → Webhooks → Add endpoint**, pointing at
`https://your-domain/api/webhooks/stripe`, then reveal that endpoint's signing
secret. It is per-endpoint, not per-account.

Events to send: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `charge.refunded`. Anything else is
acknowledged and ignored.

## 3. Restart

Next reads env at boot, so `bun --bun next dev` has to be restarted after
editing `.env.local`. If the payment panel still says card payment is not
switched on, that is why.

---

## Running it end to end

Take a booking through `/tours`, then on the booking page:

| Card | What it proves |
| --- | --- |
| `4242 4242 4242 4242` | The ordinary path. Any future expiry, any CVC. |
| `4000 0025 0000 3155` | 3-D Secure. Stripe shows an authentication step. |
| `4000 0000 0000 9995` | Declined for insufficient funds — the booking must stay unpaid and the seats stay held. |
| `4000 0000 0000 0341` | Attaches, then fails when charged. |

After a successful payment, check in Supabase:

```sql
select reference, status, amount_paid_cents, balance_cents from bookings
 order by created_at desc limit 1;

select kind, amount_cents, status, provider_ref, processor_fee_cents
  from payments order by created_at desc limit 3;

select capacity, seats_booked, seats_held from departures
 where id = (select departure_id from bookings order by created_at desc limit 1);
```

What should be true:

- `status` is `confirmed` after a deposit, `paid_in_full` after the whole amount.
- `seats_booked` has gone **up** and `seats_held` has gone **down** by the same
  number. That conversion happens on the first successful payment and nowhere
  else — availability has never been decremented by anything short of money
  arriving.
- `processor_fee_cents` is populated. §4.6 needs it for the revenue share and it
  cannot be recovered later without a round trip per booking.

Then prove redelivery is safe, which is the property that matters most:

```
stripe events resend evt_...      # the id from `stripe listen` output
```

Nothing should change. One payment row, one balance, seats unmoved.

---

## Going live

When Empiria hands over owner access to their account:

1. Swap `sk_test_…` for `sk_live_…`.
2. Add a webhook endpoint on the **live** account and take its signing secret —
   the test one will not verify live events.
3. Set `NEXT_PUBLIC_TOUR_URL` to the real domain. Stripe returns travellers
   there, and localhost detection only applies in development.

**Worth deciding deliberately:** §3.6(c) of the development agreement makes a
single live booking constitute Acceptance. Take the first real payment when you
intend that, not by accident during a demo.

---

## How it is put together

- **Hosted Checkout**, not an embedded element. For a TICO-regulated seller
  that is the smaller PCI surface — no card detail reaches this application, in
  the browser or on the server — and 3-D Secure, wallets and receipts come with
  it rather than being ours to get wrong.
- **One line item**, labelled with the tour and the booking reference. Stripe
  cannot express our already-computed tax or a negative promotion line without
  Stripe Tax and coupons, and half-itemising would produce a receipt that
  disagrees with the booking page. The Part D breakdown lives on the booking,
  the page and the confirmation email.
- **The session expires with the seats.** An abandoned tab cannot be paid an
  hour later against inventory somebody else now holds.
- **`record_payment` is idempotent** on `(provider, provider_ref)`, from
  migration 0002's unique index. Stripe redelivers; a redelivered event records
  nothing twice.
- **Refunds** are recorded as negative payments, so the status follows from the
  resulting balance rather than from which button was pressed.
