import Image from 'next/image';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { WhySection } from '@/components/home/WhySection';
import { SkyRow, SkyRowKey } from '@/components/SkyRow';
import { degreesText, HOME, PLACES, thousandsText } from '@/lib/data/home';
import { dateLong, spanWords } from '@/lib/viz/format';

/** An outcome tag states how a place turned out; it is an outline, so the page stays three tones. */
const TONE = {
  good: 'border-good text-good',
  bad: 'border-bad text-bad',
  plain: 'border-line-strong text-ink-2',
} as const;

const H2 = 'display text-[34px] sm:text-[40px]';
/** A link that stands alone is underlined, so it never reads as plain text. */
const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 hover:decoration-2';
const CELL = 'py-[18px] pr-4 max-md:block max-md:py-0';
/** Both forecast rows use one height scale: a degree takes as many pixels in each. */
const PX_PER_DEG = 6.5;
/** A number and its percent sign stay on one line. */
const pct = (n: number) => `${n} %`;

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="mr-2 inline-block align-[-3px] text-good" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export default function Home() {
  const { hero, sky, facts, battery } = HOME;
  const siteLink = `/explore?site=${hero.site_id}`;
  const frameDate = new Date(`${hero.frame_utc}Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const typical = Math.round(facts.mazarico_median_points);
  /** Each check has the same four attributes, so the three are a table. */
  const checks = [
    {
      what: 'Where the Sun and Earth are in the sky',
      gap: degreesText(facts.horizons_worst_el_deg),
      against: `NASA's own position calculator, ${facts.horizons_rows} test cases; the largest gap.`,
      scale: `The Sun's disc is ${thousandsText(facts.sun_disc_ratio)} times wider.`,
    },
    {
      what: 'How much sunlight a site gets',
      gap: `${facts.mazarico_median_points.toFixed(1)} points`,
      against: `NASA's sunlight map over 13 years, at ${facts.mazarico_sites} sites; the typical gap, in percentage points.`,
      scale: `Where NASA's map says ${pct(60)}, ours typically says ${60 - typical} to ${pct(60 + typical)}.`,
    },
    {
      what: 'When night falls on a real mission',
      gap: `${Math.abs(facts.blue_ghost_end_minus_sunset_h).toFixed(1)} hours`,
      against: 'The last signal of the Blue Ghost lander, March 2025.',
      scale: 'The mission ran for 14 days.',
    },
  ];
  return (
    <AppFrame>
      <main>
        <section aria-labelledby="h-hero">
          <div className="wrap pb-6 pt-8">
            <h1 id="h-hero" className="display max-w-[1100px] text-balance text-[44px] leading-[0.98] sm:text-[56px] xl:text-[72px]">
              See when a Moon lander has sunlight and a signal.
            </h1>
            <div className="mt-6 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
              <p className="max-w-[35em] text-lg leading-relaxed text-ink-2 sm:text-[19px]">
                At the Moon&apos;s south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a
                date: Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and whether the battery survives the night.
              </p>
              <div className="shrink-0">
                <div className="flex flex-wrap gap-3">
                  <Link href="/sites" className="btn btn-primary h-[52px] px-[22px] text-[17px]">
                    Explore a landing site
                  </Link>
                  <a href="#why" className="btn h-[52px] px-[22px] text-[17px]">
                    See how it works
                  </a>
                </div>
                <p className="mt-3 text-base text-ink-2">For mission planners, educators and anyone curious.</p>
              </div>
            </div>
          </div>
          {/* The forecast runs from edge to edge on a black band, a window onto the Moon in both themes. Its side labels line up with the page gutter. */}
          <figure aria-labelledby="h-forecast" data-stage="" className="border-y border-stage-edge bg-stage pb-7 pt-4 text-stage-ink [--chart-inset:16px] sm:[--chart-inset:32px]">
            <figcaption className="wrap">
              <p id="h-forecast" className="text-[17px] font-semibold">
                A real forecast: {hero.name}, January 2027
              </p>
              <p className="mt-1 max-w-[76em] text-base text-stage-ink">
                A ridge NASA shortlisted for astronauts. Read it from left to right, one day at a time. Heights are angles above the horizon: 5° is about the width of three fingers held
                at arm&apos;s length. The grey is not one mountain: it is how high the hills stand in the direction of the Sun, or of Earth, that day.
              </p>
              <SkyRowKey body="both" className="mt-2.5 text-stage-ink-2" />
            </figcaption>
            <div className="mt-2">
              <SkyRow el={sky.sun_el} hill={sky.hill_el} visible={sky.lit} startUtc={sky.start_utc} body="sun" title="Sunlight" caption={`The Sun at ${hero.name}, January 2027`} pxPerDeg={PX_PER_DEG} ticks={false} fitHills reveal />
              <SkyRow el={sky.earth_el} hill={sky.earth_hill_el} visible={sky.earth_visible} startUtc={sky.start_utc} body="earth" title="Contact with Earth" caption={`Earth from ${hero.name}, January 2027`} pxPerDeg={PX_PER_DEG} reveal />
            </div>
            {/* What the forecast means for a lander: the promise of the headline, in one sentence. */}
            <p className="wrap pt-4 text-[17px] font-medium text-stage-ink">
              A small lander ({battery.lander.area_m2} m² of solar panels, {battery.lander.battery_wh / 1000} kWh battery) landing on {dateLong(sky.start_utc, 0)} keeps power for{' '}
              {spanWords(battery.now_hours)}
              {battery.best_hour !== null && battery.best_hours !== null && battery.best_hours > battery.now_hours
                ? `; landing on ${dateLong(sky.start_utc, battery.best_hour)}, for ${spanWords(battery.best_hours)}.`
                : '.'}
            </p>
            <div className="wrap flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pt-8 text-[15px] text-stage-ink-2">
              <p className="max-w-[62em]">Computed from NASA&apos;s elevation map of the Moon and NASA&apos;s positions of the Sun and Earth.</p>
              <Link href={siteLink} className={`${LINK} whitespace-nowrap text-stage-ink`}>
                Explore {hero.name}
              </Link>
            </div>
          </figure>
        </section>

        <WhySection />

        <section aria-labelledby="h-places" className="wrap pt-16">
          <h2 id="h-places" className={H2}>
            Start from a real place
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">A ridge NASA has shortlisted for astronauts, and two landers that reached the Moon in March 2025. Explore any of them hour by hour.</p>
          {/* Three places are a picture and a ruled list, not three cards: the picture is the first place. */}
          <div className="mt-7 grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,500px)_1fr]">
            <figure>
              <div className="stage aspect-square">
                <Image src={hero.image} alt={`The ground around ${hero.name} seen from above, with long black shadows`} fill sizes="(min-width: 1024px) 500px, 100vw" className="object-cover sepia-[0.18] saturate-[0.9]" />
                <span className="absolute left-3 top-3 rounded bg-stage/80 px-2.5 py-1 text-[15px]">
                  {hero.name}: shadows computed for {frameDate}
                </span>
                <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
                  <b className="whitespace-nowrap rounded border border-stage-sun/60 bg-stage/80 px-2.5 py-1 text-[15px] font-semibold">the landing site</b>
                  <i className="h-6 w-0.5 bg-stage-sun" />
                  <u className="h-3.5 w-3.5 translate-y-1.5 rounded-full border-[3px] border-stage-sun bg-stage/60 no-underline" />
                </div>
                <span className="absolute left-[84%] top-[68%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-stage/70 px-2 py-0.5 text-[15px]">in shadow</span>
                <span className="absolute left-[60%] top-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#f3f2ee]/90 px-2 py-0.5 text-[15px] text-black">in sunlight</span>
              </div>
              <figcaption className="mt-3 text-[15px] leading-snug text-ink-2">
                The ridge from above, {Math.round(hero.window_km)} km across. Black is ground the Sun cannot reach at that hour. Computed from NASA elevation data, not a photograph.
              </figcaption>
            </figure>
            <ul className="border-t-2 border-ink">
              {PLACES.map((p) => (
                <li key={p.href} className="grid gap-x-6 gap-y-3 border-b border-line-strong py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <span className={`inline-block rounded-full border px-3 py-0.5 text-[15px] font-semibold ${TONE[p.tone]}`}>{p.outcome}</span>
                    <h3 className="display mt-2.5 text-[26px] font-semibold leading-tight">{p.title}</h3>
                    <p className="mt-1.5 max-w-[34em] text-ink-2">{p.body}</p>
                  </div>
                  <Link href={p.href} aria-label={`Explore this site: ${p.title}`} className="btn btn-sm w-fit">
                    Explore this site
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="h-proof" className="wrap pb-16 pt-16">
          <h2 id="h-proof" className={H2}>
            Checked against NASA
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">Each step is compared with an independent NASA source. The smaller the gap, the better.</p>
          {/* Under 768 px each row becomes a block and the column heads stay for screen readers only. */}
          <table className="mt-7 w-full border-collapse border-t-2 border-ink text-left max-md:block">
            <thead className="max-md:sr-only">
              <tr>
                {['What we check', 'Gap', 'Against', 'For scale'].map((head) => (
                  <th key={head} scope="col" className="border-b border-line-strong py-2.5 pr-4 text-[15px] font-semibold text-ink-2">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="max-md:block">
              {checks.map((c) => (
                <tr key={c.what} className="border-b border-line-strong align-top max-md:block max-md:py-4">
                  <th scope="row" className={`${CELL} text-lg font-semibold md:w-[27%]`}>
                    {c.what}
                  </th>
                  <td className={`${CELL} display whitespace-nowrap text-[34px] max-md:py-2 md:w-[20%]`}>
                    <Check />
                    {c.gap}
                  </td>
                  <td className={`${CELL} text-ink-2`}>{c.against}</td>
                  <td className={`${CELL} text-ink-2 max-md:pt-1`}>{c.scale}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6">
            <Link href="/validate" className={LINK}>
              See every check and rerun one live
            </Link>
          </p>
        </section>

        <section aria-labelledby="h-try" className="border-t border-line">
          <div className="wrap flex flex-col gap-6 py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <div>
              <h2 id="h-try" className={H2}>
                Try it on a landing site
              </h2>
              <p className="mt-2.5 max-w-[40em] text-lg text-ink-2">
                Pick a site near the south pole, or any point you choose, and a date. Earthrise shows its sunlight, its contact with Earth and its battery, hour by hour.
              </p>
            </div>
            <Link href="/sites" className="btn btn-primary h-[52px] w-fit shrink-0 px-[22px] text-[17px]">
              Explore a landing site
            </Link>
          </div>
        </section>
      </main>
    </AppFrame>
  );
}
