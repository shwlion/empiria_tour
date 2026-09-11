-- The last three of Exhibit A B6's seven static pages.
--
-- B6 names them: terms of service, privacy policy, booking conditions,
-- cancellation policy, about, contact, FAQ. Four have had rows since 0002.
-- These are the other three.
--
-- Seeded with the same placeholder the first four carry, and deliberately so.
-- A page with no row calls notFound(), and the footer links all seven — so the
-- alternative to a placeholder here is three broken links, which this project
-- has already decided is worse than an absent one. The placeholder is also
-- what puts them in the console's content-gap report as work Empiria owes
-- under §2.1(e); a missing row would report there as a fault in the platform
-- instead of as a page nobody has written yet.
--
-- No DDL, no function, no grant. Idempotent: re-running changes nothing, and
-- in particular cannot overwrite wording Empiria has since supplied.

insert into public.static_pages (slug, title, body)
values
  ('about',   'About Empiria Tours',        'PLACEHOLDER — supplied by Empiria under 2.1(e).'),
  ('contact', 'Contact us',                 'PLACEHOLDER — supplied by Empiria under 2.1(e).'),
  ('faq',     'Frequently asked questions', 'PLACEHOLDER — supplied by Empiria under 2.1(e).')
on conflict (slug) do nothing;

-- All seven exist, or this migration did not do its job.
do $$
declare
  missing text[];
begin
  select array_agg(s)
    into missing
    from unnest(array[
      'terms', 'privacy', 'booking-conditions', 'cancellation',
      'about', 'contact', 'faq'
    ]) as s
   where not exists (select 1 from public.static_pages p where p.slug = s);

  if missing is not null then
    raise exception 'static_pages is missing %, so those routes still 404', missing;
  end if;
end $$;
