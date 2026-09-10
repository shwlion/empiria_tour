import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import { getPostBySlug } from '@/lib/blog';
import { getPackageCardById, getDefaultCurrency } from '@/lib/catalogue';
import TourCard from '@/components/tours/TourCard';
import { renderBlogMarkdown } from '@/lib/blogMarkdown';
import { absoluteUrl, buildBlogPostingJsonLd, buildBreadcrumbJsonLd } from '@/lib/seo';

export const revalidate = 300;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  // Metadata for something that 404s would be metadata for a page nobody can
  // read; the route itself refuses below.
  if (!post) return { title: 'Not found — Empiria Tours' };

  const url = absoluteUrl(`/blog/${post.slug}`);
  return {
    title: `${post.title} — Empiria Tours`,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      authors: [post.author.name],
      ...(post.heroImage ? { images: [{ url: absoluteUrl(post.heroImage) }] } : {}),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  // A draft, an unpublished post and a slug that never existed are all the
  // same answer. Anything else confirms to a stranger that a post exists.
  if (!post) notFound();

  // The related tour, if the author linked one. Unpublishing the tour makes
  // this null rather than a dead card.
  const related = post.packageId
    ? await getPackageCardById(post.packageId, await getDefaultCurrency())
    : null;

  return (
    <>
      <Navbar />

      <JsonLd
        data={[
          buildBlogPostingJsonLd({
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt,
            authorName: post.author.name,
            publishedAt: post.publishedAt,
            heroImage: post.heroImage,
          }),
          buildBreadcrumbJsonLd([
            { name: 'Journal', url: absoluteUrl('/blog') },
            { name: post.title, url: absoluteUrl(`/blog/${post.slug}`) },
          ]),
        ]}
      />

      <main className="mx-auto w-full max-w-3xl px-5 py-16">
        <p className="font-mono text-[11px] uppercase tracking-label text-stone">
          <Link href="/blog" className="ul text-ember">
            Journal
          </Link>
          {post.publishedAt && <> · {formatDate(post.publishedAt)}</>}
        </p>

        <h1 className="mt-3 font-display text-[32px] font-extrabold leading-tight tracking-tight text-ink sm:text-[40px]">
          {post.title}
        </h1>

        <p className="mt-3 font-mono text-[12px] uppercase tracking-label text-stone">
          By {post.author.name}
        </p>

        {post.heroImage && (
          <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-card">
            <Image
              src={post.heroImage}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              priority
              className="object-cover"
            />
          </div>
        )}

        {/*
          The body. renderBlogMarkdown returns elements we construct — the
          author's string is never inserted as markup. See lib/blogMarkdown.ts.
        */}
        <div className="blog-body mt-10">{renderBlogMarkdown(post.body)}</div>

        {related && (
          <section className="mt-12 border-t border-sand pt-8">
            <p className="font-mono text-[11px] uppercase tracking-label text-ember">
              The trip this is about
            </p>
            <div className="mt-4 max-w-sm">
              <TourCard pkg={related} />
            </div>
          </section>
        )}

        {post.destination && (
          <p className="mt-12 border-t border-sand pt-6 text-[15px] text-stone">
            More trips in{' '}
            <Link
              href={`/tours?destination=${encodeURIComponent(post.destination.path)}`}
              className="ul text-ember"
            >
              {post.destination.name}
            </Link>
            .
          </p>
        )}
      </main>

      <Footer />
    </>
  );
}
