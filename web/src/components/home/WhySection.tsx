import Link from 'next/link';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { HOME } from '@/lib/data/home';

const H2 = 'display text-[34px] sm:text-[40px]';
const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 hover:decoration-2';
const WHY_CARD = 'grid gap-4 sm:grid-cols-[320px_1fr] sm:items-center sm:gap-6 lg:block lg:space-y-4';
/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n}\u00a0%`;

/**
 * "Why the south pole is hard": three drawings with what each says, on the home page and on How it
 * works. `teaching` adds the pointer to How it works, which that page itself leaves out.
 */
export function WhySection({ teaching = true }: { teaching?: boolean }) {
  const { hero, pair } = HOME;
  return (
    <section id="why" aria-labelledby="h-why" className="wrap pt-16">
      <h2 id="h-why" className={H2}>
        Why the south pole is hard
      </h2>
      <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">The Moon&apos;s water ice is there, and so is its hardest lighting. Three facts decide whether a lander lives.</p>
      {teaching && (
        <p className="mt-3 text-lg text-ink-2">
          Teaching this?{' '}
          <Link href="/learn" className={LINK}>
            How it works
          </Link>{' '}
          gives the science behind these three facts, with sums a class can check.
        </p>
      )}
      {/* Three across on a laptop; under 1024 px each drawing sits beside its text, and on a phone above it. */}
      <div className="mt-7 grid gap-6 lg:grid-cols-3">
        <div className={WHY_CARD}>
          <SunNeverClimbs />
          <div>
            <h3 className="display text-[23px] font-semibold leading-tight">The Sun never climbs</h3>
            <p className="mt-2 text-ink-2">The Moon’s axis is tilted only 1.5°, and the Moon turns once a month: a day there lasts a month, and near the pole the Sun circles the horizon instead of rising overhead, never more than a few degrees up.</p>
          </div>
        </div>
        <div className={WHY_CARD}>
          <HillsDecide rimPct={pair.rim_sun_pct} sitePct={Math.round(pair.site_sun_pct)} km={Math.round(pair.distance_km)} />
          <div>
            <h3 className="display text-[23px] font-semibold leading-tight">The hills decide</h3>
            <p className="mt-2 text-ink-2">
              The Sun can set behind a ridge for weeks while a peak nearby stays lit. In January 2027 the summit of de Gerlache crater&apos;s rim has sunlight{' '}
              {pair.rim_sun_pct >= 99.95 ? 'all month' : `${pct(Math.round(pair.rim_sun_pct))} of the time`}; {hero.name}, {teaching ? 'the site in the forecast above' : 'a site shortlisted for a crewed landing'}, {Math.round(pair.distance_km)} km away, has it{' '}
              {pct(Math.round(pair.site_sun_pct))} of the time.
            </p>
          </div>
        </div>
        <div className={WHY_CARD}>
          <EarthSetsToo />
          <div>
            <h3 className="display text-[23px] font-semibold leading-tight">Earth sets too</h3>
            <p className="mt-2 text-ink-2">Earth hangs in nearly the same direction in the sky and drifts a few degrees up and down each month. When it sets behind the hills, the lander cannot talk to Earth directly.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
