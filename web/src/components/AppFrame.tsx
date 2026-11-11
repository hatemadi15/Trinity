import Link from 'next/link';
import { NAV } from '@/lib/nav';
import { BrandMark } from './BrandMark';
import { DemoModeGate } from './DemoModeGate';
import { StarBand } from './StarBand';
import { ThemeSwitch } from './ThemeSwitch';

// The sections live in lib/nav, so the stand view can link to them without the frame (19.3).
export { NAV } from '@/lib/nav';

/**
 * Header, page, footer. The header is 68 px tall and scrolls with the page; only Explore's time bar is
 * pinned. Under 1024 px the sections move to a second row, so the page never scrolls sideways. Faint stars
 * from the catalogue run behind the header and the page's title (StarBand), in the dark theme; the header,
 * the page and the footer are positioned so they paint over them.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <StarBand />
      <header className="relative border-b border-line">
        <div className="wrap flex flex-wrap items-center gap-x-9 gap-y-2 py-3 lg:h-[68px] lg:flex-nowrap lg:py-0">
          <Link href="/" className="flex items-center gap-2.5 font-display text-[21px] font-bold tracking-tight text-ink">
            <BrandMark />
            Earthrise
          </Link>
          <nav aria-label="Sections" className="order-last flex w-full flex-wrap gap-x-7 gap-y-1 text-[15px] font-medium max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-4 lg:order-none lg:w-auto lg:flex-nowrap">
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
      <div className="relative flex-1">{children}</div>
      <footer className="relative border-t border-line">
        <div className="wrap flex flex-wrap justify-between gap-x-8 gap-y-2 py-7 text-[15px] text-ink-2">
          <p>
            Made by team Astroy/Ed for NASA Space Apps 2026, challenge “CLPS Lunar Mission Browser” (CLPS: NASA&apos;s Commercial Lunar Payload Services). Not an official NASA product.
          </p>
          <p>Terrain: NASA Lunar Reconnaissance Orbiter laser altimeter (LOLA). Sun and Earth positions: NASA JPL DE440. Cross-check: JPL Horizons.</p>
        </div>
      </footer>
    </div>
  );
}
