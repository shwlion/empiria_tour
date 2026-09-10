-- ===========================================================================
-- 0012_showcase_cards.sql
--
-- The four illustrative postcards on the landing page.
--
-- These are NOT inventory. Each says what a trip could be — a title, a mood
-- line, a sentence and a photograph — and deliberately carries no dates, seats
-- or prices, so nothing here can ever disagree with `departures`. The wording
-- and imagery are Empiria's under §2.1; the seed rows below are Elevsoft's
-- stand-ins, like the rest of seed.sql, and are meant to be replaced from the
-- console rather than by another migration.
-- ===========================================================================

create table if not exists public.showcase_cards (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 60),
  kicker       text not null default '' check (char_length(kicker) <= 40),    -- 'Islands · Slow travel'
  description  text not null check (char_length(description) <= 140),
  image_url    text not null,
  image_alt    text not null default '',
  link_url     text not null default '/tours' check (link_url ~ '^/[^/]'),  -- a storefront path, never a host
  sort_order   int  not null default 0,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id) on delete set null
);

comment on table public.showcase_cards is
  'Landing-page postcards. Illustrative, not inventory: no dates, seats or prices. Content is Empiria''s (§2.1); rows are edited in the console.';

-- Every foreign key gets its covering index (0011's rule), and the storefront
-- reads "published, in order", so that pair is the index it wants.
create index if not exists showcase_cards_updated_by_idx on public.showcase_cards (updated_by);
create index if not exists showcase_cards_published_idx  on public.showcase_cards (status, sort_order);

drop trigger if exists touch_showcase_cards on public.showcase_cards;
create trigger touch_showcase_cards
  before update on public.showcase_cards
  for each row execute function public.touch_updated_at();

-- Anyone may read what is published; nobody writes through PostgREST. The
-- console writes as service_role, which is where the role check lives (0002).
alter table public.showcase_cards enable row level security;
drop policy if exists "read published showcase cards" on public.showcase_cards;
create policy "read published showcase cards" on public.showcase_cards
  for select using (status = 'published');

-- Placeholders, only while the table is empty: re-running this never
-- resurrects a card Empiria has deleted.
insert into public.showcase_cards (title, kicker, description, image_url, image_alt, sort_order, status)
select v.* from (values
  ('Cyclades by sail',             'Islands · Slow travel',     'Island hopping the quiet way. Small coves, local tavernas, clear water.',                '/showcase/cyclades.jpg',     'Whitewashed houses above the Aegean',          1, 'published'),
  ('Tuscany, slowly',              'Countryside · Food & wine', 'Hill towns, long lunches, olive oil, and nowhere to be by nine.',                        '/showcase/tuscany.jpg',      'Florence''s cathedral dome above the rooftops', 2, 'published'),
  ('Cinque Terre on foot',         'Coast · Walking',           'Village to village along the cliff paths, with a swim at the end of each day.',         '/showcase/cinque-terre.jpg', 'Manarola''s houses stacked above the sea',      3, 'published'),
  ('Athens and the ancient south', 'Ancient sites · History',   'Temples at first light, tavernas at dusk, and the slow road to Nafplio.',               '/showcase/athens.jpg',       'The Parthenon against a pale sky',             4, 'published')
) as v(title, kicker, description, image_url, image_alt, sort_order, status)
where not exists (select 1 from public.showcase_cards);

-- Prove it, the way 0010 did.
do $$
declare v_n int;
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'showcase_cards' and rowsecurity) then
    raise exception '0012: row level security is not enabled on showcase_cards';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'showcase_cards' and policyname = 'read published showcase cards') then
    raise exception '0012: the public read policy is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'touch_showcase_cards') then
    raise exception '0012: the updated_at trigger is missing';
  end if;
  select count(*) into v_n from public.showcase_cards where status = 'published';
  if v_n < 1 then
    raise exception '0012: nothing is published, so the landing page would have no postcards';
  end if;
  raise notice '0012: showcase_cards in place, % published', v_n;
end $$;
