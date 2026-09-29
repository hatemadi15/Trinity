import Link from 'next/link';
import { AudienceToggle } from './AudienceToggle';

const NAV = [
  { href: '/explore', label: 'Explore', ready: true },
  { href: '/compare', label: 'Compare', ready: true },
  { href: '/validate', label: 'Validate', ready: true },
  { href: '/learn', label: 'Learn', ready: true },
];

export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-baseline gap-8 border-b border-line px-6 py-3">
        <Link href="/" className="font-display text-xl font-semibold tracking-tight text-ink">
          Earthrise
        </Link>
        <nav aria-label="Sections" className="flex gap-5 text-sm">
          {NAV.map((item) =>
            item.ready ? (
              <Link key={item.href} href={item.href} className="text-ink-2 hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span key={item.href} className="text-ink-3" title="Coming in a later week">
                {item.label}
              </span>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <AudienceToggle />
          <span className="text-xs text-ink-3">NASA Space Apps 2026, team Astroy/Ed</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
