import type { Metadata } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from "next/font/google";
import JsonLd from "@/components/JsonLd";
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

const SITE_DESCRIPTION =
  "Empiria Tour — discover and book guided cultural tours and unforgettable experiences across Canada and beyond.";

export const metadata: Metadata = {
  metadataBase: new URL(TOUR_URL),
  title: {
    default: "Empiria Tour",
    template: "%s · Empiria Tour",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Empiria Tour",
  openGraph: {
    type: "website",
    siteName: "Empiria Tour",
    title: "Empiria Tour",
    description: SITE_DESCRIPTION,
    url: TOUR_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Empiria Tour",
    description: SITE_DESCRIPTION,
  },
};

// Analytics IDs are env-gated: no-op until set in Vercel. GTM takes precedence
// over GA4 (they're mutually exclusive in practice).
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// WebSite + Organization structured data for the tour domain.
const siteJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Empiria Tour",
  url: TOUR_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${TOUR_URL}/?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const organizationJsonLd: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Empiria Tour",
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
      {GTM_ID ? (
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
        </Script>
      ) : GA_ID ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-base" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </>
      ) : null}
      <body
        className={`${bricolage.variable} ${instrumentSans.variable} ${spaceMono.variable} antialiased`}
      >
        {GTM_ID ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        <JsonLd data={[siteJsonLd, organizationJsonLd]} />
        {children}
      </body>
    </html>
  );
}
