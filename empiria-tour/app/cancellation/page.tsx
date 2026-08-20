import type { Metadata } from 'next';
import PolicyPage, { policyMetadata } from '@/components/PolicyPage';

// The body, the footer's registration number and the statutory notice all come
// from the database, so this page must not be frozen at build time — Empiria
// edits these in Admin (B6) and a regulatory notice that needs a redeploy to
// change is a notice that will be wrong. Five minutes is well inside any
// reasonable correction window and still serves from cache.
export const revalidate = 300;

export const generateMetadata = (): Promise<Metadata> => policyMetadata('cancellation', 'Cancellation policy');

export default function Page() {
  return <PolicyPage slug="cancellation" />;
}
