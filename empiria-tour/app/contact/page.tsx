import type { Metadata } from 'next';
import PolicyPage, { policyMetadata } from '@/components/PolicyPage';

// A2's trust band and A1's footer both promise a contact route. The details
// themselves live in platform settings and in this page's body, so neither is
// hardcoded here — §2.1 makes them Empiria's to supply and change.
export const revalidate = 300;

export const generateMetadata = (): Promise<Metadata> => policyMetadata('contact', 'Contact us');

export default function Page() {
  return <PolicyPage slug="contact" eyebrow="Contact" />;
}
