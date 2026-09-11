import type { Metadata } from 'next';
import PolicyPage, { policyMetadata } from '@/components/PolicyPage';

// Plain text today, like its six siblings. When the Admin editor emits
// sanitised HTML this renders an accordion; until then a question and its
// answer are just paragraphs, which is worse to look at and impossible to get
// wrong.
export const revalidate = 300;

export const generateMetadata = (): Promise<Metadata> => policyMetadata('faq', 'Frequently asked questions');

export default function Page() {
  return <PolicyPage slug="faq" eyebrow="Questions" />;
}
