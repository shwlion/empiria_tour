import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { absoluteUrl } from '@/lib/seo';
import { getStaticPage } from '@/lib/catalogue';

/**
 * Shared renderer for the seven static pages Exhibit A B6 names: terms,
 * privacy, booking conditions, cancellation, about, contact and FAQ.
 *
 * The body lives in `static_pages` and is edited in Admin (B6), so these routes
 * are seven thin files pointing at one component rather than seven copies of
 * the same layout. Content is plain text today; when the Admin editor lands it
 * will emit sanitised HTML and this is the single place that changes.
 *
 * `eyebrow` exists because four of the seven are policies and three are not.
 * Labelling the About page "Policy" would be a small lie told on every visit.
 */
export async function policyMetadata(slug: string, fallbackTitle: string): Promise<Metadata> {
    const page = await getStaticPage(slug);
    const title = `${page?.meta_title ?? page?.title ?? fallbackTitle} — Empiria Tours`;
    return {
        title,
        description: page?.meta_description ?? undefined,
        alternates: { canonical: `/${slug}` },
        openGraph: { title, url: absoluteUrl(`/${slug}`), type: 'article' },
    };
}

export default async function PolicyPage({ slug, eyebrow = 'Policy' }: { slug: string; eyebrow?: string }) {
    const page = await getStaticPage(slug);
    if (!page) notFound();

    return (
        <div className="min-h-screen bg-paper font-sans text-ink">
            <Navbar />
            <article className="mx-auto w-full max-w-3xl px-5 py-12">
                <p className="font-mono text-[10px] uppercase tracking-label text-flame">{eyebrow}</p>
                <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
                    {page.title}
                </h1>
                <div className="mt-8 h-px w-full bg-sand" aria-hidden="true" />
                <div className="mt-8 whitespace-pre-line text-[16px] leading-relaxed text-stone">
                    {page.body}
                </div>
            </article>
            <Footer />
        </div>
    );
}
