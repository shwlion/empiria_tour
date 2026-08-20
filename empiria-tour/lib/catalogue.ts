/**
 * Catalogue data access — Exhibit A Part A (A2 home, A3 results, A4 detail).
 *
 * SERVER ONLY. Every function here goes through `getSupabaseAdmin()`, which
 * holds the service-role key and bypasses RLS. Importing this into a client
 * component would ship that key to the browser, so the guard below fails loudly
 * rather than silently.
 *
 * Currency: Empiria charges in the currency the traveller is browsing in, so
 * every price-bearing function takes one. Prices are *set* per currency in
 * `package_prices` / `departure_prices` — never converted at read time.
 *
 * Degrades to empty results when Supabase is unconfigured, so the design shell
 * still renders (the pattern this repo already uses in `app/page.tsx`).
 */

import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/catalogue.ts is server-only: it uses the service-role key. ' +
      'Fetch in a server component and pass the result down as props.'
  );
}

// ─── Types ────────────────────────────────────────────────────────────────

export type Currency = string; // constrained by public.currencies at the DB level

export type CurrencyOption = {
  code: Currency;
  symbol: string;
  name: string;
  isDefault: boolean;
};

export type PackageCard = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  heroImage: string | null;
  durationLabel: string | null;
  durationDays: number | null;
  isFeatured: boolean;
  tags: string[];
  destination: { name: string; path: string } | null;
  category: { name: string; slug: string } | null;
  /** Lowest per-person price across bookable departures, in `currency`. */
  fromPriceCents: number | null;
  currency: Currency;
  nextDepartureOn: string | null;
  bookableDepartures: number;
};

export type DepartureOption = {
  id: string;
  startsOn: string;
  endsOn: string | null;
  startTime: string | null;
  seatsAvailable: number;
  capacity: number;
  status: string;
  pricePerPersonCents: number | null;
  childPriceCents: number | null;
};

export type PackageDetail = PackageCard & {
  overview: string | null;
  meetingPoint: string | null;
  minimumAge: number | null;
  physicalRating: string | null;
  whatToBring: string | null;
  gallery: string[];
  latitude: number | null;
  longitude: number | null;
  singleSupplementCents: number;
  childPriceCents: number | null;
  infantPriceCents: number | null;
  deposit: { type: string; value: number; balanceDueDaysBefore: number };
  itinerary: { position: number; title: string; description: string | null; image: string | null }[];
  included: string[];
  excluded: string[];
  roomTypes: {
    id: string; name: string; description: string | null;
    priceAdjustmentCents: number; maxOccupancy: number; isDefault: boolean;
  }[];
  extras: {
    id: string; name: string; description: string | null;
    priceCents: number; per: string; capacity: number | null;
  }[];
  customFields: {
    id: string; key: string; label: string; fieldType: string;
    options: string[] | null; isRequired: boolean; appliesTo: string;
  }[];
  departures: DepartureOption[];
  cancellationPolicy: { name: string; body: string } | null;
};

export type DestinationNode = {
  id: string;
  slug: string;
  name: string;
  path: string;
  description: string | null;
  heroImage: string | null;
  children: DestinationNode[];
};

export type SearchFilters = {
  destinationPath?: string;
  categorySlug?: string;
  collectionSlug?: string;
  /** Inclusive departure window, ISO dates. */
  departingFrom?: string;
  departingTo?: string;
  travellers?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  minDurationDays?: number;
  maxDurationDays?: number;
  query?: string;
  sort?: 'price_asc' | 'price_desc' | 'departure' | 'duration' | 'popularity';
  page?: number;
  perPage?: number;
};

export type SearchResult = {
  packages: PackageCard[];
  total: number;
  page: number;
  perPage: number;
};

const EMPTY_SEARCH: SearchResult = { packages: [], total: 0, page: 1, perPage: 12 };

// ─── Row helpers ──────────────────────────────────────────────────────────

type Tables = Database['public']['Tables'];
type PackageRow = Tables['packages']['Row'];
type FromPriceRow = Database['public']['Views']['package_from_price']['Row'];

type ItineraryRow  = Tables['itinerary_days']['Row'];
type InclusionRow  = Tables['package_inclusions']['Row'];
type RoomTypeRow   = Tables['room_types']['Row'];
type ExtraRow      = Tables['package_extras']['Row'];
type CustomFieldRow = Tables['package_custom_fields']['Row'];
type PolicyRow     = Tables['policies']['Row'];
type BlockRow      = Tables['disclosure_blocks']['Row'];

/** Shape of the A4 detail query, including everything embedded by CARD_SELECT + children. */
type PackageDetailRow = PackageRow & {
  destinations: { name: string; path: string } | null;
  categories: { name: string; slug: string } | null;
  policies: Pick<PolicyRow, 'name' | 'body'> | null;
  itinerary_days: Pick<ItineraryRow, 'position' | 'title' | 'description' | 'image'>[] | null;
  package_inclusions: Pick<InclusionRow, 'kind' | 'position' | 'text'>[] | null;
  room_types: RoomTypeRow[] | null;
  package_extras: ExtraRow[] | null;
  package_custom_fields: CustomFieldRow[] | null;
};

type PackageWithRelations = PackageRow & {
  destinations: { name: string; path: string } | null;
  categories: { name: string; slug: string } | null;
};

function toCard(
  p: PackageWithRelations,
  price: Pick<FromPriceRow, 'from_price_cents' | 'next_departure_on' | 'bookable_departures'> | undefined,
  currency: Currency
): PackageCard {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    heroImage: p.hero_image,
    durationLabel: p.duration_label,
    durationDays: p.duration_days,
    isFeatured: p.is_featured,
    tags: p.tags ?? [],
    destination: p.destinations ? { name: p.destinations.name, path: p.destinations.path } : null,
    category: p.categories ? { name: p.categories.name, slug: p.categories.slug } : null,
    fromPriceCents: price?.from_price_cents ?? null,
    currency,
    nextDepartureOn: price?.next_departure_on ?? null,
    bookableDepartures: price?.bookable_departures ?? 0,
  };
}

const CARD_SELECT = `
  id, slug, title, summary, hero_image, duration_label, duration_days,
  is_featured, tags, currency,
  destinations!packages_destination_id_fkey ( name, path ),
  categories!packages_category_id_fkey ( name, slug )
` as const;

// ─── Reference data ───────────────────────────────────────────────────────

export const getCurrencies = cache(async (): Promise<CurrencyOption[]> => {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from('currencies')
    .select('code, symbol, name, is_default')
    .eq('status', 'active')
    .order('sort_order');
  if (error || !data) return [];
  return data.map((c) => ({
    code: c.code, symbol: c.symbol, name: c.name, isDefault: c.is_default,
  }));
});

export const getDefaultCurrency = cache(async (): Promise<Currency> => {
  const all = await getCurrencies();
  return all.find((c) => c.isDefault)?.code ?? 'CAD';
});

/** The full published destination tree, assembled from the flat table. */
export const getDestinationTree = cache(async (): Promise<DestinationNode[]> => {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data, error } = await db
    .from('destinations')
    .select('id, parent_id, slug, name, path, description, hero_image')
    .eq('status', 'published')
    .order('sort_order');
  if (error || !data) return [];

  const byId = new Map<string, DestinationNode>();
  for (const d of data) {
    byId.set(d.id, {
      id: d.id, slug: d.slug, name: d.name, path: d.path,
      description: d.description, heroImage: d.hero_image, children: [],
    });
  }
  const roots: DestinationNode[] = [];
  for (const d of data) {
    const node = byId.get(d.id)!;
    const parent = d.parent_id ? byId.get(d.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
});

export const getDestinationByPath = cache(async (path: string) => {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from('destinations')
    .select('id, slug, name, path, description, hero_image, meta_title, meta_description')
    .eq('path', path)
    .eq('status', 'published')
    .maybeSingle();
  if (error) return null;
  return data;
});

export const getCollections = cache(async () => {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from('collections')
    .select('id, slug, name, description, hero_image')
    .eq('status', 'published')
    .order('sort_order');
  return data ?? [];
});

export const getCategories = cache(async () => {
  const db = getSupabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from('categories')
    .select('id, slug, name, description')
    .eq('status', 'published')
    .order('sort_order');
  return data ?? [];
});

// ─── A2: home and discovery ───────────────────────────────────────────────

export async function getFeaturedPackages(currency: Currency, limit = 6): Promise<PackageCard[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const { data: rows, error } = await db
    .from('packages')
    .select(CARD_SELECT)
    .eq('status', 'published')
    .eq('is_featured', true)
    .limit(limit);
  if (error || !rows?.length) return [];

  const prices = await fetchPrices(db, rows.map((r) => r.id), currency);
  return (rows as unknown as PackageWithRelations[]).map((r) => toCard(r, prices.get(r.id), currency));
}

/**
 * Destination tiles for the home page: image, name, package count, from-price.
 * Counts roll up — Greece includes everything under `greece/`.
 */
export async function getDestinationTiles(currency: Currency, limit = 8) {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const [{ data: dests }, { data: pkgs }] = await Promise.all([
    db.from('destinations')
      .select('id, slug, name, path, description, hero_image')
      .eq('status', 'published').order('sort_order'),
    db.from('packages')
      .select('id, destinations!packages_destination_id_fkey ( path )')
      .eq('status', 'published'),
  ]);
  if (!dests?.length) return [];

  const prices = await fetchPrices(db, (pkgs ?? []).map((p) => p.id), currency);

  return dests
    .map((d) => {
      const inHere = (pkgs ?? []).filter((p) => {
        const path = (p as unknown as { destinations: { path: string } | null }).destinations?.path;
        return path === d.path || path?.startsWith(`${d.path}/`);
      });
      const from = inHere
        .map((p) => prices.get(p.id)?.from_price_cents ?? null)
        .filter((n): n is number => n !== null);
      return {
        id: d.id, slug: d.slug, name: d.name, path: d.path,
        description: d.description, heroImage: d.hero_image,
        packageCount: inHere.length,
        fromPriceCents: from.length ? Math.min(...from) : null,
        currency,
      };
    })
    .filter((d) => d.packageCount > 0)
    .slice(0, limit);
}

// ─── A3: search and results ───────────────────────────────────────────────

/**
 * Filtered, sorted, paginated package search.
 *
 * Runs as two or three round trips rather than one SQL statement, because the
 * from-price lives in a view and availability lives in `departures`. That is
 * fine for a catalogue of tens-to-hundreds of packages: the filtering happens
 * in Postgres, and only the final sort and slice happen here. If the catalogue
 * ever reaches the low thousands, move this to a single `search_packages()`
 * database function — the shape of the return value would not change.
 */
export async function searchPackages(
  filters: SearchFilters,
  currency: Currency
): Promise<SearchResult> {
  const db = getSupabaseAdmin();
  if (!db) return EMPTY_SEARCH;

  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(48, Math.max(1, filters.perPage ?? 12));

  // 1 ── Narrow by departure window and party size, if either was asked for.
  let idsFromDepartures: Set<string> | null = null;
  if (filters.departingFrom || filters.departingTo || filters.travellers) {
    let q = db
      .from('departures')
      .select('package_id, starts_on, capacity, seats_booked, seats_held')
      .eq('status', 'open')
      .gte('starts_on', filters.departingFrom ?? new Date().toISOString().slice(0, 10));
    if (filters.departingTo) q = q.lte('starts_on', filters.departingTo);

    const { data: deps } = await q;
    const need = filters.travellers ?? 1;
    idsFromDepartures = new Set(
      (deps ?? [])
        .filter((d) => d.capacity - d.seats_booked - d.seats_held >= need)
        .map((d) => d.package_id)
    );
    if (idsFromDepartures.size === 0) return { ...EMPTY_SEARCH, page, perPage };
  }

  // 2 ── Narrow by collection, which is a join table.
  let idsFromCollection: Set<string> | null = null;
  if (filters.collectionSlug) {
    const { data } = await db
      .from('package_collections')
      .select('package_id, collections!inner ( slug )')
      .eq('collections.slug', filters.collectionSlug);
    idsFromCollection = new Set((data ?? []).map((r) => r.package_id));
    if (idsFromCollection.size === 0) return { ...EMPTY_SEARCH, page, perPage };
  }

  // 3 ── The main query, with everything Postgres can filter directly.
  let q = db.from('packages').select(CARD_SELECT).eq('status', 'published');

  // Destination and category are filtered in step 4, not here. A PostgREST
  // filter on an embedded resource (`categories.slug`) does NOT drop the parent
  // row unless the embed is declared `!inner` — it just nulls the embed out. The
  // shape that looks like it filters and quietly does not is worse than an
  // explicit pass over the results, so the pass is where it happens.
  if (filters.minDurationDays) q = q.gte('duration_days', filters.minDurationDays);
  if (filters.maxDurationDays) q = q.lte('duration_days', filters.maxDurationDays);
  if (filters.query) {
    const term = filters.query.replace(/[%,()]/g, '');
    q = q.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
  }

  const candidateIds = intersect(idsFromDepartures, idsFromCollection);
  if (candidateIds) q = q.in('id', [...candidateIds]);

  const { data: rows, error } = await q;
  if (error || !rows?.length) return { ...EMPTY_SEARCH, page, perPage };

  // 4 ── Attach prices, then apply the price filter and the sort.
  const prices = await fetchPrices(db, rows.map((r) => r.id), currency);

  let cards = (rows as unknown as PackageWithRelations[])
    .map((r) => toCard(r, prices.get(r.id), currency))
    // A package with no price in this currency cannot be sold in it.
    .filter((c) => c.fromPriceCents !== null);

  if (filters.destinationPath) {
    // Roll up: 'greece' matches greece and everything beneath it.
    cards = cards.filter(
      (c) =>
        c.destination?.path === filters.destinationPath ||
        c.destination?.path.startsWith(`${filters.destinationPath}/`)
    );
  }
  if (filters.categorySlug) cards = cards.filter((c) => c.category?.slug === filters.categorySlug);
  if (filters.minPriceCents != null) cards = cards.filter((c) => c.fromPriceCents! >= filters.minPriceCents!);
  if (filters.maxPriceCents != null) cards = cards.filter((c) => c.fromPriceCents! <= filters.maxPriceCents!);

  cards.sort(comparator(filters.sort ?? 'popularity'));

  const total = cards.length;
  const start = (page - 1) * perPage;
  return { packages: cards.slice(start, start + perPage), total, page, perPage };
}

function comparator(sort: NonNullable<SearchFilters['sort']>) {
  return (a: PackageCard, b: PackageCard) => {
    switch (sort) {
      case 'price_asc':  return (a.fromPriceCents ?? 0) - (b.fromPriceCents ?? 0);
      case 'price_desc': return (b.fromPriceCents ?? 0) - (a.fromPriceCents ?? 0);
      case 'duration':   return (a.durationDays ?? 0) - (b.durationDays ?? 0);
      case 'departure':
        return (a.nextDepartureOn ?? '9999').localeCompare(b.nextDepartureOn ?? '9999');
      case 'popularity':
      default:
        // No booking history yet, so featured first then soonest away.
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return (a.nextDepartureOn ?? '9999').localeCompare(b.nextDepartureOn ?? '9999');
    }
  };
}

function intersect(a: Set<string> | null, b: Set<string> | null): Set<string> | null {
  if (!a) return b;
  if (!b) return a;
  return new Set([...a].filter((x) => b.has(x)));
}

// ─── A4: package detail ───────────────────────────────────────────────────

export async function getPackageBySlug(
  slug: string,
  currency: Currency
): Promise<PackageDetail | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;

  const { data: pkg, error } = await db
    .from('packages')
    .select(`
      *,
      destinations!packages_destination_id_fkey ( name, path ),
      categories!packages_category_id_fkey ( name, slug ),
      policies!packages_cancellation_policy_fk ( name, body ),
      itinerary_days ( position, title, description, image ),
      package_inclusions ( kind, position, text ),
      room_types ( id, name, description, price_adjustment_cents, max_occupancy, is_default, sort_order ),
      package_extras ( id, name, description, price_cents, per, capacity, status, sort_order ),
      package_custom_fields ( id, key, label, field_type, options, is_required, applies_to, sort_order )
    `)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error || !pkg) return null;

  const p = pkg as unknown as PackageDetailRow;

  const [prices, departures, currencyPrice] = await Promise.all([
    fetchPrices(db, [p.id], currency),
    getDeparturesForPackage(p.id, currency),
    db.from('package_prices')
      .select('base_price_cents, child_price_cents, infant_price_cents, single_supplement_cents')
      .eq('package_id', p.id).eq('currency', currency).maybeSingle(),
  ]);

  const card = toCard(p, prices.get(p.id), currency);
  const inclusions = p.package_inclusions ?? [];
  const byKind = (kind: string) =>
    inclusions.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position).map((i) => i.text);

  return {
    ...card,
    overview: p.overview,
    meetingPoint: p.meeting_point,
    minimumAge: p.minimum_age,
    physicalRating: p.physical_rating,
    whatToBring: p.what_to_bring,
    gallery: p.gallery ?? [],
    latitude: p.latitude,
    longitude: p.longitude,
    singleSupplementCents:
      currencyPrice.data?.single_supplement_cents ?? p.single_supplement_cents ?? 0,
    childPriceCents: currencyPrice.data?.child_price_cents ?? null,
    infantPriceCents: currencyPrice.data?.infant_price_cents ?? null,
    deposit: {
      type: p.deposit_type,
      value: p.deposit_value,
      balanceDueDaysBefore: p.balance_due_days_before,
    },
    itinerary: (p.itinerary_days ?? []).slice().sort((a, b) => a.position - b.position),
    included: byKind('included'),
    excluded: byKind('excluded'),
    roomTypes: (p.room_types ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({
        id: r.id, name: r.name, description: r.description,
        priceAdjustmentCents: r.price_adjustment_cents,
        maxOccupancy: r.max_occupancy, isDefault: r.is_default,
      })),
    extras: (p.package_extras ?? [])
      .filter((e) => e.status === 'active')
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => ({
        id: e.id, name: e.name, description: e.description,
        priceCents: e.price_cents, per: e.per, capacity: e.capacity,
      })),
    customFields: (p.package_custom_fields ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        id: f.id, key: f.key, label: f.label, fieldType: f.field_type,
        options: f.options, isRequired: f.is_required, appliesTo: f.applies_to,
      })),
    departures,
    cancellationPolicy: p.policies ? { name: p.policies.name, body: p.policies.body } : null,
  };
}

/**
 * Bookable departures with the price in the requested currency.
 * A4 requires sold-out, closed and past departures to be shown as unavailable
 * rather than hidden, so those are returned with `seatsAvailable: 0`.
 */
export async function getDeparturesForPackage(
  packageId: string,
  currency: Currency
): Promise<DepartureOption[]> {
  const db = getSupabaseAdmin();
  if (!db) return [];

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: deps }, { data: overrides }, { data: pkgPrice }] = await Promise.all([
    db.from('departures')
      .select('id, starts_on, ends_on, start_time, capacity, seats_booked, seats_held, status, sales_close_at')
      .eq('package_id', packageId)
      .gte('starts_on', today)
      .order('starts_on'),
    db.from('departure_prices')
      .select('departure_id, base_price_cents, child_price_cents')
      .eq('currency', currency),
    db.from('package_prices')
      .select('base_price_cents, child_price_cents')
      .eq('package_id', packageId).eq('currency', currency).maybeSingle(),
  ]);
  if (!deps?.length) return [];

  const overrideBy = new Map((overrides ?? []).map((o) => [o.departure_id, o]));

  return deps.map((d) => {
    const o = overrideBy.get(d.id);
    const closed =
      d.status !== 'open' ||
      (d.sales_close_at != null && new Date(d.sales_close_at) < new Date());
    return {
      id: d.id,
      startsOn: d.starts_on,
      endsOn: d.ends_on,
      startTime: d.start_time,
      capacity: d.capacity,
      seatsAvailable: closed
        ? 0
        : Math.max(d.capacity - d.seats_booked - d.seats_held, 0),
      status: closed && d.status === 'open' ? 'closed' : d.status,
      pricePerPersonCents: o?.base_price_cents ?? pkgPrice?.base_price_cents ?? null,
      childPriceCents: o?.child_price_cents ?? pkgPrice?.child_price_cents ?? null,
    };
  });
}

// ─── A1: shell, settings and disclosures ──────────────────────────────────

export const getPlatformSettings = cache(async () => {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from('platform_settings')
    .select('company_name, registration_number, statutory_notice, contact_email, contact_phone, contact_address, default_currency, social_links')
    .maybeSingle();
  return data;
});

/** Part D: the named blocks assigned to a placement, global ones plus per-package. */
export async function getDisclosures(placement: string, packageId?: string) {
  const db = getSupabaseAdmin();
  if (!db) return [];
  let q = db
    .from('disclosure_placements')
    .select('sort_order, package_id, disclosure_blocks!inner ( id, slug, name, body, requires_acknowledgement, status )')
    .eq('placement', placement)
    .eq('disclosure_blocks.status', 'active');
  q = packageId ? q.or(`package_id.is.null,package_id.eq.${packageId}`) : q.is('package_id', null);

  type PlacementRow = {
    disclosure_blocks: Pick<BlockRow, 'id' | 'slug' | 'name' | 'body' | 'requires_acknowledgement'>;
  };

  const { data } = await q.order('sort_order');
  return ((data ?? []) as unknown as PlacementRow[]).map((r) => {
    const b = r.disclosure_blocks;
    return {
      id: b.id, slug: b.slug, name: b.name, body: b.body,
      requiresAcknowledgement: b.requires_acknowledgement,
    };
  });
}

export const getStaticPage = cache(async (slug: string) => {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const { data } = await db
    .from('static_pages')
    .select('slug, title, body, meta_title, meta_description')
    .eq('slug', slug)
    .maybeSingle();
  return data;
});

// ─── Internals ────────────────────────────────────────────────────────────

type PriceRow = Pick<FromPriceRow, 'package_id' | 'from_price_cents' | 'next_departure_on' | 'bookable_departures'>;

/** From-prices for a set of packages in one currency, keyed by package id. */
async function fetchPrices(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  packageIds: string[],
  currency: Currency
): Promise<Map<string, PriceRow>> {
  if (packageIds.length === 0) return new Map();
  const { data } = await db
    .from('package_from_price')
    .select('package_id, from_price_cents, next_departure_on, bookable_departures')
    .eq('currency', currency)
    .in('package_id', packageIds);
  return new Map((data ?? []).filter((r) => r.package_id).map((r) => [r.package_id as string, r as PriceRow]));
}

// Money formatting lives in lib/money.ts — it must be importable from client
// components, which cannot import anything from this server-only module.
