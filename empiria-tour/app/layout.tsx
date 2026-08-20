import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from "next/font/google";
import JsonLd from "@/components/JsonLd";
import Analytics from "@/components/Analytics";
import ConsentBanner from "@/components/ConsentBanner";
import { TOUR_URL } from "@/lib/urls";
import { absoluteUrl } from "@/lib/seo";
import "./globals.css";

// Display: expressive grotesque for headlines and the wordmark.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

// Body: a quiet, warm humanist grotesque (not the shop's Geist).
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

// Utility: the mono "wayfinding" layer — labels, dates, cities, coordinates.
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const SITE_NAME = "Empiria Tours";
const SITE_DESCRIPTION =
  "Guided small-group trips through Greece, Italy and beyond. Real departures, all-in pricing, no guesswork.";

export const metadata: Metadata = {
  metadataBase: new URL(TOUR_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: TOUR_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

// Analytics IDs stay env-gated, and are additionally consent-gated inside
// <Analytics /> — nothing loads until the visitor accepts. GTM takes precedence
// over GA4 (they are mutually exclusive in practice).
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

const siteJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: TOUR_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${TOUR_URL}/tours?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const organizationJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: TOUR_URL,
  logo: absoluteUrl("/logo.png"),
  sameAs: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${bricolage.variable} ${instrumentSans.variable} ${spaceMono.variable} antialiased`}
      >
        <JsonLd data={[siteJsonLd, organizationJsonLd]} />
        {children}
        <ConsentBanner />
        <Analytics gtmId={GTM_ID} gaId={GA_ID} />
      </body>
    </html>
  );
}
