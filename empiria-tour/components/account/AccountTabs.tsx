import Link from 'next/link';

/**
 * The account screens: A7 (bookings) and A8 (saved travellers, profile).
 *
 * A server component: which tab is active is known at render time from the page
 * that draws it, so there is nothing here worth shipping `usePathname` and a
 * client bundle for.
 */
const TABS = [
  { key: 'bookings', href: '/account/bookings', label: 'My bookings' },
  { key: 'travellers', href: '/account/travellers', label: 'Travellers' },
  { key: 'profile', href: '/account', label: 'Account' },
] as const;

export default function AccountTabs({ active }: { active: 'bookings' | 'travellers' | 'profile' }) {
  return (
    <nav aria-label="Account" className="mt-5 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 py-2 font-mono text-[11px] uppercase tracking-label transition-colors ${
            t.key === active
              ? 'border-flame text-ink'
              : 'border-transparent text-stone hover:text-ink'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
