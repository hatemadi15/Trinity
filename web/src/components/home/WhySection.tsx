import type { ReactNode } from 'react';
import { Fold } from '@/components/Fold';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { EarthPeek, HillShadow, LowSun } from '@/components/home/WhySimple';
import { HOME } from '@/lib/data/home';
import { dateLong, dayMonth } from '@/lib/viz/format';
import { whyDrawings } from '@/lib/viz/why';

/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n} %`;
/** The home page's drawing, without its own frame: the figure's plate frames it with its lane. Here each drawing has its night sky (`sky="stars"`); the home page's stay on flat black. */
const DRAWING = 'block aspect-[360/230] w-full';
const H3 = 'display mt-5 text-[26px] leading-tight';
const WORDS = 'mt-2 leading-relaxed text-ink-2';

/** The stretches of hours a 0/1 series is on. */
function stretches(on: number[]): [number, number][] {
  const out: [number, number][] = [];
  let from = -1;
  on.forEach((v, h) => {
    if (v > 0 && from < 0) from = h;
    if (!(v > 0) && from >= 0) {
      out.push([from, h]);
      from = -1;
    }
  });
  if (from >= 0) out.push([from, on.length]);
  return out;
}

/** The month as one thick lane, coloured where the series is on: no axis, only the month's first and last day under it. */
function MonthLane({ on, colour, start }: { on: number[]; colour: string; start: string }) {
  const n = on.length;
  return (
    <div aria-hidden="true" data-month-lane="">
      <div className="relative h-4 overflow-hidden rounded-[3px] bg-white/[0.12]">
        {stretches(on).map(([a, b]) => (
          <span key={a} className={`absolute inset-y-0 ${colour}`} style={{ left: `${(a / n) * 100}%`, width: `${((b - a) / n) * 100}%` }} />
        ))}
      </div>
      <p className="mt-1.5 flex justify-between text-[14px] leading-none text-stage-ink-2">
        <span>{dayMonth(start, 0)}</span>
        <span>{dayMonth(start, n - 1)}</span>
      </p>
    </div>
  );
}

/** One idea: a framed panel with the drawing on its black plate, the one figure to remember under it, a heading and two or three short sentences. */
function Figure({ drawing, fact, lane, title, children, delay }: { drawing: ReactNode; fact: ReactNode; lane: ReactNode; title: string; children: ReactNode; delay?: number }) {
  return (
    <Reveal className="panel flex flex-col" delay={delay}>
      {/* On its own layer, so Earth's slow rise repaints this plate alone and not the page's stars under it. */}
      <div className="stage transform-gpu">
        {drawing}
        <div className="border-t border-stage-line px-4 pb-3.5 pt-3">
          <p className="mb-2 text-[15px] font-semibold leading-snug text-stage-ink">{fact}</p>
          <div className="min-h-9">{lane}</div>
        </div>
      </div>
      <h3 className={H3}>{title}</h3>
      <p className={WORDS}>{children}</p>
    </Reveal>
  );
}

/**
 * "Why the south pole is hard" on How it works (spec 23.3): the home page's three simple drawings (WhySimple), each in
 * a framed panel with the month's one figure, a thick lane of the month where there is one, and two or three short
 * sentences. No axes, no degrees on a drawing, nothing to play. The charts by direction and height (WhyDrawings) wait
 * behind one fold for the curious.
 */
export function WhySection() {
  const { hero, pair, sky } = HOME;
  // The charts' shapes from the month's own figures, worked out here on the server.
  const drawings = whyDrawings();
  const { sun } = drawings;
  const km = Math.round(pair.distance_km);
  const month = dateLong(sky.start_utc, 0).replace(/^\d+ /, '');
  /** The forecast site's long night, in the month's own days: "3 to 20 January". */
  const dark = sky.night ? `${dayMonth(sky.start_utc, sky.night.sunset_hour).replace(/ .*/, '')} to ${dateLong(sky.start_utc, sky.night.sunrise_hour)}` : 'part of the month';
  const top = `${sun.highest.el.toFixed(1)}°`;
  return (
    <section id="why" aria-labelledby="h-why" className="wrap scroll-mt-8 pt-20">
      <SectionHead
        id="h-why"
        kicker="Why it is hard"
        title={
          <>
            Why the south pole is <em>hard</em>
          </>
        }
        lede="Three things decide it: a low Sun, the hills, and where Earth is."
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Figure
          title="The Sun never climbs"
          drawing={<LowSun high={sun.contrast.peak} low={sun.highest.el} site={sun.contrast.site} className={DRAWING} sky="stars" />}
          fact={<>The Sun&apos;s highest all month: {top}</>}
          lane={<p className="text-[14px] leading-snug text-stage-ink-2">Less than two fingers held up at arm&apos;s length.</p>}
        >
          The Moon stands almost straight up as it turns, so at its south pole the Sun never rises overhead. It slides round the sky close to the ground, once a month, and hills throw very
          long shadows.
        </Figure>
        <Figure
          delay={120}
          title="The hills decide"
          drawing={<HillShadow km={km} dark={dark} className={DRAWING} sky="stars" />}
          fact={<>Ridge in sunlight: {pct(Math.round(pair.site_sun_pct))} of the month</>}
          lane={<MonthLane on={sky.lit} colour="bg-stage-sun" start={sky.start_utc} />}
        >
          A low Sun is easy to hide. In {month} 2027 one hilltop has sunlight {pair.rim_sun_pct >= 99.95 ? 'all month' : `${pct(Math.round(pair.rim_sun_pct))} of the month`}. A ridge {km} km
          away, {hero.name}, is dark from {dark}. A solar lander has no power in the dark.
        </Figure>
        <Figure
          delay={240}
          title="Earth sets too"
          drawing={<EarthPeek className={DRAWING} sky="stars" />}
          fact={<>Earth in view: {pct(Math.round(sky.earth_pct))} of the month</>}
          lane={<MonthLane on={sky.earth_visible} colour="bg-stage-earth" start={sky.start_utc} />}
        >
          From the Moon, Earth stays in one part of the sky and moves slowly up and down. When it goes behind the hills, the lander cannot talk to Earth directly.
        </Figure>
      </div>
      {/* The science stays, one tap away (spec 20.1): the same three facts by direction and height, with the month to play. */}
      <Fold label="See the detailed charts" className="mt-8">
        <div className="grid gap-8 pt-3 xl:grid-cols-3">
          <SunNeverClimbs d={drawings.sun} />
          <HillsDecide d={drawings.hills} />
          <EarthSetsToo d={drawings.earth} />
        </div>
      </Fold>
    </section>
  );
}
