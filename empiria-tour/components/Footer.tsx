import Link from "next/link";
import Image from "next/image";
import { APEX_URL, ORGANIZER_URL, PROFILE_URL } from "@/lib/urls";

export default function Footer() {
  return (
    <footer className="relative z-40 w-full bg-ink px-6 pt-16 pb-8 text-bone md:px-16">
      {/* The route signature closes the page as a flame rule. */}
      <div className="mx-auto max-w-7xl">
        <div className="route-rule mb-14 h-px w-full opacity-70" aria-hidden="true" />

        <div className="flex flex-col items-start justify-between gap-12 border-b border-white/10 pb-12 md:flex-row">
          {/* Brand */}
          <div className="flex max-w-xs flex-col gap-4">
            <Image
              src="/logo-white.png"
              alt="Empiria"
              width={1507}
              height={522}
              className="h-10 w-auto"
            />
            <p className="text-[14px] leading-relaxed text-bone/60">
              A ticketing platform dedicated to promoting and celebrating
              cultures. Embracing cultures, we embrace diversity &amp; inclusion.
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-10 md:grid-cols-3">
            {/* Company */}
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[10px] uppercase tracking-label text-flame">
                Company
              </span>
              {[
                { label: "About", href: `${APEX_URL}/about` },
                { label: "Cultures", href: `${APEX_URL}/#cultures` },
                { label: "Contact", href: `${APEX_URL}/contact` },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] text-bone/60 transition-colors hover:text-bone"
                >
                  {item.label}
                </a>
              ))}
            </div>

            {/* Platform */}
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[10px] uppercase tracking-label text-flame">
                Platform
              </span>
              <Link href="/" className="text-[14px] text-bone/60 transition-colors hover:text-bone">
                Browse Tours
              </Link>
              <a href={ORGANIZER_URL} className="text-[14px] text-bone/60 transition-colors hover:text-bone">
                Host a Tour
              </a>
              <a href={PROFILE_URL} className="text-[14px] text-bone/60 transition-colors hover:text-bone">
                My Tickets
              </a>
            </div>

            {/* Connect */}
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[10px] uppercase tracking-label text-flame">
                Connect
              </span>
              {[
                { label: "Facebook", href: "https://www.facebook.com/empiriaculturalevents/" },
                { label: "Instagram", href: "https://www.instagram.com/empiriaevents/" },
                { label: "Twitter / X", href: "https://x.com/Empiria_world" },
                { label: "Contact", href: `${APEX_URL}/contact` },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] text-bone/60 transition-colors hover:text-bone"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Colophon */}
        <div className="flex flex-col items-center justify-between gap-4 pt-8 font-mono text-[11px] uppercase tracking-wide text-bone/45 md:flex-row">
          <span>&copy; {new Date().getFullYear()} Empiria Solutions Inc. &middot; 43.6532&deg; N</span>
          <div className="flex gap-6">
            <a href={`${APEX_URL}/privacy`} className="transition-colors hover:text-bone">
              Privacy
            </a>
            <a href={`${APEX_URL}/terms`} className="transition-colors hover:text-bone">
              Terms
            </a>
            <a href={`${APEX_URL}/accessibility`} className="transition-colors hover:text-bone">
              Accessibility
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
