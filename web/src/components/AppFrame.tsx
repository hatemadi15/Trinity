import Link from 'next/link';
import { BrandMark } from './BrandMark';
import { AboutMenu } from './AboutMenu';
import { DemoModeGate } from './DemoModeGate';
import { LunaButton } from './luna/LunaButton';
import { LunaDock } from './luna/LunaDock';
import { NavLinks } from './NavLinks';
import { ABOUT } from '@/lib/nav';
import { StarBand } from './StarBand';
import { ThemeSwitch } from './ThemeSwitch';

// The sections live in lib/nav, so the stand view can link to them without the frame (19.3).
export { NAV } from '@/lib/nav';

/**
 * Header, page, footer. The header is 68 px tall and scrolls with the page; only Explore's time bar is
 * pinned. Its row holds three choices and no more: known sites, your own site, compare. How it works and Accuracy
 * are in the small About menu at its right and in the footer. Under 1024 px the choices move to a second row, so the
 * page never scrolls sideways. Faint stars
 * from the catalogue run behind the header and the page's title (StarBand), in the dark theme; the header,
 * the page and the footer are positioned so they paint over them.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <StarBand />
      <header className="relative border-b border-line">
        <div className="wrap flex flex-wrap items-center gap-x-9 gap-y-2 py-3 max-sm:gap-x-2 lg:h-[68px] lg:flex-nowrap lg:py-0">
          {/* The wordmark: the Moon that turns as the page scrolls, and the name with its stress on "rise". */}
          <Link href="/" aria-label="Earthrise, home" className="group flex items-center gap-2.5 text-ink">
            <BrandMark />
            <span className="display text-[27px] leading-none">
              Earth<em>rise</em>
            </span>
          </Link>
          <nav aria-label="Sections" className="order-last flex w-full flex-wrap gap-x-7 gap-y-1 text-[15px] font-medium max-sm:gap-x-5 lg:order-none lg:w-auto lg:flex-nowrap">
            <NavLinks />
          </nav>
          <div className="ml-auto flex items-center gap-4 max-sm:gap-2">
            <DemoModeGate />
            <AboutMenu />
            {/* Luna, the voice of the app (spec 22): off until pressed. */}
            <LunaButton />
            <ThemeSwitch />
          </div>
        </div>
      </header>
      <div className="relative flex-1">{children}</div>
      <footer className="relative border-t border-line">
        <div className="wrap flex flex-wrap justify-between gap-x-8 gap-y-2 py-8 text-[14px] leading-relaxed text-ink-3">
          <p>
            Made by team Astroy/Ed for NASA Space Apps 2026, challenge “CLPS Lunar Mission Browser” (CLPS: NASA&apos;s Commercial Lunar Payload Services). Not an official NASA product.
          </p>
          <p>Terrain: NASA Lunar Reconnaissance Orbiter laser altimeter (LOLA). Sun and Earth positions: NASA JPL DE440. Cross-check: JPL Horizons.</p>
          {/* Who it is for, and the two pages about the app itself: on every page, out of the header's row. */}
          <nav aria-label="About Earthrise" className="flex w-full flex-wrap gap-x-6 gap-y-1">
            {/* Who it is for: here, off the home page's first screen. */}
            <span>For planners of NASA&apos;s commercial Moon landers, teachers and anyone curious.</span>
            {ABOUT.map((item) => (
              <Link key={item.href} href={item.href} className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
      {/* Luna's 3D self, at the lower left of every page with this frame (spec 23). */}
      <LunaDock />
    </div>
  );
}
