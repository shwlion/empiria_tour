// Cross-app base URLs (empiria.events). NEXT_PUBLIC_* env vars override at
// BUILD time; the defaults below are the live production domains.
//
// TOUR_URL is this app's own canonical base. The others point at the sibling
// Empiria apps so shared UI (footer, user menu) can deep-link across them.
export const APEX_URL = process.env.NEXT_PUBLIC_APEX_URL || "https://home.empiria.events";
export const TOUR_URL = process.env.NEXT_PUBLIC_TOUR_URL || "https://tour.empiria.events";
export const SHOP_URL = process.env.NEXT_PUBLIC_SHOP_URL || "https://shop.empiria.events";
export const ORGANIZER_URL = process.env.NEXT_PUBLIC_ORGANIZER_URL || "https://organizer.empiria.events";
export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL || "https://admins.empiria.events";
// Where an approved tour operator signs in. Linked from /partners, because the
// invitation email is otherwise the only route back and nobody keeps those.
//
// Note there is deliberately NO public link to the Tours admin console. Staff
// know where it is; putting it in a footer tells every visitor and every
// scanner too, and buys nothing.
export const PARTNER_URL = process.env.NEXT_PUBLIC_PARTNER_URL || "https://partners.empiria.events";
// The Tours admin console. Distinct from ADMIN_URL above, which is the Events
// platform's admin — the two are separate applications and conflating them
// would send staff to the wrong console. Surfaced only inside the account menu
// of somebody who already has a staff role, never in public chrome.
export const TOUR_ADMIN_URL =
  process.env.NEXT_PUBLIC_TOUR_ADMIN_URL || "https://tour-admin.empiria.events";
export const PROFILE_URL = process.env.NEXT_PUBLIC_PROFILE_URL || "https://profile.empiria.events";
export const COOKIE_DOMAIN =
  "." + new URL(APEX_URL).hostname.replace(/^(www|home)\./, "");

/**
 * Reduce a `next` parameter to a path this site is willing to send somebody to.
 *
 * `next` arrives in a query string, so it arrives from whoever wrote the link.
 * Returns a same-origin path, or "/" when the value is missing, unparseable, or
 * points anywhere else.
 *
 * The guard this replaced was `startsWith('/') && !startsWith('//')`, which
 * reads as airtight and is not. Browsers normalise a backslash to a slash in a
 * special scheme, so `/\evil.com` satisfied both halves and then resolved to
 * https://evil.com/. Tab, CR and LF are stripped before parsing and get through
 * the same way. That is why this parses instead of blacklisting: the set of
 * characters a URL parser folds into a slash is not a list that stays complete,
 * and the next one added to it would reopen this silently.
 *
 * Comparing `url.origin` rather than the hostname is deliberate — it pins the
 * scheme and port too, so an http:// downgrade of our own host is refused along
 * with `https://tour.empiria.events@evil.com`, where the real host is the one
 * after the @.
 *
 * Both call sites use this: `/login` before router.push, and `/auth/callback`
 * before redirecting. Neither is trusted to be the only one.
 */
export function safeNextPath(raw: string | null | undefined, origin: string): string {
  if (!raw) return "/";
  try {
    const base = new URL(origin);
    const target = new URL(raw, base);
    if (target.origin !== base.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    // An origin we cannot parse, or a value no relative resolution accepts.
    return "/";
  }
}
