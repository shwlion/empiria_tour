import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign In',
};

/**
 * Sign in / create account. Uses Supabase Auth (not Auth0): email + password
 * and Google / Apple OAuth. The form is a client component; this page stays a
 * server component so it composes with the shared Navbar and Footer.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper font-sans text-ink">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <LoginForm />
      </main>
      <Footer />
    </div>
  );
}
