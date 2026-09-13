import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AccountTabs from '@/components/account/AccountTabs';
import SavedTravellers from '@/components/account/SavedTravellers';
import { requireUser } from '@/lib/auth';
import { getSavedTravellers, SAVED_TRAVELLERS_MAX } from '@/lib/savedTravellers';

/**
 * A8 — saved traveller profiles.
 *
 * The people this account books for. Each one pre-fills a traveller card in
 * the booking flow; editing here changes the next booking and never a past
 * one, which is the same rule the profile page states.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Saved travellers',
  robots: { index: false, follow: false },
};

export default async function SavedTravellersPage() {
  const user = await requireUser('/account/travellers');
  const travellers = await getSavedTravellers(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
          Account
        </h1>
        <AccountTabs active="travellers" />

        <h2 className="mt-8 font-display text-[19px] font-semibold text-ink">Saved travellers</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-stone">
          The people you book for. When you make a booking, each traveller card offers this list so
          nobody has to be typed in twice. Names must match the ID they will carry. Changing a person
          here does not change a booking already made. Up to {SAVED_TRAVELLERS_MAX}.
        </p>

        <SavedTravellers travellers={travellers} />
      </main>
      <Footer />
    </div>
  );
}
