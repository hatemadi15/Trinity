import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { MoonNebula } from '@/components/MoonNebula';

const LINK = 'pointer-events-auto font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-accent';

/**
 * What a wrong address shows: the usual frame, and under it the Moon's sky in halftone (spec 23) with one plain
 * sentence and the three places a visitor most likely wanted.
 */
export default function NotFound() {
  return (
    <AppFrame>
      <main>
        <MoonNebula height="calc(100svh - 69px)" params={SKY}>
          <div className="wrap flex h-full w-full flex-col justify-end pb-16 sm:pb-24">
            <div className="eyebrow flex items-center gap-2 text-accent-ink">
              <span aria-hidden="true" className="inline-block h-2 w-2 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-accent" />
              Error 404
            </div>
            <h1 data-band-end="" className="display mt-4 max-w-[14em] text-[52px] leading-[0.95] text-ink sm:text-[80px]">
              There is no page at <em>this address.</em>
            </h1>
            <p className="mt-3 max-w-[46em] text-lg text-ink-2">
              Go to{' '}
              <Link href="/" className={LINK}>
                the home page
              </Link>
              , open{' '}
              <Link href="/sites" className={LINK}>
                Choose a landing site
              </Link>
              , or see{' '}
              <Link href="/explore" className={LINK}>
                the forecast
              </Link>
              .
            </p>
          </div>
        </MoonNebula>
      </main>
    </AppFrame>
  );
}

/** The planet and the brightest gas stand right, clear of the words at the lower left. */
const SKY = { planetX: 0.78, planetY: 0.7, bandOffset: -0.05, bandAngle: 0.35 };
