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
export const PROFILE_URL = process.env.NEXT_PUBLIC_PROFILE_URL || "https://profile.empiria.events";
export const COOKIE_DOMAIN =
  "." + new URL(APEX_URL).hostname.replace(/^(www|home)\./, "");
