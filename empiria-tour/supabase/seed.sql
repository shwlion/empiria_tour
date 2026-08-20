-- ===========================================================================
-- Empiria Tours — PLACEHOLDER catalogue content
-- ===========================================================================
-- This is Elevsoft's stand-in content so the storefront can be built and
-- demonstrated before Empiria delivers the real thing. Under §2.1(a) Empiria
-- supplies all destination, package and itinerary content, imagery and pricing.
-- Everything here is invented and every row is tagged 'seed' so it can be
-- removed in one statement:
--
--     delete from public.packages     where 'seed' = any(tags);
--     delete from public.destinations where slug in ('greece','italy');
--
-- Idempotent: re-running changes nothing.
-- ===========================================================================

-- ── Destinations: country → region → island ───────────────────────────────
insert into public.destinations (slug, name, path, description, status, sort_order) values
  ('greece','Greece','greece',
   'Twelve thousand kilometres of coastline, six thousand islands, and a way of eating dinner at eleven at night that makes perfect sense by the third evening.','published',1),
  ('italy','Italy','italy',
   'The country that treats lunch as a civic institution. Coast roads, hill towns, and an unbroken argument about which region does it best.','published',2)
on conflict (path) do nothing;

insert into public.destinations (slug, name, path, parent_id, description, status, sort_order)
select 'cyclades','Cyclades','greece/cyclades', d.id,
  'The white-and-blue Greece of the imagination, though the reality is browner, steeper and better.','published',1
from public.destinations d where d.path='greece'
on conflict (path) do nothing;

insert into public.destinations (slug, name, path, parent_id, description, status, sort_order)
select 'crete','Crete','greece/crete', d.id,
  'Big enough to have weather of its own. Mountains on one side, Libyan Sea on the other.','published',2
from public.destinations d where d.path='greece'
on conflict (path) do nothing;

insert into public.destinations (slug, name, path, parent_id, description, status, sort_order)
select v.slug, v.name, 'greece/cyclades/'||v.slug, d.id, v.descr, 'published', v.ord
from public.destinations d,
  (values
    ('santorini','Santorini','A drowned volcano people built a town on the rim of. Sunsets are the least of it.',1),
    ('milos',    'Milos',    'Lunar coastline, fishing villages painted the colour of boats, a fraction of the crowds.',2),
    ('naxos',    'Naxos',    'The one that farms. Mountain villages, citrus, and the best beaches in the group.',3)
  ) as v(slug,name,descr,ord)
where d.path='greece/cyclades'
on conflict (path) do nothing;

insert into public.destinations (slug, name, path, parent_id, description, status, sort_order)
select 'amalfi','Amalfi Coast','italy/amalfi', d.id,
  'A road carved into a cliff, and thirteen towns that had no land route to each other until 1853.','published',1
from public.destinations d where d.path='italy'
on conflict (path) do nothing;

-- ── Categories and collections ────────────────────────────────────────────
insert into public.categories (slug, name, description, sort_order) values
  ('island-hopping','Island Hopping','More than one island, ferries included.',1),
  ('culinary',      'Culinary',      'Built around what a place eats.',2),
  ('cultural',      'Cultural',      'Sites, ruins, museums, and someone who can explain them.',3),
  ('family',        'Family',        'Paced for people travelling with children.',4)
on conflict (slug) do nothing;

insert into public.collections (slug, name, description, status, sort_order) values
  ('small-group','Small group','Never more than sixteen travellers.','published',1),
  ('shoulder-season','Shoulder season','May, June, September and October — warm water, half the crowds.','published',2)
on conflict (slug) do nothing;

-- ── Policies and disclosure blocks (WORDING IS PLACEHOLDER) ───────────────
insert into public.policies (slug, name, kind, body, is_default) values
  ('standard-cancellation','Standard cancellation','cancellation',
   'PLACEHOLDER — to be replaced with wording supplied by Empiria under §2.1(e). Free cancellation up to 45 days before departure. 50% refund from 44 to 15 days. No refund within 14 days.', true),
  ('standard-booking-conditions','Standard booking conditions','booking_conditions',
   'PLACEHOLDER — to be replaced with wording supplied by Empiria under §2.1(e).', true)
on conflict (slug) do nothing;

insert into public.disclosure_blocks (slug, name, body, requires_acknowledgement) values
  ('tico-registration','Travel registration notice',
   'PLACEHOLDER — Empiria supplies the registered business name, registration number and any prescribed statutory notice.', false),
  ('all-in-pricing','All-in pricing note',
   'PLACEHOLDER — prices shown include taxes and fees, itemised before payment.', false),
  ('cancellation-ack','Cancellation terms acknowledgement',
   'PLACEHOLDER — I have read and accept the cancellation and refund terms.', true)
on conflict (slug) do nothing;

insert into public.disclosure_placements (block_id, placement, sort_order)
select b.id, v.placement, v.ord
from public.disclosure_blocks b,
  (values ('tico-registration','footer',1),
          ('all-in-pricing','package_page',1),
          ('cancellation-ack','booking_terms',1)) as v(slug,placement,ord)
where b.slug = v.slug
on conflict (block_id, placement, package_id) do nothing;

-- ── Packages ──────────────────────────────────────────────────────────────
insert into public.packages (
  slug, title, destination_id, category_id, tags, summary, overview,
  duration_days, duration_nights, duration_label,
  base_price_cents, child_price_cents, infant_price_cents, single_supplement_cents, currency,
  deposit_type, deposit_value, balance_due_days_before,
  meeting_point, minimum_age, physical_rating, what_to_bring,
  cancellation_policy_id, status, is_featured, meta_title, meta_description)
select v.slug, v.title, d.id, c.id, array['seed', v.tag],
       v.summary, v.overview, v.days, v.nights, v.dlabel,
       v.cad, v.child_cad, 0, v.single_cad, 'CAD',
       'percent', 25, 45,
       v.meet, v.min_age, v.physical, v.bring,
       pol.id, 'published', v.featured, v.title||' — Empiria Tours', v.summary
from (values
  ('cyclades-in-eight','Cyclades in Eight Days','greece/cyclades','island-hopping','island-hopping',
   'Three islands, two ferries, and enough time on each to stop checking the schedule.',
   'Santorini for the caldera and the wine, Naxos for the mountain villages and the swimming, Milos for the coastline that looks like nowhere else in Greece. Ferries between them are part of the trip rather than an interruption — deck seats, coffee, and the Aegean going past.',
   8, 7, '8 days / 7 nights', 215000, 161000, 65000,
   'Santorini (Thira) ferry port, 09:00', 12, 'Moderate — some steep steps and unshaded walking',
   'Sun protection, shoes with grip for volcanic rock, a light layer for ferry decks', true),

  ('crete-end-to-end','Crete End to End','greece/crete','cultural','cultural',
   'Knossos to the Libyan Sea, across the middle of the island rather than around it.',
   'Crete is large enough that most trips only see one end of it. This one crosses: the Minoan palace at Knossos, the Lasithi plateau, a night in a mountain village where dinner is whatever was picked that morning, then down the Samaria gorge to the south coast.',
   9, 8, '9 days / 8 nights', 248000, 186000, 74000,
   'Heraklion airport arrivals hall', 14, 'Challenging — includes a 16km gorge descent',
   'Broken-in walking boots, two litres of water capacity, layers for the plateau', true),

  ('santorini-table','The Santorini Table','greece/cyclades/santorini','culinary','culinary',
   'Four days of eating on a volcano, with the people who grow it.',
   'Assyrtiko vines trained into baskets against the wind, tomatoes that taste of the ash they grow in, and fava that has been made the same way since the Bronze Age. Mornings with growers, afternoons free, evenings at the table.',
   4, 3, '4 days / 3 nights', 138000, 103000, 41000,
   'Fira main square, 10:00', 16, 'Easy — short walks between sites',
   'An appetite, and shoes you can walk a vineyard in', false),

  ('amalfi-slow','The Amalfi Coast, Slowly','italy/amalfi','cultural','cultural',
   'Six days on a coast most people see in one, mostly by boat and on foot.',
   'The coast road is spectacular and exhausting. This trip uses the water instead — ferries and a private boat day — plus the Path of the Gods on foot, which is how the villages connected before the road existed.',
   6, 5, '6 days / 5 nights', 289000, 217000, 87000,
   'Salerno ferry terminal', 12, 'Moderate — one 7km cliff path with 1,500 steps',
   'Walking shoes, swimwear, something smart for Ravello', false),

  ('naxos-family','Naxos for Families','greece/cyclades/naxos','family','family',
   'One island, one base, a week of not packing and unpacking.',
   'Naxos is the Cycladic island that works with children: long shallow beaches, a walkable old town, and mountain villages half an hour inland when everyone has had enough sand. One hotel for the week.',
   7, 6, '7 days / 6 nights', 174000, 87000, 0,
   'Naxos port, on arrival', 0, 'Easy — designed around short days',
   'Sun protection, water shoes for the rocks, patience', false)
) as v(slug,title,dpath,cat,tag,summary,overview,days,nights,dlabel,cad,child_cad,single_cad,meet,min_age,physical,bring,featured)
join public.destinations d on d.path = v.dpath
join public.categories  c on c.slug = v.cat
join public.policies  pol on pol.slug = 'standard-cancellation'
on conflict (slug) do nothing;

-- ── Per-currency prices: real numbers, not conversions ────────────────────
insert into public.package_prices (package_id, currency, base_price_cents, child_price_cents, infant_price_cents, single_supplement_cents)
select p.id, v.cur, v.base, v.child, v.infant, v.single
from (values
  ('cyclades-in-eight','CAD',215000,161000,0, 65000),
  ('cyclades-in-eight','USD',159000,119000,0, 48000),
  ('cyclades-in-eight','EUR',145000,109000,0, 44000),
  ('crete-end-to-end', 'CAD',248000,186000,0, 74000),
  ('crete-end-to-end', 'USD',183000,137000,0, 55000),
  ('crete-end-to-end', 'EUR',167000,125000,0, 50000),
  ('santorini-table',  'CAD',138000,103000,0, 41000),
  ('santorini-table',  'USD',102000, 76000,0, 30000),
  ('santorini-table',  'EUR', 93000, 69000,0, 28000),
  ('amalfi-slow',      'CAD',289000,217000,0, 87000),
  ('amalfi-slow',      'USD',213000,160000,0, 64000),
  ('amalfi-slow',      'EUR',195000,146000,0, 59000),
  ('naxos-family',     'CAD',174000, 87000,0,     0),
  ('naxos-family',     'USD',128000, 64000,0,     0),
  ('naxos-family',     'EUR',117000, 58000,0,     0)
) as v(slug,cur,base,child,infant,single)
join public.packages p on p.slug = v.slug
on conflict (package_id, currency) do nothing;

-- ── Collections ───────────────────────────────────────────────────────────
insert into public.package_collections (package_id, collection_id, sort_order)
select p.id, c.id, 1
from public.packages p, public.collections c
where (p.slug in ('cyclades-in-eight','santorini-table','amalfi-slow') and c.slug = 'small-group')
   or (p.slug in ('crete-end-to-end','naxos-family')                   and c.slug = 'shoulder-season')
on conflict (package_id, collection_id) do nothing;

-- ── Itineraries ───────────────────────────────────────────────────────────
insert into public.itinerary_days (package_id, position, title, description)
select p.id, v.pos, v.title, v.body
from (values
  ('cyclades-in-eight',1,'Arrive Santorini','Met at the port and up to Oia. Nothing scheduled — the caldera does the work.'),
  ('cyclades-in-eight',2,'Caldera and vineyards','Morning on the rim path from Fira to Oia, afternoon with an Assyrtiko grower.'),
  ('cyclades-in-eight',3,'Ferry to Naxos','Mid-morning crossing. Afternoon in the old town, dinner by the Portara.'),
  ('cyclades-in-eight',4,'Mountain villages','Halki, Apeiranthos and the marble quarries. Long lunch in Filoti.'),
  ('cyclades-in-eight',5,'Naxos beaches','Free day. Plaka and Mikri Vigla are twenty minutes away.'),
  ('cyclades-in-eight',6,'Ferry to Milos','Crossing after breakfast. Sarakiniko in the late light.'),
  ('cyclades-in-eight',7,'Milos by boat','Full day circumnavigation — Kleftiko, sea caves, swimming stops.'),
  ('cyclades-in-eight',8,'Departure','Transfer to Milos airport or the Athens ferry.'),
  ('crete-end-to-end', 1,'Arrive Heraklion','Transfer and an evening walk through the Venetian harbour.'),
  ('crete-end-to-end', 2,'Knossos','The palace in the morning before the coaches, museum in the afternoon.'),
  ('crete-end-to-end', 3,'Lasithi plateau','Up through the windmill pass. Night in a village of forty people.'),
  ('crete-end-to-end', 4,'Into the mountains','Walking day on the Katharo plateau, no road for most of it.'),
  ('crete-end-to-end', 5,'West to Chania','Long drive with stops. Two nights on the old harbour.'),
  ('crete-end-to-end', 6,'Chania','Free day, or the Akrotiri monasteries with a guide.'),
  ('crete-end-to-end', 7,'Samaria gorge','Sixteen kilometres, downhill, starting at dawn. Boat out to Sougia.'),
  ('crete-end-to-end', 8,'Libyan Sea','Recovery day on the south coast. Swimming and not much else.'),
  ('crete-end-to-end', 9,'Departure','Transfer to Chania airport.'),
  ('santorini-table',  1,'Arrive and eat','Transfer to Fira and straight to dinner. The introduction is the meal.'),
  ('santorini-table',  2,'Vines and volcanic soil','Morning with a grower in the baskets. Afternoon free.'),
  ('santorini-table',  3,'The old ingredients','Fava, caper leaves, tomatokeftedes. Cooking with a family in Pyrgos.'),
  ('santorini-table',  4,'Departure','Late checkout, transfer when you are ready.'),
  ('amalfi-slow',      1,'Arrive Salerno','Ferry to Amalfi, first evening in the town everyone drives past.'),
  ('amalfi-slow',      2,'Path of the Gods','Bomerano to Nocelle on foot. The 1,500 steps down to Positano are optional.'),
  ('amalfi-slow',      3,'Ravello','Up by minibus, back down on foot through the lemon terraces.'),
  ('amalfi-slow',      4,'By boat','Private boat day — Furore fjord, sea caves, lunch somewhere with no road.'),
  ('amalfi-slow',      5,'Positano','Free day, or the Sentiero degli Dei in reverse for anyone with legs left.'),
  ('amalfi-slow',      6,'Departure','Ferry to Salerno, transfer onward.'),
  ('naxos-family',     1,'Arrive Naxos','Met at the port, ten minutes to the hotel, straight into the sea.'),
  ('naxos-family',     2,'Old town','Kastro and the Portara in the morning, beach after lunch.'),
  ('naxos-family',     3,'Beach day','Plaka. Shallow for two hundred metres.'),
  ('naxos-family',     4,'Inland','Halki, the olive press, and a distillery that makes citron liqueur.'),
  ('naxos-family',     5,'Boat trip','Half day to Koufonisia and back, snorkelling stops.'),
  ('naxos-family',     6,'Free day','Whatever worked best gets repeated.'),
  ('naxos-family',     7,'Departure','Ferry or flight, transfer included.')
) as v(slug,pos,title,body)
join public.packages p on p.slug = v.slug
on conflict (package_id, position) do nothing;

-- ── Inclusions and exclusions ─────────────────────────────────────────────
insert into public.package_inclusions (package_id, kind, position, text)
select p.id, v.kind, v.pos, v.txt
from (values
  ('cyclades-in-eight','included',1,'Seven nights in family-run hotels, breakfast daily'),
  ('cyclades-in-eight','included',2,'All inter-island ferry tickets'),
  ('cyclades-in-eight','included',3,'English-speaking guide throughout'),
  ('cyclades-in-eight','included',4,'Vineyard visit and tasting on Santorini'),
  ('cyclades-in-eight','included',5,'Full-day boat trip around Milos with lunch'),
  ('cyclades-in-eight','excluded',1,'International flights'),
  ('cyclades-in-eight','excluded',2,'Lunches and dinners except where stated'),
  ('cyclades-in-eight','excluded',3,'Travel insurance'),
  ('crete-end-to-end', 'included',1,'Eight nights, breakfast daily, two dinners'),
  ('crete-end-to-end', 'included',2,'Private minibus and driver throughout'),
  ('crete-end-to-end', 'included',3,'Knossos and Heraklion museum entry'),
  ('crete-end-to-end', 'included',4,'Samaria gorge fee and the boat from Agia Roumeli'),
  ('crete-end-to-end', 'excluded',1,'International flights'),
  ('crete-end-to-end', 'excluded',2,'Most lunches and dinners'),
  ('crete-end-to-end', 'excluded',3,'Travel insurance'),
  ('santorini-table',  'included',1,'Three nights with breakfast'),
  ('santorini-table',  'included',2,'All tastings, two cooked dinners, one long lunch'),
  ('santorini-table',  'included',3,'Airport and port transfers'),
  ('santorini-table',  'excluded',1,'Flights and ferries to the island'),
  ('santorini-table',  'excluded',2,'Travel insurance'),
  ('amalfi-slow',      'included',1,'Five nights, breakfast daily'),
  ('amalfi-slow',      'included',2,'Private boat day with skipper and lunch'),
  ('amalfi-slow',      'included',3,'Guided walk on the Path of the Gods'),
  ('amalfi-slow',      'included',4,'All local ferries and transfers'),
  ('amalfi-slow',      'excluded',1,'International flights'),
  ('amalfi-slow',      'excluded',2,'Dinners'),
  ('amalfi-slow',      'excluded',3,'Travel insurance'),
  ('naxos-family',     'included',1,'Six nights in a family room, breakfast daily'),
  ('naxos-family',     'included',2,'Port transfers'),
  ('naxos-family',     'included',3,'Half-day boat trip'),
  ('naxos-family',     'included',4,'Inland day with driver and guide'),
  ('naxos-family',     'excluded',1,'Flights and ferries to Naxos'),
  ('naxos-family',     'excluded',2,'Lunches and dinners'),
  ('naxos-family',     'excluded',3,'Travel insurance')
) as v(slug,kind,pos,txt)
join public.packages p on p.slug = v.slug
where not exists (
  select 1 from public.package_inclusions pi
  where pi.package_id = p.id and pi.kind = v.kind and pi.position = v.pos);

-- ── Room types ────────────────────────────────────────────────────────────
insert into public.room_types (package_id, name, description, price_adjustment_cents, max_occupancy, is_default, sort_order)
select p.id, v.name, v.descr, v.adj, v.occ, v.def, v.ord
from (values
  ('cyclades-in-eight','Twin share','Two single beds, standard rooms.',0,2,true,1),
  ('cyclades-in-eight','Double','One large bed.',0,2,false,2),
  ('cyclades-in-eight','Caldera view','Santorini nights upgraded to a caldera-facing room.',38000,2,false,3),
  ('crete-end-to-end', 'Twin share','Two single beds.',0,2,true,1),
  ('crete-end-to-end', 'Double','One large bed.',0,2,false,2),
  ('santorini-table',  'Double','One large bed, cave-house style.',0,2,true,1),
  ('santorini-table',  'Caldera view','Facing the volcano.',29000,2,false,2),
  ('amalfi-slow',      'Twin share','Two single beds.',0,2,true,1),
  ('amalfi-slow',      'Sea view double','Facing the water.',34000,2,false,2),
  ('naxos-family',     'Family room','One double and two singles.',0,4,true,1),
  ('naxos-family',     'Two connecting rooms','More space, more doors.',42000,4,false,2)
) as v(slug,name,descr,adj,occ,def,ord)
join public.packages p on p.slug = v.slug
where not exists (
  select 1 from public.room_types rt where rt.package_id = p.id and rt.name = v.name);

-- ── Extras ────────────────────────────────────────────────────────────────
insert into public.package_extras (package_id, name, description, price_cents, per, capacity, sort_order)
select p.id, v.name, v.descr, v.cents, v.per, v.cap, v.ord
from (values
  ('cyclades-in-eight','Airport transfer, Santorini','Private car from Thira airport to your hotel.',9500,'booking',null,1),
  ('cyclades-in-eight','Sunset sail, Santorini','Catamaran with dinner on the water. Three hours.',18500,'person',12,2),
  ('crete-end-to-end', 'Airport transfer, Heraklion','Private car on arrival.',8500,'booking',null,1),
  ('crete-end-to-end', 'Trekking poles','Hired for the gorge day.',2500,'person',null,2),
  ('santorini-table',  'Extra night, Fira','One more night with breakfast, before or after.',24000,'booking',null,1),
  ('amalfi-slow',      'Ravello concert ticket','Villa Rufolo terrace, when the season is on.',11000,'person',20,1),
  ('naxos-family',     'Child seat, inland day','Fitted to the minibus.',1500,'person',null,1)
) as v(slug,name,descr,cents,per,cap,ord)
join public.packages p on p.slug = v.slug
where not exists (
  select 1 from public.package_extras pe where pe.package_id = p.id and pe.name = v.name);

-- ── Custom booking fields ─────────────────────────────────────────────────
insert into public.package_custom_fields (package_id, key, label, field_type, options, is_required, applies_to, sort_order)
select p.id, v.key, v.label, v.ftype, v.opts, v.req, v.applies, v.ord
from (values
  ('cyclades-in-eight','ferry_seat','Ferry seating preference','dropdown', array['Inside seat','Deck seat','No preference'], false,'traveller',1),
  ('crete-end-to-end', 'gorge_opt_out','I will skip the Samaria gorge day','checkbox', null::text[], false,'traveller',1),
  ('santorini-table',  'dietary','Anything you cannot eat','textarea', null::text[], true,'traveller',1),
  ('amalfi-slow',      'walk_confidence','Comfort on exposed cliff paths','dropdown', array['Confident','Some concern','Would rather not'], true,'traveller',1),
  ('naxos-family',     'child_ages','Ages of children travelling','text', null::text[], true,'booking',1)
) as v(slug,key,label,ftype,opts,req,applies,ord)
join public.packages p on p.slug = v.slug
on conflict (package_id, key) do nothing;

-- ── Departures: monthly through the 2027 season ───────────────────────────
insert into public.departures (package_id, starts_on, ends_on, capacity, status)
select p.id,
       (date '2027-05-01' + (n * interval '3 weeks'))::date,
       (date '2027-05-01' + (n * interval '3 weeks'))::date + (p.duration_days - 1),
       case p.slug when 'santorini-table' then 12
                   when 'naxos-family'    then 20
                   else 16 end,
       'open'
from public.packages p
cross join generate_series(0, 7) as n
where 'seed' = any(p.tags)
on conflict (package_id, starts_on, start_time) do nothing;

-- Peak-season departures cost more. Set per currency, not converted.
insert into public.departure_prices (departure_id, currency, base_price_cents, child_price_cents)
select d.id, pp.currency,
       (pp.base_price_cents  * 1.18)::int,
       (pp.child_price_cents * 1.18)::int
from public.departures d
join public.packages p       on p.id = d.package_id and 'seed' = any(p.tags)
join public.package_prices pp on pp.package_id = p.id
where extract(month from d.starts_on) in (7, 8)
on conflict (departure_id, currency) do nothing;

-- ── Static pages (PLACEHOLDER) ────────────────────────────────────────────
insert into public.static_pages (slug, title, body) values
  ('terms','Terms of service','PLACEHOLDER — supplied by Empiria under §2.1(e).'),
  ('privacy','Privacy policy','PLACEHOLDER — supplied by Empiria under §2.1(e).'),
  ('booking-conditions','Booking conditions','PLACEHOLDER — supplied by Empiria under §2.1(e).'),
  ('cancellation','Cancellation policy','PLACEHOLDER — supplied by Empiria under §2.1(e).')
on conflict (slug) do nothing;
