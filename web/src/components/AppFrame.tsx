import Link from 'next/link';

const NAV = [
  { href: '/explore', label: 'Explore', ready: true },
  { href: '/compare', label: 'Compare', ready: false },
  { href: '/learn', label: 'Learn', ready: false },
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
        <span className="ml-auto text-xs text-ink-3">NASA Space Apps 2026, team Astroy/Ed</span>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
