import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { HOME } from '@/lib/data/home';
import { whyDrawings } from '@/lib/viz/why';

/**
 * A drawing and its words. A drawing needs about 360 px for its words to fit at their size: three across from 1280 px,
 * each beside its text from 768 px, and on a phone above it, the screen's width.
 */
const WHY_CARD = 'group grid gap-5 md:grid-cols-[380px_1fr] md:items-start md:gap-8 xl:block xl:space-y-5';
const WHY_H3 = 'display text-[30px] leading-tight transition-colors duration-300 group-hover:text-accent-ink';
/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n}\u00a0%`;

/**
 * "Why the south pole is hard" on How it works: the three facts as charts by direction and height, with what each
 * says. The home page draws the same three facts for a newcomer, one idea each (WhySimple), and links here.
 */
export function WhySection() {
  const { hero, pair } = HOME;
  // The drawings' shapes from the month's own figures, worked out here on the server.
  const drawings = whyDrawings();
  return (
    <section id="why" aria-labelledby="h-why" className="wrap scroll-mt-8 pt-24">
      <SectionHead
        id="h-why"
        kicker="Why it is hard"
        title={
          <>
            Why the south pole is <em>hard</em>
          </>
        }
      />
      {/* Three across on a wide screen; under 1280 px each drawing sits beside its text, and on a phone above it. */}
      <div className="mt-10 grid gap-10 xl:grid-cols-3">
        <Reveal className={WHY_CARD}>
          <SunNeverClimbs d={drawings.sun} />
          <div>
            <h3 className={WHY_H3}>The Sun never climbs</h3>
            <p className="mt-2 text-ink-2">The Moon’s axis is tilted only 1.5°, and the Moon turns once a month: a day there lasts a month, and near the pole the Sun circles the horizon instead of rising overhead, never more than a few degrees up. Heights are angles: 5° is about three fingers at arm’s length.</p>
          </div>
        </Reveal>
        <Reveal className={WHY_CARD} delay={120}>
          <HillsDecide d={drawings.hills} />
          <div>
            <h3 className={WHY_H3}>The hills decide</h3>
            <p className="mt-2 text-ink-2">
              The Sun can set behind a ridge for weeks while a peak nearby stays lit. In January 2027 the summit of de Gerlache crater&apos;s rim has sunlight{' '}
              {pair.rim_sun_pct >= 99.95 ? 'all month' : `${pct(Math.round(pair.rim_sun_pct))} of the time`}; {hero.name}, a site shortlisted for a crewed landing, {Math.round(pair.distance_km)} km away, has it{' '}
              {pct(Math.round(pair.site_sun_pct))} of the time.
            </p>
          </div>
        </Reveal>
        <Reveal className={WHY_CARD} delay={240}>
          <EarthSetsToo d={drawings.earth} />
          <div>
            <h3 className={WHY_H3}>Earth sets too</h3>
            <p className="mt-2 text-ink-2">Earth hangs in nearly the same direction in the sky and drifts a few degrees up and down each month. When it sets behind the hills, the lander cannot talk to Earth directly.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
