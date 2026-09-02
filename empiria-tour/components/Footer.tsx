import Link from 'next/link';
import Image from 'next/image';
import { getDisclosures, getPlatformSettings } from '@/lib/catalogue';

/**
 * A1 global footer.
 *
 * Exhibit A requires this to carry the company details, the travel-industry
 * registration number and any prescribed statutory notice, contact details, and
 * links to terms, privacy, booking conditions and the cancellation policy —
 * sitewide, on every page.
 *
 * All of it comes from `platform_settings` and the disclosure-block library
 * rather than being written into this file, so Empiria can change the
 * registration number or the statutory wording without a code change. That is
 * the Part D mechanism: Elevsoft owns the placement, Empiria owns the words.
 */

const SOCIAL_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  twitter: 'X',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export default async function Footer() {
  const [settings, notices] = await Promise.all([
    getPlatformSettings(),
    getDisclosures('footer'),
  ]);

  const social = Object.entries(
    (settings?.social_links as Record<string, string> | null) ?? {}
  ).filter(([, url]) => typeof url === 'string' && url.length > 0);

  const linkClass = 'text-[14px] text-bone/60 transition-colors hover:text-bone';
  const headClass = 'font-mono text-[10px] uppercase tracking-label text-flame';

  return (
    <footer className="relative z-40 w-full bg-ink px-6 pt-16 pb-8 text-bone md:px-16">
      <div className="mx-auto max-w-7xl">
        {/* The route signature closes the page as a flame rule. */}
        <div className="route-rule mb-14 h-px w-full opacity-70" aria-hidden="true" />

        <div className="flex flex-col items-start justify-between gap-12 border-b border-white/10 pb-12 md:flex-row">
          {/* Brand + the identity Part D wants visible */}
          <div className="flex max-w-sm flex-col gap-4">
            <Image
              src="/logo-white.png"
              alt="Empiria Tours"
              width={1507}
              height={522}
              className="h-10 w-auto"
            />
            <p className="text-[14px] leading-relaxed text-bone/60">
              Small-group journeys, booked properly. Real departures, all-in pricing,
              and someone to talk to when plans change.
            </p>

            {(settings?.company_name || settings?.registration_number) && (
              <p className="font-mono text-[11px] leading-relaxed text-bone/50">
                {settings?.company_name}
                {settings?.company_name && settings?.registration_number && ' · '}
                {settings?.registration_number && `Registration ${settings.registration_number}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
            {/* Travel */}
            <div className="flex flex-col gap-3">
              <span className={headClass}>Travel</span>
              <Link href="/tours" className={linkClass}>All tours</Link>
              <Link href="/tours?sort=departure" className={linkClass}>Departing soon</Link>
            </div>

            {/* Operators, not travellers. A separate door rather than a choice
                at signup: the role is granted after review, never selected. */}
            <div className="flex flex-col gap-3">
              <span className={headClass}>Operators</span>
              <Link href="/partners" className={linkClass}>Sell your tours</Link>
            </div>

            {/* The legal set A1 asks for by name */}
            <div className="flex flex-col gap-3">
              <span className={headClass}>Booking</span>
              <Link href="/booking-conditions" className={linkClass}>Booking conditions</Link>
              <Link href="/cancellation" className={linkClass}>Cancellation policy</Link>
              <Link href="/terms" className={linkClass}>Terms of service</Link>
              <Link href="/privacy" className={linkClass}>Privacy policy</Link>
            </div>

            {/* Contact + social, both configurable */}
            <div className="flex flex-col gap-3">
              <span className={headClass}>Contact</span>
              {settings?.contact_email && (
                <a href={`mailto:${settings.contact_email}`} className={linkClass}>
                  {settings.contact_email}
                </a>
              )}
              {settings?.contact_phone && (
                <a href={`tel:${settings.contact_phone.replace(/[^\d+]/g, '')}`} className={linkClass}>
                  {settings.contact_phone}
                </a>
              )}
              {social.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {SOCIAL_LABELS[key] ?? key}
                </a>
              ))}
              {!settings?.contact_email && !settings?.contact_phone && social.length === 0 && (
                <span className="text-[14px] text-bone/40">Contact details to follow.</span>
              )}
            </div>
          </div>
        </div>

        {/* Statutory notice + any footer-placed disclosure block (Part D) */}
        {(settings?.statutory_notice || notices.length > 0) && (
          <div className="flex flex-col gap-2 border-b border-white/10 py-6">
            {settings?.statutory_notice && (
              <p className="text-[12.5px] leading-relaxed text-bone/50">
                {settings.statutory_notice}
              </p>
            )}
            {notices.map((n) => (
              <p key={n.id} className="text-[12.5px] leading-relaxed text-bone/50">
                {n.body}
              </p>
            ))}
          </div>
        )}

        {/* Colophon */}
        <div className="flex flex-col items-center justify-between gap-4 pt-8 font-mono text-[11px] uppercase tracking-wide text-bone/45 md:flex-row">
          <span>
            &copy; {new Date().getFullYear()} {settings?.company_name ?? 'Empiria'} &middot; 43.6532&deg; N
          </span>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-bone">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-bone">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
