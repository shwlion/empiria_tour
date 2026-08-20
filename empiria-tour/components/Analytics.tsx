'use client';

import Script from 'next/script';
import { useConsent } from '@/lib/consent';

/**
 * Analytics, gated on consent.
 *
 * Previously the GTM and GA4 snippets were rendered straight into the root
 * layout: env-gated, so they no-op'd until an ID was set, but nothing stopped
 * them loading once one was. Part F requires "tracking with consent
 * management", and a banner that appears while the tag has already fired is
 * decoration rather than a control.
 *
 * So the scripts are not rendered at all until `analytics: true` is stored, and
 * they mount immediately when the visitor accepts — the store is subscribed to,
 * so there is no reload between choosing and being counted, and declining in
 * another tab takes effect here too.
 *
 * Declining is durable: nothing loads on this or any later visit until the
 * decision changes. The pre-hydration snapshot is `undefined`, which fails the
 * `=== true` test — so no tag can slip out during the server render either.
 */
export default function Analytics({ gtmId, gaId }: { gtmId?: string; gaId?: string }) {
  const consent = useConsent();

  if (consent?.analytics !== true) return null;

  if (gtmId) {
    return (
      <>
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
      </>
    );
  }

  if (gaId) {
    return (
      <>
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
        <Script id="ga4-base" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
        </Script>
      </>
    );
  }

  return null;
}
