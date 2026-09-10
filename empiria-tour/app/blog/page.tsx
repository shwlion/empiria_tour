import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getPublishedPosts } from '@/lib/blog';
import { absoluteUrl } from '@/lib/seo';

// Posts are written and taken down from two consoles, so this page must not be
// frozen at build time. Five minutes matches the policy pages: well inside any
// reasonable correction window, and still served from cache.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Journal — Empiria Tours',
  description: 'Notes on the places we travel, written by the people who run the trips.',
  alternates: { canonical: absoluteUrl('/blog') },
  openGraph: {
    title: 'Journal — Empiria Tours',
    description: 'Notes on the places we travel, written by the people who run the trips.',
    url: absoluteUrl('/blog'),
    type: 'website',
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const requested = Number.parseInt(page ?? '1', 10);
  const { posts, total, page: current, pages } = await getPublishedPosts(
    Number.isFinite(requested) ? requested : 1
  );

  return (
    <>
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-5 py-16">
        <p className="font-mono text-[12px] font-medium uppercase tracking-label text-ember">
          Journal
        </p>
        <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">
          Notes from the road
        </h1>

        {posts.length === 0 ? (
          // An empty journal says so. A grid of nothing reads as a fault.
          <p className="mt-8 text-[15px] leading-relaxed text-stone">
            Nothing published yet. The first posts are being written.
          </p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
              {posts.map((post, i) => (
                <div key={post.id} data-reveal className="h-full">
                  <Link href={`/blog/${post.slug}`} className="group block h-full">
                    <article className="card-hover flex h-full flex-col overflow-hidden rounded-card border border-line bg-bone shadow-lift-card">
                      <div className="relative aspect-[4/3] w-full overflow-hidden">
                        {post.heroImage ? (
                          <Image
                            src={post.heroImage}
                            alt=""
                            fill
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            priority={i < 3}
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          // The same treatment a tour with no photography gets,
                          // so a post without a picture looks deliberate.
                          <div className="img-fallback flex h-full w-full items-center justify-center">
                            <span className="font-mono text-[10px] uppercase tracking-label text-stone/70">
                              Empiria
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <p className="font-mono text-[11px] uppercase tracking-label text-stone">
                          {formatDate(post.publishedAt)}
                        </p>
                        <h2 className="line-clamp-2 font-display text-[17px] font-semibold leading-tight tracking-tight text-ink transition-colors group-hover:text-flame">
                          {post.title}
                        </h2>
                        <p className="line-clamp-3 text-[14px] leading-relaxed text-stone">
                          {post.excerpt}
                        </p>
                        <p className="mt-auto pt-3 font-mono text-[11px] uppercase tracking-label text-stone">
                          {post.author.name}
                        </p>
                      </div>
                    </article>
                  </Link>
                </div>
              ))}
            </div>

            {pages > 1 && (
              <nav
                className="mt-12 flex items-center justify-between border-t border-sand pt-6"
                aria-label="Journal pages"
              >
                <PageLink to={current - 1} disabled={current <= 1}>
                  ← Newer
                </PageLink>
                <p className="font-mono text-[11px] uppercase tracking-label text-stone">
                  Page {current} of {pages} · {total} post{total === 1 ? '' : 's'}
                </p>
                <PageLink to={current + 1} disabled={current >= pages}>
                  Older →
                </PageLink>
              </nav>
            )}
          </>
        )}
      </main>

      <Footer />
    </>
  );
}

/** A disabled page control is text, not a link that goes nowhere. */
function PageLink({
  to,
  disabled,
  children,
}: {
  to: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className = 'font-mono text-[12px] uppercase tracking-label';
  if (disabled) {
    return <span className={`${className} text-stone/40`}>{children}</span>;
  }
  return (
    <Link href={to <= 1 ? '/blog' : `/blog?page=${to}`} className={`${className} ul text-ember`}>
      {children}
    </Link>
  );
}
