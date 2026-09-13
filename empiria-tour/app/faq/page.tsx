import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import JsonLd from '@/components/JsonLd';
import { policyMetadata } from '@/components/PolicyPage';
import { getStaticPage } from '@/lib/catalogue';
import { parseFaq } from '@/lib/faq';
import { renderBlogMarkdown, blogBodyToText } from '@/lib/blogMarkdown';

/**
 * FAQ — one of B6's seven pages, rendered as a list of dropdowns.
 *
 * The questions are the page's body in the console, one `##` line per
 * question (lib/faq.ts), so Empiria edits them without a code change, as B6
 * requires. Each is a native <details>: no JavaScript, keyboard and screen
 * reader behaviour for free, and several can be open at once, which is what
 * somebody comparing two answers wants. Answers go through the journal's
 * renderer, which never turns the author's text into markup.
 *
 * A body with no questions in it — the seed placeholder, or plain prose —
 * renders as the other six pages do. Nothing here can produce an empty page
 * from a page that has words on it.
 */
export const revalidate = 300;

export const generateMetadata = (): Promise<Metadata> => policyMetadata('faq', 'Frequently asked questions');

export default async function FaqPage() {
  const page = await getStaticPage('faq');
  const faq = parseFaq(page?.body);
  const isPlaceholder = /^PLACEHOLDER\b/.test((page?.body ?? '').trim());

  const jsonLd =
    faq.items.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.items.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: { '@type': 'Answer', text: blogBodyToText(item.answer) },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <Navbar />
      {jsonLd && <JsonLd data={jsonLd} />}
      <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-16">
        <p className="font-mono text-[10px] uppercase tracking-label text-flame">Questions</p>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          {page?.title ?? 'Frequently asked questions'}
        </h1>

        {faq.intro && !isPlaceholder && (
          <div className="mt-6 text-[17px] leading-relaxed text-stone">{renderBlogMarkdown(faq.intro)}</div>
        )}

        {faq.items.length > 0 ? (
          <div className="mt-10 divide-y divide-line border-y border-line">
            {faq.items.map((item, i) => (
              <details key={i} className="faq-item group" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left font-display text-[18px] font-semibold leading-snug text-ink [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-stone transition-transform duration-300 group-open:rotate-45 group-open:border-flame group-open:text-flame"
                  >
                    +
                  </span>
                </summary>
                <div className="blog-body faq-answer pb-6 text-[16px]">{renderBlogMarkdown(item.answer)}</div>
              </details>
            ))}
          </div>
        ) : (
          // No questions yet: the page's words, as the other six render them.
          !isPlaceholder && page?.body && (
            <div className="mt-8 whitespace-pre-line text-[16px] leading-relaxed text-stone">{page.body}</div>
          )
        )}

        <div className="mt-12 rounded-card border border-line bg-bone p-6">
          <p className="font-display text-[17px] font-semibold text-ink">Not answered here?</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-stone">
            Ask us directly — somebody who runs the trips will reply.
          </p>
          <Link
            href="/contact"
            className="mt-4 inline-flex min-h-[42px] items-center rounded-full bg-flame px-6 text-[14px] font-semibold text-white transition-colors hover:bg-ember"
          >
            Contact us
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
