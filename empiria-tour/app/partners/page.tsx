import type { Metadata } from 'next';
import ApplyForm from './ApplyForm';
import Reveal from '@/components/home/Reveal';
import { getPlatformSettings } from '@/lib/catalogue';
import { PARTNER_URL } from '@/lib/urls';

export const metadata: Metadata = {
  title: 'Sell your tours with Empiria',
  description:
    'Apply to list your tours on Empiria. We are the seller of record, so we read every application before approving it.',
};

// The page is a form and a promise; neither changes minute to minute, and the
// registration number in the closing note comes from settings.
export const revalidate = 300;

export default async function PartnersPage() {
  const settings = await getPlatformSettings();

  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
      <p className="font-mono text-[11px] uppercase tracking-label text-flame">For tour operators</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-ink sm:text-5xl">
        Sell your tours with Empiria
      </h1>
      <p className="mt-5 max-w-prose text-[17px] leading-relaxed text-stone">
        If you run tours and want them in front of our travellers, tell us about your business. We
        handle the selling — the site, the payment, the receipts, the traveller correspondence — and
        you keep control of your itineraries, your dates and your pricing.
      </p>

      {/*
        A claw rake, purely decorative — hence aria-hidden and focusable=false.
        It fills the gutter beside the ragged right edge of the intro rather
        than sitting centred under it.

        Stroked, not filled: the draw-in below animates stroke-dashoffset, and
        a stroke cannot taper along its length, so the taper is approximated
        by giving each slash its own width. Round caps do the rest.
      */}
      <div className="mt-8 flex justify-end" data-draw>
        <svg
          className="claw"
          viewBox="0 0 148 104"
          width="148"
          height="104"
          aria-hidden="true"
          focusable="false"
        >
          {/*
            Raked right and curved, so it reads as one swipe rather than three
            tally marks: each slash leans ~35 degrees off vertical and bows the
            same way, with the middle one longest and heaviest.
          */}
          <path className="claw__slash" strokeWidth="3" pathLength={1} d="M6 10C26 30 48 54 60 90" />
          <path className="claw__slash" strokeWidth="4.5" pathLength={1} d="M42 2C64 24 88 52 100 98" />
          <path className="claw__slash" strokeWidth="3" pathLength={1} d="M80 10C100 32 120 56 130 88" />
        </svg>
      </div>

      <div className="mt-10 grid gap-6 border-y border-line py-8 sm:grid-cols-3">
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-label text-flame">You keep</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-stone">
            Your itineraries, your departure dates, your prices, and your own dashboard to change
            any of them.
          </p>
        </div>
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-label text-flame">We handle</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-stone">
            Payment, receipts, cancellation terms and the regulatory side. We are the seller of
            record on every booking.
          </p>
        </div>
        <div>
          <h2 className="font-mono text-[10px] uppercase tracking-label text-flame">You see</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-stone">
            Every booking on your tours, and the manifest for each departure — who is coming, what
            they cannot eat, who to call.
          </p>
        </div>
      </div>

      <div className="mt-10 rounded-card border border-line bg-bone p-6">
        <h2 className="font-display text-xl text-ink">How this works</h2>
        <ol className="mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-stone">
          <li className="flex gap-3">
            <span className="font-mono text-[11px] text-flame">01</span>
            <span>You send the form below. It takes a few minutes.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-[11px] text-flame">02</span>
            <span>
              A person at Empiria reads it. We are not approving these automatically — because we
              sell under our own travel registration, we check who we are selling on behalf of. We
              may come back with questions.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono text-[11px] text-flame">03</span>
            <span>
              If we go ahead, you get an invitation to set a password, and your dashboard is
              waiting behind it. Nothing you build is public until you publish it.
            </span>
          </li>
        </ol>
      </div>

      <p className="mt-10 rounded-card border border-line bg-bone px-5 py-4 text-[14px] leading-relaxed text-stone">
        <span className="font-semibold text-ink">Already work with us?</span>{' '}
        <a
          href={`${PARTNER_URL}/dashboard`}
          className="font-semibold text-flame underline underline-offset-4 transition-colors hover:text-ember"
        >
          Sign in to your dashboard
        </a>
        {' '}— your tours, your dates and every booking on them.
      </p>

      <div className="mt-12">
        <h2 className="font-display text-2xl text-ink">Tell us about your business</h2>
        <p className="mb-8 mt-2 max-w-prose text-[15px] leading-relaxed text-stone">
          Everything except your name, company and email is optional — but the more we can see, the
          faster we can decide.
        </p>
        <ApplyForm />
      </div>

      {settings?.registration_number && (
        <p className="mt-12 border-t border-line pt-6 text-[13px] leading-relaxed text-stone">
          {settings.company_name ?? 'Empiria World Inc.'} is registered under travel-industry
          registration number {settings.registration_number}.
        </p>
      )}
      <Reveal />
    </main>
  );
}
