import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { HOME } from '@/lib/data/home';

const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 transition-colors hover:decoration-accent';
/** A drawing and its words; the whole card is the drawing's hover target, so it plays while the pointer is anywhere on it. */
const WHY_CARD = 'group grid gap-4 sm:grid-cols-[320px_1fr] sm:items-center sm:gap-6 lg:block lg:space-y-5';
const WHY_H3 = 'display text-[30px] leading-tight transition-colors duration-300 group-hover:text-accent-ink';
/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n}\u00a0%`;

/**
 * "Why the south pole is hard": three drawings with what each says, on the home page and on How it
 * works. `teaching` adds the pointer to How it works, which that page itself leaves out.
 */
export function WhySection({ teaching = true, intro = true, n }: { teaching?: boolean; intro?: boolean; n?: string }) {
  const { hero, pair } = HOME;
  return (
    <section id="why" aria-labelledby="h-why" className="wrap scroll-mt-8 pt-24">
      {/* How it works leaves the intro out: the three headings, the drawings and the science below carry it. */}
      <SectionHead
        id="h-why"
        n={n}
        kicker="Why it is hard"
        title={
          <>
            Why the south pole is <em>hard</em>
          </>
        }
        lede={intro ? 'The Moon’s water ice is there, and so is its hardest lighting. Three facts decide whether a lander lives. Point at a drawing to play it.' : undefined}
      />
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
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <Reveal className={WHY_CARD}>
          <SunNeverClimbs />
          <div>
            <h3 className={WHY_H3}>The Sun never climbs</h3>
            <p className="mt-2 text-ink-2">The Moon’s axis is tilted only 1.5°, and the Moon turns once a month: a day there lasts a month, and near the pole the Sun circles the horizon instead of rising overhead, never more than a few degrees up.</p>
          </div>
        </Reveal>
        <Reveal className={WHY_CARD} delay={120}>
          <HillsDecide rimPct={pair.rim_sun_pct} sitePct={Math.round(pair.site_sun_pct)} km={Math.round(pair.distance_km)} />
          <div>
            <h3 className={WHY_H3}>The hills decide</h3>
            <p className="mt-2 text-ink-2">
              The Sun can set behind a ridge for weeks while a peak nearby stays lit. In January 2027 the summit of de Gerlache crater&apos;s rim has sunlight{' '}
              {pair.rim_sun_pct >= 99.95 ? 'all month' : `${pct(Math.round(pair.rim_sun_pct))} of the time`}; {hero.name}, {teaching ? 'the site in the forecast above' : 'a site shortlisted for a crewed landing'}, {Math.round(pair.distance_km)} km away, has it{' '}
              {pct(Math.round(pair.site_sun_pct))} of the time.
            </p>
          </div>
        </Reveal>
        <Reveal className={WHY_CARD} delay={240}>
          <EarthSetsToo />
          <div>
            <h3 className={WHY_H3}>Earth sets too</h3>
            <p className="mt-2 text-ink-2">Earth hangs in nearly the same direction in the sky and drifts a few degrees up and down each month. When it sets behind the hills, the lander cannot talk to Earth directly.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
