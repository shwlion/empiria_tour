import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Figtree, Space_Grotesk } from "next/font/google";
import JsonLd from "@/components/JsonLd";
import Analytics from "@/components/Analytics";
import ConsentBanner from "@/components/ConsentBanner";
import { TOUR_URL } from "@/lib/urls";
import { absoluteUrl } from "@/lib/seo";
import "./globals.css";

// Display: a rounded geometric sans for headlines — friendly, not corporate.
// Variable font, so no weight array: every weight ships in one file.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// Body: a soft, open humanist sans that stays legible at 14px.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

// Utility: the "wayfinding" layer — labels, dates, prices, nav links. Not a
// true monospace; globals.css asks it for tabular figures so columns align.
const grotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Load choreography only hides content when JavaScript is actually
            running: the CSS gates every reveal on `html.js`. This must be a
            real synchronous <head> script, not next/script — even with
            `beforeInteractive`, App Router queues inline scripts behind the
            client runtime, so the class would land after first paint and the
            page would flash fully visible before the reveal animations. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body
        className={`${jakarta.variable} ${figtree.variable} ${grotesk.variable} antialiased`}
      >
        <JsonLd data={[siteJsonLd, organizationJsonLd]} />
        {children}
        <ConsentBanner />
        <Analytics gtmId={GTM_ID} gaId={GA_ID} />
      </body>
    </html>
  );
}
