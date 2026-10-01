import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { DemoModeGate } from './DemoModeGate';
import { ThemeSwitch } from './ThemeSwitch';

/** The four sections in plain words. "Explore a site" opens the site list once part 2 adds it. */
export const NAV = [
  { href: '/explore', label: 'Explore a site' },
  { href: '/compare', label: 'Compare sites' },
  { href: '/learn', label: 'How it works' },
  { href: '/validate', label: 'Accuracy' },
];

/**
 * Header, page, footer. The header is 68 px tall and scrolls with the page; only Explore's time bar is
 * pinned. Under 1024 px the sections move to a second row, so the page never scrolls sideways.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-page">
        <div className="wrap flex flex-wrap items-center gap-x-9 gap-y-2 py-3 lg:h-[68px] lg:flex-nowrap lg:py-0">
          <Link href="/" className="flex items-center gap-2.5 font-display text-[21px] font-bold tracking-tight text-ink">
            <BrandMark />
            Earthrise
            <span className="ml-1.5 hidden whitespace-nowrap font-text text-[15px] font-normal tracking-normal text-ink-3 xl:inline">sunlight and signal forecast for the Moon</span>
          </Link>
          <nav aria-label="Sections" className="order-last flex w-full flex-wrap gap-x-7 gap-y-1 text-[15px] font-medium lg:order-none lg:w-auto lg:flex-nowrap">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap text-ink-2 hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <DemoModeGate />
            <ThemeSwitch />
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="wrap flex flex-wrap justify-between gap-x-8 gap-y-2 py-7 text-[15px] text-ink-3">
          <p>Made by team Astroy/Ed for NASA Space Apps 2026, challenge “CLPS Lunar Mission Browser”. Not an official NASA product.</p>
          <p>Terrain: NASA Lunar Reconnaissance Orbiter laser altimeter (LOLA). Sun and Earth positions: NASA JPL DE440. Cross-check: JPL Horizons.</p>
        </div>
      </footer>
    </div>
  );
}
