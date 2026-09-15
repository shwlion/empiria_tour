import { escapeHtml } from './render.ts';

/**
 * The frame every email is sent in.
 *
 * A template in the console is the *message* — a greeting, the facts, what
 * happens next. This is everything around it: the wordmark, the card, the
 * type, and the footer that names the seller. Part D wants the seller
 * identified on everything that goes out, and putting that in one place means
 * nobody writing the fourteenth template has to remember it, and a
 * registration number entered next month appears on every send after.
 *
 * Email is the one place the web's last twenty years did not happen. Layout is
 * tables, styling is inline, widths are attributes, and a `<style>` block is a
 * courtesy some clients extend and others do not — so it carries only the
 * narrow-screen padding and nothing the email needs to be readable. The card
 * is a 100%-wide table capped by max-width, not a 600px one allowed to shrink:
 * a table never goes below its stated width, and on a phone that stretched the
 * viewport to fit it instead. Outlook ignores max-width, so a conditional
 * table holds it at 600 there. The
 * palette is the storefront's: the brand orange as one hairline accent, the
 * warm ink for text, the stone grey for the quiet lines.
 *
 * Pure, like the renderer it wraps: no database, no clock. The seller's
 * details come in as an argument, read by the caller from Platform settings at
 * send time rather than frozen into the row at enqueue.
 */

export type Brand = {
  /** The seller, from Platform settings. Empty strings are simply not shown. */
  companyName: string;
  registrationNumber: string;
  contactEmail: string;
  /** Absolute. Email clients do not resolve relative URLs against anything. */
  logoUrl: string;
  siteUrl: string;
};

export type Wrapped = { html: string; text: string | null };

const WIDTH = 600;
const FONT = "Figtree, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const INK = '#1d2321';
const STONE = '#6a716d';
const GROUND = '#f4f2ee';
const FLAME = '#f15a29';

/** The first line of the message, for the inbox preview under the subject. */
function preheader(text: string | null): string {
  if (!text) return '';
  const line = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!line) return '';
  // Hidden from the body, read by the inbox. The trailing nbsps stop clients
  // pulling the footer into the preview after a short first line.
  return (
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${GROUND};">` +
    escapeHtml(line) +
    '&nbsp;'.repeat(40) +
    '</div>'
  );
}

function footerLines(brand: Brand): { html: string; text: string } {
  const parts: string[] = [];
  const textParts: string[] = [];
  if (brand.companyName) {
    parts.push(escapeHtml(brand.companyName));
    textParts.push(brand.companyName);
  }
  if (brand.registrationNumber) {
    parts.push(`TICO registration no. ${escapeHtml(brand.registrationNumber)}`);
    textParts.push(`TICO registration no. ${brand.registrationNumber}`);
  }
  const first = parts.join(' &middot; ');
  const contact: string[] = [];
  const textContact: string[] = [];
  if (brand.contactEmail) {
    contact.push(
      `<a href="mailto:${escapeHtml(brand.contactEmail)}" style="color:${STONE};text-decoration:underline;">${escapeHtml(brand.contactEmail)}</a>`
    );
    textContact.push(brand.contactEmail);
  }
  const host = brand.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  contact.push(`<a href="${escapeHtml(brand.siteUrl)}" style="color:${STONE};text-decoration:underline;">${escapeHtml(host)}</a>`);
  textContact.push(brand.siteUrl);

  const html = [first, contact.join(' &middot; ')].filter(Boolean).join('<br>');
  const text = [textParts.join(' · '), textContact.join(' · ')].filter(Boolean).join('\n');
  return { html, text };
}

export function wrapEmail(rendered: { html: string; text: string | null }, brand: Brand): Wrapped {
  const footer = footerLines(brand);
  const alt = brand.companyName || 'Empiria Tours';

  const html = `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title></title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; }
  @media only screen and (max-width: 640px) {
    .frame { padding:16px 10px !important; }
    .card { padding:28px 22px 26px !important; border-radius:14px !important; }
    .head { padding:4px 4px 16px !important; }
    .foot { padding:20px 4px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${GROUND};">
${preheader(rendered.text)}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${GROUND}" style="background:${GROUND};">
  <tr>
    <td align="center" class="frame" style="padding:36px 16px;">
      <!--[if mso]><table role="presentation" width="${WIDTH}" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:${WIDTH}px;">
        <tr>
          <td class="head" align="left" style="padding:0 8px 20px;">
            <a href="${escapeHtml(brand.siteUrl)}" style="text-decoration:none;display:inline-block;">
              <img src="${escapeHtml(brand.logoUrl)}" height="34" alt="${escapeHtml(alt)}" style="height:34px;width:auto;display:block;">
            </a>
          </td>
        </tr>
        <tr>
          <td class="card" bgcolor="#ffffff" style="background:#ffffff;border-radius:18px;padding:40px 40px 36px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
            <div style="height:3px;width:44px;background:${FLAME};border-radius:2px;margin:0 0 26px;font-size:0;line-height:0;">&nbsp;</div>
${rendered.html}
          </td>
        </tr>
        <tr>
          <td class="foot" align="left" style="padding:22px 8px 0;font-family:${FONT};font-size:12.5px;line-height:1.65;color:${STONE};">
            ${footer.html}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = rendered.text ? `${rendered.text.trimEnd()}\n\n—\n${footer.text}\n` : null;
  return { html, text };
}
