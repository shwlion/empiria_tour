-- ===========================================================================
-- 0013_blog.sql
--
-- Posts written by partners and Empiria staff, read at /blog on the storefront.
--
-- Numbered 0013 rather than the 0012 docs/BLOG.md reserved: showcase_cards
-- took that number first. The design is otherwise unchanged.
--
-- Partners publish without review, which is the client's decision, made
-- knowing that §2.2 puts Empiria on the hook as seller of record for whatever
-- sits on its domain. What follows from choosing it is here: an admin list
-- sorted so new posts surface first, a one-click takedown, and a moderation
-- trail that survives it.
-- ===========================================================================

create table if not exists public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  title            text not null check (char_length(title) between 1 and 140),
  excerpt          text,
  body             text not null default '',          -- safe-markdown source
  hero_image       text,                              -- storage URL
  -- restrict, not set null: a post with no author is a post nobody is
  -- accountable for, and closing an account anonymises the profile rather
  -- than deleting the row.
  author_id        uuid not null references public.users(id)        on delete restrict,
  package_id       uuid          references public.packages(id)     on delete set null,
  destination_id   uuid          references public.destinations(id) on delete set null,
  status           text not null default 'draft'
                   check (status in ('draft', 'published', 'unpublished')),
  published_at     timestamptz,
  unpublished_by   uuid          references public.users(id)        on delete set null,
  unpublished_at   timestamptz,
  unpublish_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.blog_posts is
  'Posts by partners and staff. Partners publish without review; an administrator can take a post down and the author cannot put it back (publish_blog_post).';

-- Indexes at birth, not when a linter notices. Every foreign key is covered
-- (0011's rule, which is why unpublished_by has one too), plus the one the
-- index page actually reads.
create index if not exists blog_posts_live_idx           on public.blog_posts (status, published_at desc);
create index if not exists blog_posts_author_idx         on public.blog_posts (author_id);
create index if not exists blog_posts_package_idx        on public.blog_posts (package_id);
create index if not exists blog_posts_destination_idx    on public.blog_posts (destination_id);
create index if not exists blog_posts_unpublished_by_idx on public.blog_posts (unpublished_by);

drop trigger if exists touch_blog_posts on public.blog_posts;
create trigger touch_blog_posts
  before update on public.blog_posts
  for each row execute function public.touch_updated_at();

-- ── The slug is frozen once a post has been published ─────────────────────
-- A slug that changes is a link that breaks, and the people holding that link
-- are the readers the post was written for. Enforced here rather than in two
-- consoles, for the same reason publish_blog_post exists.
create or replace function public.freeze_published_blog_slug()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if old.published_at is not null and new.slug is distinct from old.slug then
    raise exception 'blog_posts: the slug is frozen once a post has been published';
  end if;
  return new;
end
$fn$;

drop trigger if exists freeze_blog_slug on public.blog_posts;
create trigger freeze_blog_slug
  before update on public.blog_posts
  for each row execute function public.freeze_published_blog_slug();

-- ── Publishing ────────────────────────────────────────────────────────────
-- One function, and it earns its existence because its rule spans two
-- codebases: both consoles publish, and "a partner cannot republish what an
-- administrator took down" written twice in two TypeScript repos is the rule
-- that drifts. Same argument as the one pricing engine.
--
-- Unpublish and delete stay ordinary service-role writes from the admin
-- console: each has one caller and guards no invariant a second caller could
-- break, and 0011 is a standing reminder that every RPC is one more place to
-- get grants wrong.
create or replace function public.publish_blog_post(p_post uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role   text;
  v_author uuid;
  v_down   uuid;
begin
  select role into v_role from public.users where id = p_actor;
  if v_role is null then
    raise exception 'publish_blog_post: no such actor';
  end if;

  select author_id, unpublished_by
    into v_author, v_down
    from public.blog_posts
   where id = p_post
     for update;
  if not found then
    raise exception 'publish_blog_post: no such post';
  end if;

  -- An administrator may always publish, including something taken down, and
  -- doing so clears the moderation fields.
  if v_role = 'admin' then
    update public.blog_posts
       set status           = 'published',
           published_at     = coalesce(published_at, now()),
           unpublished_by   = null,
           unpublished_at   = null,
           unpublish_reason = null
     where id = p_post;
    return;
  end if;

  if v_role not in ('partner', 'agent') then
    raise exception 'publish_blog_post: role % may not publish', v_role;
  end if;
  if v_author is distinct from p_actor then
    raise exception 'publish_blog_post: a post may only be published by its author';
  end if;
  -- The whole point of the function. Without this the takedown is a suggestion.
  if v_down is not null then
    raise exception 'publish_blog_post: an administrator took this post down';
  end if;

  update public.blog_posts
     set status       = 'published',
         published_at = coalesce(published_at, now())
   where id = p_post;
end
$fn$;

-- Revoke from `public` as well as the two roles: Postgres grants EXECUTE to
-- PUBLIC on every new function, so revoking only anon and authenticated leaves
-- that default grant intact. 0011 exists because ten functions were not.
revoke execute on function public.publish_blog_post(uuid, uuid)      from public, anon, authenticated;
revoke execute on function public.freeze_published_blog_slug()       from public, anon, authenticated;
grant  execute on function public.publish_blog_post(uuid, uuid)      to service_role;
grant  execute on function public.freeze_published_blog_slug()       to service_role;

-- ── RLS mirrors packages: partner-owned, publicly readable when published ──
-- No insert, update or delete policy. Writes are service-role only and scoped
-- in application code, exactly as the partner console already scopes tours.
alter table public.blog_posts enable row level security;
drop policy if exists "read published blog posts" on public.blog_posts;
create policy "read published blog posts" on public.blog_posts
  for select using (status = 'published');

-- ── Storage ───────────────────────────────────────────────────────────────
-- Public read so next/image can fetch it; object writes are service-role only,
-- so no policy here grants anon or authenticated insert.
insert into storage.buckets (id, name, public)
select 'blog', 'blog', true
where not exists (select 1 from storage.buckets where id = 'blog');

-- ── Prove it ──────────────────────────────────────────────────────────────
do $harness$
declare
  v_partner uuid := gen_random_uuid();
  v_admin   uuid;
  v_post    uuid;
  v_missing text;
  v_ok      boolean;
begin
  -- Structure -------------------------------------------------------------
  if not exists (select 1 from pg_tables
                  where schemaname = 'public' and tablename = 'blog_posts' and rowsecurity) then
    raise exception '0013: row level security is not enabled on blog_posts';
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'blog_posts'
                    and policyname = 'read published blog posts'
                    and qual like '%published%') then
    raise exception '0013: the read policy is missing or is not restricted to published';
  end if;

  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'blog_posts' and cmd <> 'SELECT') then
    raise exception '0013: blog_posts has a write policy; writes must be service-role only';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'touch_blog_posts') then
    raise exception '0013: the updated_at trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'freeze_blog_slug') then
    raise exception '0013: the slug-freeze trigger is missing';
  end if;

  -- Every foreign key covered by an index (0011's rule).
  select string_agg(a.attname, ', ') into v_missing
    from pg_constraint c
    join unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.blog_posts'::regclass
     and c.contype = 'f'
     and not exists (
       select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indkey[0] = a.attnum
     );
  if v_missing is not null then
    raise exception '0013: foreign keys without a covering index: %', v_missing;
  end if;

  -- Grants ----------------------------------------------------------------
  if has_function_privilege('anon', 'public.publish_blog_post(uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.publish_blog_post(uuid, uuid)', 'execute') then
    raise exception '0013: publish_blog_post is reachable by anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.publish_blog_post(uuid, uuid)', 'execute') then
    raise exception '0013: service_role cannot call publish_blog_post';
  end if;

  if not exists (select 1 from storage.buckets where id = 'blog' and public) then
    raise exception '0013: the blog storage bucket is missing or is not public';
  end if;

  -- Behaviour -------------------------------------------------------------
  select id into v_admin from public.users where role = 'admin' and status = 'active' limit 1;
  if v_admin is null then
    raise exception '0013: no active administrator to prove moderation against';
  end if;

  -- A throwaway partner. on_auth_user_created makes the public.users row.
  insert into auth.users (id, email) values (v_partner, v_partner || '@harness.invalid');
  update public.users set role = 'partner' where id = v_partner;

  insert into public.blog_posts (slug, title, body, author_id)
       values ('harness-0013-' || v_partner, 'Harness', 'body', v_partner)
    returning id into v_post;

  -- The author publishes their own draft.
  perform public.publish_blog_post(v_post, v_partner);
  if (select status from public.blog_posts where id = v_post) <> 'published' then
    raise exception '0013: an author could not publish their own draft';
  end if;

  -- An administrator takes it down.
  update public.blog_posts
     set status = 'unpublished', unpublished_by = v_admin,
         unpublished_at = now(), unpublish_reason = 'harness'
   where id = v_post;

  -- The author must not be able to put it back.
  v_ok := false;
  begin
    perform public.publish_blog_post(v_post, v_partner);
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '0013: a partner republished a post an administrator took down';
  end if;

  -- The administrator may, and doing so clears the moderation fields.
  perform public.publish_blog_post(v_post, v_admin);
  if (select unpublished_by from public.blog_posts where id = v_post) is not null then
    raise exception '0013: an admin publish did not clear the moderation fields';
  end if;

  -- The slug is frozen now that it has been published.
  v_ok := false;
  begin
    update public.blog_posts set slug = 'harness-0013-moved' where id = v_post;
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '0013: the slug of a published post could be changed';
  end if;

  -- Slugs are unique.
  v_ok := false;
  begin
    insert into public.blog_posts (slug, title, body, author_id)
         values ('harness-0013-' || v_partner, 'Duplicate', '', v_partner);
  exception when unique_violation then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '0013: a duplicate slug was accepted';
  end if;

  -- Clean up. The post goes first: author_id is on delete restrict.
  delete from public.blog_posts where author_id = v_partner;
  delete from auth.users where id = v_partner;

  if exists (select 1 from public.blog_posts where slug like 'harness-0013-%') then
    raise exception '0013: harness rows were left behind';
  end if;

  raise notice '0013: blog_posts, publish_blog_post and the blog bucket are in place';
end
$harness$;
