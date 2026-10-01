import Image from 'next/image';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { SkyRow, SkyRowKey } from '@/components/SkyRow';
import { degreesText, HOME, PLACES, thousandsText } from '@/lib/data/home';

/** An outcome tag states how a place turned out; it is an outline, so the page stays three tones. */
const TONE = {
  good: 'border-good text-good',
  bad: 'border-bad text-bad',
  plain: 'border-line-strong text-ink-2',
} as const;

const H2 = 'display text-[34px] sm:text-[40px]';
/** A link that stands alone is underlined, so it never reads as plain text. */
const LINK = 'font-semibold underline decoration-[1.5px] underline-offset-4 hover:decoration-2';
const WHY_CARD = 'grid gap-4 sm:grid-cols-[320px_1fr] sm:items-center sm:gap-6 lg:block lg:space-y-4';
const CELL = 'py-[18px] pr-4 max-md:block max-md:py-0';

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="mr-2 inline-block align-[-3px] text-good" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export default function Home() {
  const { hero, sky, pair, facts } = HOME;
  const siteLink = `/explore?site=${hero.site_id}`;
  const month = `the Sun at ${hero.name}, January 2027`;
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
      scale: `Where NASA's map says 60 %, ours typically says ${60 - typical} to ${60 + typical} %.`,
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
        {/* The page opens on the black of an airless sky and on a real forecast that runs from edge to edge. */}
        <section aria-labelledby="h-hero" data-stage="" className="bg-stage text-stage-ink">
          <div className="wrap pt-10 sm:pt-11">
            <h1 id="h-hero" className="display max-w-[1100px] text-balance text-[44px] leading-[0.98] sm:text-[56px] xl:text-[76px]">
              See when a Moon lander has sunlight and a signal.
            </h1>
            <div className="mt-6 flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
              <p className="max-w-[35em] text-lg leading-relaxed text-stage-ink-2 sm:text-[19px]">
                At the Moon&apos;s south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a
                date: Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and whether the battery survives the night.
              </p>
              <div className="shrink-0">
                <div className="flex flex-wrap gap-3">
                  <Link href="/explore" className="btn btn-primary h-[52px] px-[22px] text-[17px]">
                    Explore a landing site
                  </Link>
                  <a href="#why" className="btn h-[52px] border-[#55554f] px-[22px] text-[17px] text-stage-ink hover:bg-white/10">
                    See how it works
                  </a>
                </div>
                <p className="mt-3 text-[15px] text-stage-ink-2">For mission planners, educators and anyone curious.</p>
              </div>
            </div>
          </div>
          {/* The chart's side labels line up with the page gutter. */}
          <figure className="mt-9 [--chart-inset:16px] sm:[--chart-inset:32px]">
            <figcaption className="wrap flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
              <span className="font-semibold">A real forecast: {month}</span>
              <SkyRowKey body="sun" className="text-stage-ink-2" />
            </figcaption>
            <div className="mt-3">
              <SkyRow el={sky.sun_el} hill={sky.hill_el} visible={sky.lit} startUtc={sky.start_utc} body="sun" caption={`The Sun at ${hero.name}, January 2027`} height={250} reveal />
            </div>
            <div className="wrap flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 pb-8 pt-2.5 text-[15px] text-stage-ink-2">
              <p>
                {hero.name} is a ridge NASA shortlisted for a crewed landing. Computed from NASA&apos;s elevation map of the Moon and NASA&apos;s positions of the Sun and Earth.
              </p>
              <Link href={siteLink} className={`${LINK} whitespace-nowrap text-stage-ink`}>
                Open this site and play the month
              </Link>
            </div>
          </figure>
        </section>

        <section id="why" aria-labelledby="h-why" className="wrap pt-16">
          <h2 id="h-why" className={H2}>
            Why the south pole is hard
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">The Moon&apos;s water ice is there, and so is its hardest lighting. Three facts decide whether a lander lives.</p>
          {/* Three across on a laptop; under 1024 px each drawing sits beside its text, and on a phone above it. */}
          <div className="mt-7 grid gap-6 lg:grid-cols-3">
            <div className={WHY_CARD}>
              <SunNeverClimbs />
              <div>
                <h3 className="display text-[23px] font-semibold leading-tight">The Sun never climbs</h3>
                <p className="mt-2 text-ink-2">Near the pole the Sun circles the horizon once a month instead of rising overhead. It is never more than a few degrees up.</p>
              </div>
            </div>
            <div className={WHY_CARD}>
              <HillsDecide rimPct={pair.rim_sun_pct} sitePct={Math.round(pair.site_sun_pct)} km={Math.round(pair.distance_km)} />
              <div>
                <h3 className="display text-[23px] font-semibold leading-tight">The hills decide</h3>
                <p className="mt-2 text-ink-2">
                  A ridge can hide the Sun for weeks while a peak nearby stays lit. In January 2027 the rim of one crater has sunlight {pair.rim_sun_pct >= 99.95 ? 'all month' : `${Math.round(pair.rim_sun_pct)} % of the time`}; a point{' '}
                  {Math.round(pair.distance_km)} km away has it {Math.round(pair.site_sun_pct)} % of the time.
                </p>
              </div>
            </div>
            <div className={WHY_CARD}>
              <EarthSetsToo />
              <div>
                <h3 className="display text-[23px] font-semibold leading-tight">Earth sets too</h3>
                <p className="mt-2 text-ink-2">Earth hangs near one compass direction and drifts a few degrees up and down each month. When it dips behind the hills, the lander cannot talk to Earth directly.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="h-places" className="wrap pt-16">
          <h2 id="h-places" className={H2}>
            Start from a real place
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">A ridge NASA has shortlisted for astronauts, and two landers that reached the Moon in March 2025. Open any of them as a forecast.</p>
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
                <span className="absolute left-[83%] top-[52%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-stage/70 px-2 py-0.5 text-[15px]">in shadow</span>
                <span className="absolute left-[60%] top-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-[#f3f2ee]/90 px-2 py-0.5 text-[15px] text-black">in sunlight</span>
              </div>
              <figcaption className="mt-3 text-[15px] leading-snug text-ink-3">
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
                  <Link href={p.href} aria-label={`Open this forecast: ${p.title}`} className={`${LINK} whitespace-nowrap`}>
                    Open this forecast
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
                  <th key={head} scope="col" className="border-b border-line-strong py-2.5 pr-4 text-[15px] font-medium text-ink-3">
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
      </main>
    </AppFrame>
  );
}
