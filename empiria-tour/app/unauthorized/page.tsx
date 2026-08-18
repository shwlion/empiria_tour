import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Not authorized',
};

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <span className="mb-3 font-mono text-[10px] uppercase tracking-label text-flame">403</span>
        <h1 className="mb-2 font-display text-2xl text-ink">Not authorized</h1>
        <p className="mb-6 max-w-sm text-sm leading-relaxed text-stone">
          Your account does not have access to this area.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-flame px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-label text-white transition-colors hover:bg-ember"
        >
          Back to tours
        </Link>
      </main>
      <Footer />
    </div>
  );
}
