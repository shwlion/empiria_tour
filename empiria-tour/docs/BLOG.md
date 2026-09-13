# The blog

**Status: built, 9 September 2026.** Design approved 5 September 2026 and
implemented against it; this is now the subsystem document. Where the code and
this file disagree the code is right — say so here rather than leaving it.

**One change from the design:** the schema is migration **0013**, not 0012.
`0012_showcase_cards.sql` took that number in between. Two smaller additions the
design did not name: `blog_posts_unpublished_by_idx`, because 0011's rule is
that *every* foreign key is covered; and a `freeze_blog_slug` trigger, because
"frozen the moment it first publishes" needed something to enforce it, and a
rule that spans two consoles belongs in the database for the same reason
`publish_blog_post` does.

**Contract: outside Exhibit A.** Like the partner dashboard and partner
onboarding, this is a module the agreement does not describe. §1.4 is the
mechanism. Raised before building, not after.

---

## What it is

Partners and Empiria staff write posts about tours and about the countries they
run in. Posts appear at `/blog` on the storefront, linked from the main menu.

Partners publish without review. An administrator sees every post and can take
one down. That is the client's decision, made knowing the alternative: §2.2
makes Empiria the seller and merchant of record under its own TICO
registration, so a partner's false claim sits on Empiria's domain as Empiria's
exposure for as long as it takes somebody to notice. The mitigations that follow
from choosing it are an admin list sorted so new posts surface first, a
one-click unpublish, and a moderation trail that survives the takedown.

---

## Who may do what

| Role | May write | May publish own | May moderate |
| --- | --- | --- | --- |
| `partner` | yes | yes, until an admin takes it down | no |
| `agent` | yes | yes | no |
| `admin` | yes | yes, including anything taken down | yes |
| `traveller`, signed out | no | no | no |

Moderation is `is_admin()`, not `is_staff()`. An agent writes and publishes like
a partner; taking somebody else's work off a regulated seller's site is an
administrator's decision.

A **draft** is visible to its author and to administrators. Nobody else can
reach it, by URL or otherwise — `/blog/[slug]` 404s on anything unpublished, the
same way a booking reference that is not yours 404s rather than confirming it
exists.

## The decisions worth not re-deriving

### Their markup is never rendered as HTML

Nothing in this platform renders stored content as HTML. Policy pages,
disclosure blocks and email bodies are plain text, React-escaped. The only
`dangerouslySetInnerHTML` in the codebase is `JsonLd`, which stringifies an
object we built.

A blog written by partners is the first content on this platform whose author is
not Empiria. Partners are semi-trusted external businesses, and the storefront
shares an origin with the booking flow and the payment pages — so stored HTML
from a partner is a script injection aimed at travellers mid-purchase and at
administrators in the console.

So the body is a **safe Markdown subset**, and `lib/blogMarkdown.ts` parses it
and returns React elements **we** construct. Their string is never inserted as
markup. This is not sanitisation — there is no sanitiser to keep current and no
bypass to discover, because the dangerous path does not exist. It also adds no
dependency, which keeps §5.7 out of it, for the same reason `lib/pdf/` has no
PDF library and the mailer has no SDK.

Supported: `##`/`###` headings, paragraphs, `**bold**`, `*italic*`, `` `code` ``,
`- ` lists, `1. ` lists, `> ` quotes, `---` rules, `[text](url)` links,
`![alt](url)` images.

Rejected rather than escaped: any `[..](..)` whose URL is not `http://`,
`https://` or site-relative becomes plain text — `javascript:` and `data:` never
reach an `href`. Raw HTML in the source is text, not markup. External links get
`rel="nofollow noopener noreferrer"` and `target="_blank"`; internal ones do not.

### Pictures are uploaded, not linked

`next.config.ts` permits remote images from exactly one host,
`**.supabase.co/storage/v1/object/public/**`. A partner pasting a URL from
anywhere else gets a broken image, and widening `remotePatterns` to fix that
would let any site's images render on Empiria's domain.

So pictures are uploaded into a public Supabase Storage bucket, `blog`, under
`<author_id>/<uuid>.<ext>`. Both consoles upload the same way, through a server
action holding the service role — the pattern every other write in this platform
already follows.

Validation, in this order:

1. Size cap, 5 MB, checked before anything is read.
2. Extension and declared content type in `{jpeg, png, webp}`.
3. **Magic bytes**, because the declared content type is supplied by whoever is
   uploading: `FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `RIFF….WEBP` for WebP.
   A file whose bytes disagree with its name is refused.

**SVG is refused deliberately.** It is an image format that can carry script,
and it would be served from the same origin as the booking flow.

A hard delete removes the post's uploaded objects too. An unpublish does not —
the post can come back.

### Slugs are immutable once published

Generated from the title, lowercased, non-alphanumerics collapsed to hyphens,
deduplicated with a numeric suffix. Editable while the post is a draft, frozen
the moment it first publishes: a slug that changes is a link that breaks, and
the people holding that link are the readers the post was written for.

### Unpublishing must stick

Once an administrator takes a post down, its author must not be able to put it
back. `publish_blog_post(p_post, p_actor)` enforces it: a partner may publish
their own post only while `unpublished_by is null`; an administrator may always
publish, and doing so clears the moderation fields. Without this the takedown is
a suggestion.

---

## Schema — migration 0013

```sql
create table public.blog_posts (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  excerpt        text,
  body           text not null default '',      -- safe-markdown source
  hero_image     text,                          -- storage URL
  author_id      uuid not null references public.users(id)        on delete restrict,
  package_id     uuid          references public.packages(id)     on delete set null,
  destination_id uuid          references public.destinations(id) on delete set null,
  status         text not null default 'draft'
                 check (status in ('draft', 'published', 'unpublished')),
  published_at     timestamptz,
  unpublished_by   uuid references public.users(id),
  unpublished_at   timestamptz,
  unpublish_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
```

`author_id` is `on delete restrict` rather than `set null`: a post with no author
is a post nobody is accountable for, and account closure already anonymises the
profile rather than deleting the row.

**Indexes at birth**, not when a linter notices — every foreign key covered, plus
the one the index page actually reads:

```
blog_posts_slug_key            (unique, from the constraint)
blog_posts_live_idx            (status, published_at desc)
blog_posts_author_idx          (author_id)
blog_posts_package_idx         (package_id)
blog_posts_destination_idx     (destination_id)
```

`touch_updated_at()` already exists; attach it.

**RLS mirrors `packages`**, which is the closest analogue — partner-owned,
publicly readable when published:

- One policy, `read published blog posts`, `for select using (status = 'published')`.
- No insert, update or delete policy. Writes are service-role only and scoped in
  application code, exactly as the partner console already scopes tours with
  `getSupabaseAdmin()` and `.eq('partner_id', scope)`.

**One function, not three.** `publish_blog_post(p_post, p_actor)` earns its
existence because its rule spans two codebases: both consoles publish, and "a
partner cannot republish what an administrator took down", written twice in two
TypeScript repos, is the rule that drifts. Same argument as the one pricing
engine. It is `security definer`, `set search_path = public, pg_temp`, and
**revoked from `public`, `anon` and `authenticated` in the migration that
creates it** — 0011 exists because ten functions were not.

Unpublish and delete stay ordinary service-role writes from the admin console.
Each has one caller and guards no invariant a second caller could break, and
0011 is a standing reminder that every RPC is one more place to get grants
wrong.

Storage: bucket `blog`, public read. Object writes are service-role only; no
policy grants `anon` or `authenticated` insert.

Proved in-migration with a `do $$ … $$` harness that raises on failure: the
three functions unreachable by anon and authenticated and reachable by
service_role; every foreign key covered; the read policy present and restricted
to published; a partner unable to publish a post an admin unpublished; the slug
unique constraint rejecting a duplicate. Harness rows deleted before it ends.

**After the migration:** regenerate `lib/database.types.ts` and copy it to all
three repos. It has drifted five times.

---

## Surfaces

### Storefront

**`/blog` is a cinematic scroll story (12 September 2026).** The index is the
"Mostar city" composition — a specification reproduced verbatim in
`app/blog/cinema.css` and `components/blog/CinemaScroll.tsx` — and the
published posts are its slider cards: kicker = publish date, pin = one of the
spec's three icons in rotation, title and excerpt the post's. A card opens the
post at `/blog/[slug]`, which is unchanged. The latest twelve posts feed the
slider; there is no pagination on the index any more. The shell copy is the
spec's Mostar text, hard-coded; an editor for it is a follow-up.


| Route | Notes |
| --- | --- |
| `/blog` | Published only, newest first, **12 per page** — the same page size `searchPackages` defaults to, so the two grids feel like one site. |
| `/blog/[slug]` | `revalidate = 300`, matching the policy pages. 404s unless published, whoever is asking. |

**Excerpt** is authored and optional. Left empty it falls back to the first 160
characters of the body rendered down to plain text, reusing `truncate` and the
same stripping `stripToText` already does for meta descriptions — one definition
of "the short version of this", not two.

**Hero image** is optional. Without one the index card uses the existing
`.img-fallback` treatment that `TourCard` already falls back to, so a post with
no picture looks deliberate rather than broken.

The post page carries the byline, the body, a related-tour card when
`package_id` is set, and a destination link when `destination_id` is. Metadata
and OpenGraph per post; a `BlogPosting` JSON-LD builder joins
`buildEventJsonLd` in `lib/seo.ts`.

**Menu.** `Navbar` currently holds exactly one link, `/tours`. Blog becomes the
second, and the same entry goes in `MobileNav`. Both blog routes join the
sitemap when Part F builds one.

### Partner console

`/dashboard/blog`, `/dashboard/blog/new`, `/dashboard/blog/[id]`, and a sidebar
entry beside "My tours". Lists that partner's posts and no one else's. A post
taken down shows the administrator's reason in the editor rather than failing
quietly, and the publish control is replaced by an explanation.

The package selector offers only that partner's own packages.

### Admin console

`/dashboard/content/blog`, a fourth tab beside Pages, Emails and Disclosures —
content already lives there. Every post by every author, filterable by status,
newest first so a new partner post is the first thing seen.

- **Unpublish** — reason required, reversible, takes it off the site at once.
- **Delete** — confirms, permanent, removes uploaded objects with it.

Both write `audit_log`. Unpublish is the primary action; delete is not, because
a post that was false or defamatory is a record you may need after it is gone.

---

## Testing

`lib/blogMarkdown.test.ts`, run with `bun run`, in the harness style of
`lib/pricing.test.ts` and `lib/calendar.test.ts`. Beyond the ordinary cases it
must assert the hostile ones, since the author is not Empiria:

- `<script>alert(1)</script>` in the body renders as visible text.
- `[x](javascript:alert(1))` and `[x](data:text/html,…)` render as text, not links.
- `![x](https://evil.com/a.png)` is refused — off-allowlist host.
- Unbalanced `**`, `[`, `(` do not throw and do not swallow the rest of the post.
- A very long unbroken string does not hang the parser.
- Output contains no `dangerouslySetInnerHTML` path at all.

`lib/blogUpload.test.ts` for the magic-byte check: a PNG renamed `.jpg` is
refused; an SVG is refused whatever it is called; a 6 MB file is refused before
being read.

---

## Build order

Each step leaves the platform working and is worth reviewing on its own. The
riskiest piece is first, on purpose: if the renderer is wrong, everything built
on top of it is wrong too, and it is the one part with an attacker.

1. **`lib/blogMarkdown.ts` and its tests.** Pure, no database, no UI. Provable
   before anything can call it.
2. **Migration 0013** — table, indexes, RLS, `publish_blog_post`, the storage
   bucket, and the harness. Then regenerate `database.types.ts` into all three
   repos.
3. **Upload** — `lib/blogUpload.ts`, magic-byte validation and its tests.
4. **Storefront** — `/blog`, `/blog/[slug]`, JSON-LD, and the menu link. At this
   point the blog is real but only administrators can fill it, through the
   console built next.
5. **Admin console** — authoring, plus the moderation list, unpublish and delete.
6. **Partner console** — authoring for partners, and the takedown notice.

Partners come last deliberately: it is the step that introduces an untrusted
author, and by then the renderer has tests, the takedown path exists, and an
administrator already has somewhere to act.

## Out of scope, deliberately

Comments, categories and tags, scheduled publishing, revision history, RSS,
multi-author posts, translation, and a rich-text WYSIWYG. Each is a feature, not
a detail, and none was asked for. Listing them here is cheaper than discovering
later that somebody assumed one.

---

## Related

- `docs/PROJECT.md` — where this sits against everything else.
- `CLAUDE.md` — migration conventions, and the §5.7 rule this design obeys.
