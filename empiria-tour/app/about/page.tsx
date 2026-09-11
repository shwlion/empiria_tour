import type { Metadata } from 'next';
import PolicyPage, { policyMetadata } from '@/components/PolicyPage';

// Body, footer registration number and statutory notice all come from the
// database, so this page must not freeze at build time — Empiria edits it in
// Admin (B6) and a seller description that needs a redeploy to correct is one
// that will stay wrong. Five minutes is inside any reasonable window.
export const revalidate = 300;

export const generateMetadata = (): Promise<Metadata> => policyMetadata('about', 'About Empiria Tours');

export default function Page() {
  return <PolicyPage slug="about" eyebrow="About" />;
}
