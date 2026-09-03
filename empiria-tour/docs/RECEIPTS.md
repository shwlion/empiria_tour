# Receipts

`GET /booking/[reference]/receipt.pdf` — the Part D breakdown as a document a
traveller can keep. Add `?download=1` for a save-file rather than a preview.

```bash
bun run lib/pdf/receipt.test.ts     # 67 assertions, no database needed
```

## Nothing is stored

There is no bucket, no `storage_path`, and no row in `booking_documents`.

Every fact a receipt states is already immutable. `booking_price_lines` are
written once by `create_booking`; `payments` is append-only and `record_payment`
refuses a duplicate `provider_ref`; `booking_acknowledgements.body_snapshot`
already freezes the disclosure wording at the moment the traveller agreed. A
stored PDF would be a second copy of things that cannot change — and it would
cost a migration, a bucket and an RLS policy to keep it.

So the document is rendered on demand instead, and `renderReceipt` is
**deterministic**: same booking, byte-identical output, asserted in the test.
That equivalence is the whole argument. If it ever stops being true, the case
for not storing goes with it.

`booking_documents` (migration 0002) is therefore still unused. It is the right
table for a supplier voucher or a manually issued invoice — things that are
*not* derivable — and it is deliberately left for those.

**The one thing that genuinely drifts** is the seller's own identity, which is
read live from `platform_settings`. A receipt reprinted after Empiria changes its
registration number would show the new one. Snapshotting those three strings
onto the booking at first payment is the fix, and it is worth doing when there
is something in them to snapshot — today they are all null.

## Dated by the booking, never by the clock

`producedAt` is the last successful payment's timestamp, or the booking's
creation date before any money has arrived. It is what goes in the PDF's
`CreationDate`. Using `new Date()` would make every render differ and quietly
break the property above.

## No dependency

`lib/pdf/writer.ts` is a small PDF 1.4 writer — objects, an xref table, text and
lines. `lib/pdf/widths.ts` carries the Adobe Helvetica metrics and the
Unicode → WinAnsi transcoding.

Same reasoning as `lib/email/mailer.ts` taking Resend over `fetch` rather than
its SDK: §5.7 makes every dependency a licence question somebody has to answer,
and §5.7 already has one open item (`libvips`, via `next/image`). A receipt is
fixed-layout text in two base-14 fonts, so a PDF library would be a megabyte and
an audit to emit a few kilobytes of operators. A real receipt is about 6 KB.

Base-14 Helvetica also means **nothing is embedded** — no font file, no licence
question about the font either, and no way for a reader to substitute a
metric-incompatible face and shift the money column.

What the writer deliberately cannot do: images, embedded fonts, compression,
encryption, annotations. If a receipt ever needs a logo, that is the moment to
reconsider — not before.

### Two things the writer gets right that are easy to get wrong

- **Coordinates are top-down.** PDF's origin is bottom-left and y grows upward;
  every document here is laid out from the top, so `PdfDoc` takes y from the top
  and flips it on the way out. Mixing the conventions is how a receipt prints
  upside down.
- **Footers run after the content.** "Page 1 of 3" cannot be written until the
  last page exists, which is what `setPage` is for. The test asserts the footers
  agree with each other *and* with the number of pages actually written, because
  a stale count is exactly what a footer-first implementation produces.

## Authorisation

`loadReceipt` applies the booking page's rule, not a weaker one: either the
signed-in user owns the booking, or the caller holds the session token that
created it. **A reference alone is not authorisation**, and a reference that
exists but is not yours 404s exactly like one that does not.

The response is `Cache-Control: private, no-store` and `X-Robots-Tag: noindex` —
it is somebody's payment record and must not sit in a shared cache.

## What it says, and what it refuses to say

§2.3 puts legally required wording on Empiria and only the mechanism on
Elevsoft. So the receipt renders what it is given and **states plainly what is
missing** rather than inventing it:

| Source | On the receipt |
| --- | --- |
| `platform_settings.company_name` | The masthead, or "Seller not yet identified" in flame |
| `platform_settings.registration_number` | "Travel registration N", or "…not set" |
| `platform_settings.statutory_notice` | Its own section, verbatim, when present |
| `disclosure_placements` at `receipt` | Verbatim, in `sort_order`, global blocks and this package's |
| `booking_price_lines` | The itemised total, formatted by `lib/money.ts` |

That last row matters: the receipt uses the **same formatter as the booking
page**, because `docs/STRIPE.md` is right that a receipt disagreeing with the
booking page is worse than a terse one. The test asserts it.

A receipt for a booking with no payment says "No payment has been received
against this booking" rather than showing an empty table — but the booking page
only links the PDF once money has actually arrived, on the same reasoning that
took "My bookings" out of the footer.

**Today every one of those content rows is empty.** Five packages are published
and the receipt they would produce names no seller. That is PROJECT.md item 2,
and the receipt makes it visible rather than papering over it.

## Still to do

- **Part C attachment.** `renderReceipt` is pure and takes no viewer, so the
  outbox can attach the same bytes rather than reimplementing anything. Blocked
  on Empiria: it cannot be decided which of the sixteen emails carries a receipt
  while none of them has a body. `sendEmail` would gain an `attachments` array;
  the drainer would need a service-side loader that skips the viewer check.
- **A7.** Listing a traveller's receipts needs `loadReceipt`'s sibling, keyed by
  user rather than by reference and session.
- **The seller-identity snapshot**, once there is an identity to snapshot.
