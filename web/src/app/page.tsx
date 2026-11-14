import Image from 'next/image';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { Descent } from '@/components/home/Descent';
import { ForecastHover } from '@/components/home/ForecastHover';
import { WhySection } from '@/components/home/WhySection';
import { MoonNebula } from '@/components/MoonNebula';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { SkyRow, SkyRowKey } from '@/components/SkyRow';
import { exploreHref } from '@/lib/links';
import { degreesText, HOME, PLACES, thousandsText } from '@/lib/data/home';
import { descentWords } from '@/lib/viz/descent';
import { dateLong, spanShort, spanWords } from '@/lib/viz/format';

/** An outcome tag states how a place turned out; it is an outline, so the page stays black and white. */
const TONE = {
  good: 'border-good text-good',
  bad: 'border-bad text-bad',
  plain: 'border-line-strong text-ink-2',
} as const;

/** A link that stands alone is underlined, so it never reads as plain text. */
const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 transition-colors hover:decoration-accent hover:text-accent-ink';
const CELL = 'py-[22px] pr-4 max-md:block max-md:py-0';
/** Both forecast rows use one height scale: a degree takes as many pixels in each. */
const PX_PER_DEG = 6.5;
/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n}\u00a0%`;
/** The corner marks of an instrument's frame, around a picture. */
function Corners({ tone = 'border-white/50' }: { tone?: string }) {
  const c = `pointer-events-none absolute h-4 w-4 ${tone}`;
  return (
    <span aria-hidden="true">
      <span className={`${c} left-2 top-2 border-l border-t`} />
      <span className={`${c} right-2 top-2 border-r border-t`} />
      <span className={`${c} bottom-2 left-2 border-b border-l`} />
      <span className={`${c} bottom-2 right-2 border-b border-r`} />
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="mr-2.5 inline-block align-[-2px] text-good" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="arrow">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * The home page (spec 23): the descent to the Moon's south pole, then five numbered sections in one line down the page, each opened the same
 * way (SectionHead): the forecast, why the pole is hard, real places, the checks, and where to go next.
 */
export default function Home() {
  const { hero, sky, facts, battery } = HOME;
  const siteLink = exploreHref(hero.site_id, sky.start_utc, 30);
  const frameDate = new Date(`${hero.frame_utc}Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const typical = Math.round(facts.mazarico_median_points);
  const FORECAST = { startUtc: sky.start_utc, sunEl: sky.sun_el, lit: sky.lit, earthEl: sky.earth_el, earthVisible: sky.earth_visible };
  const better = battery.best_hour !== null && battery.best_hours !== null && battery.best_hours > battery.now_hours ? { hour: battery.best_hour, hours: battery.best_hours } : null;
  /** Each row has the same four attributes, so the three are a table; the mission is context, so it has no check mark. */
  const checks = [
    {
      check: true,
      what: 'Where the Sun and Earth are in the sky',
      gap: degreesText(facts.horizons_worst_el_deg),
      against: `NASA's own position calculator, ${facts.horizons_rows} test cases; the largest gap.`,
      scale: `The Sun's disc is ${thousandsText(facts.sun_disc_ratio)} times wider.`,
    },
    {
      check: true,
      what: 'How much sunlight a site gets',
      gap: `${facts.mazarico_median_points.toFixed(1)} points`,
      against: `NASA's sunlight map, an 18.6-year average, at ${facts.mazarico_sites} sites; the typical gap from the app's own numbers, in percentage points.`,
      scale: `Where NASA's map says ${pct(60)}, ours typically says ${60 - typical} to ${pct(60 + typical)}.`,
    },
    {
      check: false,
      what: 'When night falls on a real mission',
      gap: `${Math.abs(facts.blue_ghost_end_minus_sunset_h).toFixed(1)} hours`,
      against: "Blue Ghost's last reported signal after our predicted sunset, March 2025: context, not a test.",
      scale: 'The mission ran for 14 days.',
    },
  ];
  return (
    <AppFrame>
      <main>
        <Descent words={descentWords()} />

        {/* 01. The forecast, read in three steps with room between them: the Sun, Earth, and what the two mean for a
            lander. The rows run from edge to edge on a black band, a window onto the Moon in both themes; their side
            labels line up with the page gutter. */}
        <figure aria-labelledby="h-forecast" data-stage="" className="border-t border-stage-edge bg-stage pb-24 pt-24 text-stage-ink [--chart-inset:16px] sm:pb-32 sm:[--chart-inset:32px]">
          <figcaption className="wrap">
            <Reveal>
              <p className="eyebrow flex items-center gap-3 text-[#a8c6ff]">
                <span className="pixel text-[17px] tracking-normal">01</span>
                <span aria-hidden="true" className="h-px w-8 bg-current opacity-60" />A real forecast
              </p>
              <p id="h-forecast" className="display mt-4 text-[40px] leading-none sm:text-[56px]">
                <span className="sr-only">A real forecast: </span>
                {hero.name}, <em>January 2027</em>
              </p>
              <p className="mt-5 max-w-[38em] text-lg leading-relaxed text-stage-ink-2">
                A ridge NASA shortlisted for astronauts. Here is one month there, read from left to right, a day at a time.{' '}
                <span className="text-stage-ink">Point at a chart, or tab to it, to read any hour.</span>
              </p>
            </Reveal>
          </figcaption>

          {/* Step 1: the Sun. */}
          <div className="mt-20">
            <Reveal className="wrap grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-12">
              <p className="flex items-baseline gap-3">
                <span className="pixel text-[20px] text-[#a8c6ff]">1</span>
                <span className="display text-[32px] leading-none">The Sun</span>
              </p>
              <div>
                <p className="max-w-[40em] text-lg leading-relaxed text-stage-ink-2">
                  The white line is how high the Sun stands; grey is how high the hills stand in its direction. Where the line drops behind the grey, the site is in night, even with
                  the Sun up. Heights are angles: 5° is about three fingers at arm&apos;s length.
                </p>
                <SkyRowKey body="sun" className="mt-4 text-stage-ink-2" />
              </div>
            </Reveal>
            <div className="mt-6">
              <ForecastHover series={FORECAST}>
                <SkyRow el={sky.sun_el} hill={sky.hill_el} visible={sky.lit} startUtc={sky.start_utc} body="sun" title="Sunlight" caption={`The Sun at ${hero.name}, January 2027`} pxPerDeg={PX_PER_DEG} fitHills />
              </ForecastHover>
            </div>
          </div>

          {/* Step 2: Earth. */}
          <div className="mt-20">
            <Reveal className="wrap grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-12">
              <p className="flex items-baseline gap-3">
                <span className="pixel text-[20px] text-[#a8c6ff]">2</span>
                <span className="display text-[32px] leading-none">Earth</span>
              </p>
              <div>
                <p className="max-w-[40em] text-lg leading-relaxed text-stage-ink-2">
                  The blue line is Earth. A lander can only radio home directly while Earth stands above the hills, and Earth hardly moves in the sky, so it can stay hidden for
                  days.
                </p>
                <SkyRowKey body="earth" className="mt-4 text-stage-ink-2" />
              </div>
            </Reveal>
            <div className="mt-6">
              <ForecastHover series={FORECAST}>
                <SkyRow el={sky.earth_el} hill={sky.earth_hill_el} visible={sky.earth_visible} startUtc={sky.start_utc} body="earth" title="Contact with Earth" caption={`Earth from ${hero.name}, January 2027`} pxPerDeg={PX_PER_DEG} />
              </ForecastHover>
            </div>
          </div>

          {/* Step 3: what the forecast means for a lander, in three figures: the promise of the headline. */}
          <div className="wrap mt-20">
            <Reveal className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-12">
              <p className="flex items-baseline gap-3">
                <span className="pixel text-[20px] text-[#a8c6ff]">3</span>
                <span className="display text-[32px] leading-none">The lander</span>
              </p>
              <p className="max-w-[40em] text-lg leading-relaxed text-stage-ink-2">
                Sunlight charges the battery; night drains it. The landing day decides how long a small solar lander keeps working.
              </p>
            </Reveal>
            <p className="sr-only">
              An example lander, not a planned mission: {battery.lander.area_m2} m² of solar panels and a {battery.lander.battery_wh / 1000} kWh battery. Landing on {dateLong(sky.start_utc, 0)}, it keeps power for {spanWords(battery.now_hours)}
              {better ? `; landing on ${dateLong(sky.start_utc, better.hour)}, for ${spanWords(better.hours)}.` : '.'}
            </p>
            <ul aria-hidden="true" className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-stage-line bg-stage-line sm:grid-cols-3">
              <li className="bg-stage p-7">
                <p className="eyebrow text-stage-ink-2">An example lander</p>
                <p className="display mt-4 text-[38px] leading-none">
                  {battery.lander.area_m2} m² <span className="text-stage-ink-2">·</span> {battery.lander.battery_wh / 1000} kWh
                </p>
                <p className="mt-3 text-[15px] text-stage-ink-2">solar panels and battery; not a planned mission</p>
              </li>
              <li className="bg-stage p-7">
                <p className="eyebrow text-stage-ink-2">Landing on {dateLong(sky.start_utc, 0)}</p>
                <p className="display mt-4 text-[38px] leading-none">{spanShort(Math.round(battery.now_hours))}</p>
                <p className="mt-3 text-[15px] text-stage-ink-2">of power, then night</p>
              </li>
              {better && (
                <li className="relative bg-stage p-7 shadow-[inset_0_0_0_1px_rgba(127,169,255,0.45),inset_0_0_60px_-20px_rgba(127,169,255,0.5)]">
                  <p className="eyebrow text-[#a8c6ff]">Landing on {dateLong(sky.start_utc, better.hour)}</p>
                  <p className="display mt-4 text-[38px] leading-none text-[#cfe0ff] text-glow">{spanShort(Math.round(better.hours))}</p>
                  <p className="mt-3 text-[15px] text-stage-ink-2">of power: the better landing day</p>
                </li>
              )}
            </ul>
          </div>
          <div className="wrap flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pt-10 text-[15px] text-stage-ink-2">
            <p className="max-w-[62em]">Computed from NASA&apos;s elevation map of the Moon and NASA&apos;s positions of the Sun and Earth.</p>
            <Link href={siteLink} className={`${LINK} link-arrow inline-flex items-center gap-2 whitespace-nowrap text-stage-ink`}>
              Open the full forecast
              <Arrow />
            </Link>
          </div>
        </figure>

        {/* 02 to 04 stand on paper in both themes, on a faint survey grid like a star chart's plate: after the dark
            forecast the colours turn over at one clean edge, so the two blocks never read as one. */}
        <div data-band="paper" className="theme-light relative bg-page pt-10 text-ink sm:pt-16">
          <div aria-hidden="true" className="hud-grid pointer-events-none absolute inset-0" />
          <div className="relative">
            <WhySection n="02" />

            <section aria-labelledby="h-places" className="wrap pt-28">
              <SectionHead
                id="h-places"
                n="03"
                kicker="Real places"
                title={
                  <>
                    Start from a <em>real place</em>
                  </>
                }
                lede="A ridge NASA has shortlisted for astronauts, and two landers that reached the Moon in March 2025. Explore any of them hour by hour."
              />
              {/* Three places are a picture and a ruled list, not three cards: the picture is the first place. */}
              <div className="mt-10 grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,500px)_1fr]">
                <Reveal>
                  <figure>
                    <div className="stage aspect-square">
                      <Image src={hero.image} alt={`The ground around ${hero.name} seen from above, with long black shadows`} fill sizes="(min-width: 1024px) 500px, 100vw" className="object-cover grayscale" />
                      <Corners />
                      <span className="mono absolute left-4 top-4 rounded bg-stage/80 px-2.5 py-1 text-[14px]">
                        {hero.name}: shadows computed for {frameDate}
                      </span>
                      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
                        <b className="whitespace-nowrap rounded border border-[#7fa9ff]/70 bg-stage/80 px-2.5 py-1 text-[15px] font-semibold shadow-[0_0_20px_-4px_rgba(127,169,255,0.8)]">the landing site</b>
                        <i className="h-6 w-0.5 bg-[#7fa9ff]" />
                        <u className="h-3.5 w-3.5 translate-y-1.5 animate-[pulse-dot_2.4s_ease-in-out_infinite] rounded-full border-[3px] border-[#7fa9ff] bg-stage/60 no-underline" />
                      </div>
                      <span className="absolute left-[84%] top-[68%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-stage/70 px-2 py-0.5 text-[15px]">in shadow</span>
                      <span className="absolute left-[60%] top-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#f5f5f3]/90 px-2 py-0.5 text-[15px] text-black">in sunlight</span>
                    </div>
                    <figcaption className="mt-3 text-[15px] leading-snug text-ink-2">
                      The ridge from above, {Math.round(hero.window_km)} km across. Black is ground the Sun cannot reach at that hour. Computed from NASA elevation data, not a photograph. Faint stripes are seams in the elevation data, not real ground.
                    </figcaption>
                  </figure>
                </Reveal>
                {/* Each place is one link, the whole row: it lights up and its arrow moves on while the pointer is on it. */}
                <ul className="border-t border-ink">
                  {PLACES.map((p, i) => (
                    <li key={p.href} className="border-b border-line-strong">
                      <Reveal delay={i * 100}>
                        <Link
                          href={p.href}
                          aria-label={`Open the forecast: ${p.title}`}
                          className="group -mx-4 grid gap-x-6 gap-y-3 rounded-xl px-4 py-6 transition-[background-color,box-shadow] duration-300 hover:bg-surface hover:shadow-[0_0_0_1px_rgb(var(--glow)/0.25),0_0_40px_-16px_rgb(var(--glow)/var(--glow-strength))] sm:grid-cols-[1fr_auto] sm:items-center"
                        >
                          <span className="block">
                            <span className={`inline-block rounded-full border px-3 py-0.5 text-[15px] font-semibold ${TONE[p.tone]}`}>{p.outcome}</span>
                            <h3 className="display mt-3 text-[32px] leading-tight transition-colors duration-300 group-hover:text-accent-ink">{p.title}</h3>
                            <span className="mt-1.5 block max-w-[34em] text-ink-2">{p.body}</span>
                          </span>
                          <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
                            Open the forecast
                            <span className="grid h-10 w-10 place-items-center rounded-full border border-line-strong transition-colors duration-300 group-hover:border-accent group-hover:text-accent-ink">
                              <Arrow />
                            </span>
                          </span>
                        </Link>
                      </Reveal>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section aria-labelledby="h-proof" className="wrap pb-28 pt-28">
              <SectionHead
                id="h-proof"
                n="04"
                kicker="Accuracy"
                title={
                  <>
                    Checked against <em>NASA</em>
                  </>
                }
                lede="Two steps are compared with independent NASA sources, and a real mission gives context. The smaller the gap, the better."
              />
              {/* Under 768 px each row becomes a block and the column heads stay for screen readers only. */}
              <table className="mt-10 w-full border-collapse border-t border-ink text-left max-md:block">
                <thead className="max-md:sr-only">
                  <tr>
                    {['What we check', 'Gap', 'Against', 'For scale'].map((head) => (
                      <th key={head} scope="col" className="eyebrow border-b border-line-strong py-3 pr-4 font-normal text-ink-2">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {checks.map((c) => (
                    <tr key={c.what} className="border-b border-line-strong align-top transition-colors duration-300 hover:bg-surface max-md:block max-md:py-5">
                      <th scope="row" className={`${CELL} text-lg font-semibold md:w-[27%]`}>
                        {c.what}
                      </th>
                      <td className={`${CELL} display whitespace-nowrap text-[40px] leading-none max-md:py-2 md:w-[21%]`}>
                        {c.check && <Check />}
                        {c.gap}
                      </td>
                      <td className={`${CELL} text-ink-2`}>{c.against}</td>
                      <td className={`${CELL} text-ink-2 max-md:pt-1`}>{c.scale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6">
                <Link href="/validate" className={`${LINK} link-arrow inline-flex items-center gap-2`}>
                  See every check and rerun one live
                  <Arrow />
                </Link>
              </p>
            </section>
          </div>
        </div>

        {/* 05. Where to go next, over the Moon's sky in halftone: move to light the dust, click to hang a star. */}
        <section aria-labelledby="h-try" className="border-t border-line">
          <MoonNebula height="min(640px, 92svh)" params={END_SKY}>
            <div className="wrap flex h-full w-full flex-col justify-end pb-16 sm:pb-20">
              <SectionHead
                id="h-try"
                n="05"
                kicker="Your turn"
                title={
                  <>
                    Try it on a <em>landing site</em>
                  </>
                }
                lede="Pick a site near the south pole, or any point you choose, and a date. Earthrise shows its sunlight, its contact with Earth and its battery, hour by hour."
              />
              {/* The ways on from a site, in one sentence. "Run it offline" lands on that section of How it works. */}
              <p className="pointer-events-auto mt-3 max-w-[40em] text-lg text-ink-2">
                Then{' '}
                <Link href="/compare" className={LINK}>
                  compare sites
                </Link>
                ,{' '}
                <Link href="/explore#ask" className={LINK}>
                  ask in plain words
                </Link>
                ,{' '}
                <Link href="/brief" className={LINK}>
                  print the brief
                </Link>
                , or{' '}
                <Link href="/learn#offline" className={LINK}>
                  run it offline
                </Link>{' '}
                on a laptop.
              </p>
              <Link href="/sites" className="btn btn-primary pointer-events-auto mt-8 h-[56px] w-fit px-7 text-[17px]">
                Choose a landing site
                <Arrow />
              </Link>
            </div>
          </MoonNebula>
        </section>
      </main>
    </AppFrame>
  );
}

/** The end band's sky: the planet and the bright river of gas stand right, clear of the words at the lower left. */
const END_SKY = { planetX: 0.8, planetY: 0.68, bandAngle: 0.3, bandOffset: 0.05, sparkles: 8 };
