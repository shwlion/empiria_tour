import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { policyMetadata } from '@/components/PolicyPage';
import { getPlatformSettings, getStaticPage } from '@/lib/catalogue';
import { isMailConfigured } from '@/lib/email/mailer';
import ContactForm from './ContactForm';

/**
 * Contact — one of B6's seven pages, and the one with a form on it.
 *
 * The page's own wording (`static_pages.contact`, edited in the console) sits
 * above the form as the introduction, when Empiria has written it. The
 * address and phone come from Platform settings, as in the footer. The form
 * sends through Resend to that same address and stores nothing.
 *
 * Not frozen at build time, for the same reason as the other six: the wording
 * and the contact details are Empiria's to change without a redeploy.
 */
export const revalidate = 300;

export const generateMetadata = (): Promise<Metadata> => policyMetadata('contact', 'Contact us');

/** The seed placeholder is not an introduction; show nothing rather than it. */
const isPlaceholder = (body: string | null | undefined) => !body || /^PLACEHOLDER\b/.test(body.trim());

export default async function ContactPage() {
  const [page, settings] = await Promise.all([getStaticPage('contact'), getPlatformSettings()]);
  const email = settings?.contact_email?.trim() || null;
  const phone = settings?.contact_phone?.trim() || null;
  const available = Boolean(email) && isMailConfigured();

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:py-16">
        <p className="font-mono text-[10px] uppercase tracking-label text-flame">Contact</p>
        <h1 className="mt-3 font-display text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          {page?.title ?? 'Contact us'}
        </h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Send us a message">
            {!isPlaceholder(page?.body) && (
              <div className="mb-8 whitespace-pre-line text-[16px] leading-relaxed text-stone">{page!.body}</div>
            )}
            <ContactForm available={available} />
          </section>

          <aside className="lg:pt-1">
            <div className="rounded-card border border-line bg-bone p-6">
              <p className="font-mono text-[10px] uppercase tracking-label text-stone">Or reach us directly</p>
              {email || phone ? (
                <dl className="mt-4 space-y-3 text-[15px]">
                  {email && (
                    <div>
                      <dt className="text-[12px] text-stone">Email</dt>
                      <dd><a href={`mailto:${email}`} className="ul text-ink">{email}</a></dd>
                    </div>
                  )}
                  {phone && (
                    <div>
                      <dt className="text-[12px] text-stone">Phone</dt>
                      <dd><a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="ul text-ink">{phone}</a></dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-3 text-[14px] leading-relaxed text-stone">
                  The form is the quickest way to reach us.
                </p>
              )}
              <p className="mt-5 text-[13px] leading-relaxed text-stone">
                Booking questions go faster with the booking reference to hand. For anything urgent
                about a departure in the next 48 hours, phone rather than write.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
