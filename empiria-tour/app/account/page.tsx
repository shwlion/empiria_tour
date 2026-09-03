import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import AccountTabs from '@/components/account/AccountTabs';
import ProfileForm from '@/components/account/ProfileForm';
import CloseAccount from '@/components/account/CloseAccount';
import { requireUser } from '@/lib/auth';
import { getProfile } from '@/lib/account';

/**
 * A8 — the traveller's own account.
 *
 * `requireUser` rather than `requireRole('traveller')`: an admin or a partner
 * has one of these too, and sending them to /unauthorized — "your account does
 * not have access to this area" — would be false.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await requireUser('/account');
  const profile = await getProfile(user.id);

  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
          Account
        </h1>
        <AccountTabs active="profile" />

        {profile ? (
          <>
            <h2 className="mt-8 font-display text-[19px] font-semibold text-ink">Your details</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-stone">
              These are used to fill in your next booking. Changing them here does not change a
              booking you have already made.
            </p>
            <ProfileForm profile={profile} />
            <CloseAccount />
          </>
        ) : (
          // The auth session exists but `public.users` has no row for it. That
          // is `handle_new_user` not having run, which is a real fault worth
          // naming rather than rendering an empty form that silently saves
          // nothing.
          <div className="mt-8 rounded-card border border-dashed border-line bg-bone p-6 text-center">
            <p className="text-[15px] text-ink">We could not load your profile.</p>
            <p className="mt-2 text-[13px] leading-relaxed text-stone">
              Your sign-in is fine, but there is no profile attached to it. Please get in touch and
              we will put it right.
            </p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
