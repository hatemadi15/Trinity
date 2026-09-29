import Link from 'next/link';
import { AudienceToggle } from './AudienceToggle';
import { DemoModeGate } from './DemoModeGate';

const NAV = [
  { href: '/explore', label: 'Explore', ready: true },
  { href: '/compare', label: 'Compare', ready: true },
  { href: '/validate', label: 'Validate', ready: true },
  { href: '/learn', label: 'Learn', ready: true },
];

/** One compact bar on every page: wordmark, sections, audience toggle. 48 px tall so the Explore cockpit keeps its height. */
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-bar sticky top-0 z-30 flex h-12 items-center gap-6 border-b border-line px-5">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight text-ink">
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
          <DemoModeGate />
          <AudienceToggle />
          <span className="hidden text-xs text-ink-3 md:inline">NASA Space Apps 2026, team Astroy/Ed</span>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
