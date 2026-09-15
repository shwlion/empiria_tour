import { wrapEmail, type Brand } from './layout.ts';

/**
 * The frame around every email.
 *
 *   node --experimental-strip-types lib/email/layout.test.ts
 *
 * Pure, like the renderer: no database, no network. What is asserted is what
 * a client would notice — the wordmark, the seller in the footer, the body
 * arriving untouched, and nothing supplied by Settings able to break out of
 * the markup.
 */

let fail = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : `\n        ${detail}`}`);
};

const brand: Brand = {
  companyName: 'Empiria World Inc.',
  registrationNumber: '50012345',
  contactEmail: 'info@empiria.tours',
  logoUrl: 'https://tour.empiria.events/logo.png',
  siteUrl: 'https://tour.empiria.events',
};
const body = { html: '<h1>Hello</h1><p>Body &amp; content</p>', text: 'Hello\n\nBody & content' };

{
  const out = wrapEmail(body, brand);
  ok('is a complete HTML document', out.html.startsWith('<!DOCTYPE html>') && out.html.trimEnd().endsWith('</html>'));
  ok('carries the wordmark at an absolute address', out.html.includes('src="https://tour.empiria.events/logo.png"'));
  ok('the wordmark links to the site', out.html.includes('href="https://tour.empiria.events"'));
  ok('the body arrives untouched', out.html.includes(body.html));
  ok('the footer names the seller', out.html.includes('Empiria World Inc.'));
  ok('the footer carries the TICO number', out.html.includes('TICO registration no. 50012345'));
  ok('the footer links the contact address', out.html.includes('href="mailto:info@empiria.tours"'));
  ok('the footer shows the site as a host, not a URL', out.html.includes('>tour.empiria.events</a>'));
  ok('the inbox preview is the first line of the message', out.html.includes('Hello Body &amp; content'));
  ok('the card is fluid, capped at 600', out.html.includes('width="100%"') && out.html.includes('max-width:600px'));
  ok('Outlook gets a fixed 600 through a conditional', out.html.includes('<!--[if mso]><table') && out.html.includes('width="600"'));
  ok('a narrow-screen rule exists', /@media only screen and \(max-width: 640px\)/.test(out.html));
}

{
  // Text: the message, a rule, then the same seller details.
  const out = wrapEmail(body, brand);
  ok('text keeps the message', out.text?.startsWith('Hello\n\nBody & content') ?? false);
  ok('text footer names the seller and the number', (out.text ?? '').includes('Empiria World Inc. · TICO registration no. 50012345'));
  ok('text footer has the contact and the site', (out.text ?? '').includes('info@empiria.tours · https://tour.empiria.events'));
  ok('no text in, no text out', wrapEmail({ html: '<p>x</p>', text: null }, brand).text === null);
}

{
  // Settings still empty: nothing printed as an empty line, and no "TICO registration no. ".
  const bare = wrapEmail(body, { ...brand, companyName: '', registrationNumber: '', contactEmail: '' });
  ok('an unset seller prints no empty footer line', !bare.html.includes('<br>') || !/foot[^]*?<br>\s*<a/.test(bare.html));
  ok('an unset registration prints no label', !bare.html.includes('TICO registration no.'));
  ok('an unset contact prints no mailto', !bare.html.includes('mailto:'));
  ok('the site link survives on its own', bare.html.includes('>tour.empiria.events</a>'));
  ok('the wordmark alt falls back to the platform name', bare.html.includes('alt="Empiria Tours"'));
}

{
  // Whatever Settings holds is text, never markup.
  const hostile = wrapEmail(body, {
    ...brand,
    companyName: 'Foo & Sons <script>alert(1)</script>',
    registrationNumber: '12"34',
    contactEmail: 'a"b@example.com',
  });
  ok('a seller name cannot inject markup', !hostile.html.includes('<script>') && hostile.html.includes('Foo &amp; Sons &lt;script&gt;'));
  ok('a registration number is escaped', hostile.html.includes('12&quot;34'));
  ok('a contact address is escaped in the href', hostile.html.includes('href="mailto:a&quot;b@example.com"'));
}

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
