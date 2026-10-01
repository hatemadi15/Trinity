import Image from 'next/image';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';
import { EarthSetsToo, HillsDecide, SunNeverClimbs } from '@/components/home/WhyDrawings';
import { SkyRow } from '@/components/SkyRow';
import { degreesText, HOME, MISSIONS, thousandsText } from '@/lib/data/home';

const TONE = {
  good: 'border-good-line bg-good-bg text-good',
  bad: 'border-bad-line bg-bad-bg text-bad',
  plain: 'border-line-strong text-ink-2',
} as const;

const WHY_CARD = 'grid gap-4 sm:grid-cols-[320px_1fr] sm:items-center sm:gap-6 lg:block lg:space-y-4';

function Check() {
  return (
    <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-good" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export default function Home() {
  const { hero, sky, pair, facts } = HOME;
  const siteLink = `/explore?site=${hero.site_id}`;
  return (
    <AppFrame>
      <main>
        <section className="border-b border-stage-line bg-[#07080b] text-stage-ink">
          <div className="wrap grid items-center gap-10 py-14 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_500px] xl:gap-14">
            <div>
              <h1 className="max-w-[11em] font-display text-[40px] font-semibold leading-[1.04] tracking-[-0.025em] sm:text-[48px] xl:text-[58px]">See when a Moon lander has sunlight and a signal.</h1>
              <p className="mt-6 max-w-[30em] text-xl leading-relaxed text-stage-ink-2">
                At the Moon&apos;s south pole the Sun and Earth never climb high. They skim the horizon, and one hill can hide them for weeks. Pick a landing site and a
                date: Earthrise shows the hours of sunlight, the hours of radio contact with Earth, and whether the battery survives the night.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/explore" className="btn btn-primary h-[52px] text-[17px]">
                  Explore a landing site
                </Link>
                <a href="#why" className="btn h-[52px] border-[#3b4350] text-[17px] text-stage-ink hover:bg-white/10">
                  See how it works
                </a>
              </div>
              <p className="mt-5 text-sm text-[#9e998f]">Built on NASA&apos;s elevation map of the Moon and NASA&apos;s positions of the Sun and Earth. Free to use.</p>
            </div>
            <figure>
              <div className="relative aspect-[50/41] overflow-hidden rounded-2xl border border-stage-line bg-black">
                <Image src={hero.image} alt="The ground around a possible landing site seen from above, with long black shadows" fill priority sizes="(min-width: 1280px) 500px, (min-width: 1024px) 420px, 100vw" className="object-cover sepia-[0.18] saturate-[0.9]" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-full flex-col items-center">
                  <b className="whitespace-nowrap rounded-md border border-stage-sun/60 bg-stage/80 px-2.5 py-1 text-sm font-semibold">A possible landing site</b>
                  <i className="h-6 w-0.5 bg-stage-sun" />
                  <u className="h-3.5 w-3.5 translate-y-1.5 rounded-full border-[3px] border-stage-sun bg-stage/60 no-underline" />
                </div>
                <span className="absolute left-[83%] top-[52%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-stage/70 px-2 py-0.5 text-[13px]">in shadow</span>
                <span className="absolute left-[60%] top-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#f4f1ea]/85 px-2 py-0.5 text-[13px] text-[#15181d]">in sunlight</span>
              </div>
              <figcaption className="mt-3 text-sm leading-snug text-[#9e998f]">
                A ridge NASA shortlisted for a future crewed landing, seen from above on 2 January 2027. The black areas are shadow: ground the Sun cannot reach.{' '}
                {Math.round(hero.window_km)} km across, computed from NASA elevation data.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="why" aria-labelledby="h-why" className="wrap pt-16">
          <h2 id="h-why" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Why the south pole is hard
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">The Moon&apos;s water ice is there, and so is its hardest lighting. Three facts decide whether a lander lives.</p>
          {/* Three across on a laptop; under 1024 px each drawing sits beside its text, and on a phone above it. */}
          <div className="mt-7 grid gap-6 lg:grid-cols-3">
            <div className={WHY_CARD}>
              <SunNeverClimbs />
              <div>
                <h3 className="font-display text-[22px] font-semibold">The Sun never climbs</h3>
                <p className="mt-2 text-ink-2">Near the pole the Sun circles the horizon once a month instead of rising overhead. It is never more than a few degrees up.</p>
              </div>
            </div>
            <div className={WHY_CARD}>
              <HillsDecide rimPct={pair.rim_sun_pct} sitePct={Math.round(pair.site_sun_pct)} km={Math.round(pair.distance_km)} />
              <div>
                <h3 className="font-display text-[22px] font-semibold">The hills decide</h3>
                <p className="mt-2 text-ink-2">
                  A ridge can hide the Sun for weeks while a peak nearby stays lit. In January 2027 the rim of one crater has sunlight {pair.rim_sun_pct >= 99.95 ? 'all month' : `${Math.round(pair.rim_sun_pct)} % of the time`}; a point{' '}
                  {Math.round(pair.distance_km)} km away has it {Math.round(pair.site_sun_pct)} % of the time.
                </p>
              </div>
            </div>
            <div className={WHY_CARD}>
              <EarthSetsToo />
              <div>
                <h3 className="font-display text-[22px] font-semibold">Earth sets too</h3>
                <p className="mt-2 text-ink-2">Earth hangs near one compass direction and drifts a few degrees up and down each month. When it dips behind the hills, the lander cannot talk to Earth directly.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="h-real" className="wrap pt-16">
          <h2 id="h-real" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            See it at a real site
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">
            The gold line is the Sun&apos;s height at that ridge through January 2027, read from left to right. The grey shape is the height of the hills in the Sun&apos;s direction. Where the grey stands above the line, it is night.
          </p>
          <div className="stage mt-6">
            <SkyRow el={sky.sun_el} hill={sky.hill_el} visible={sky.lit} az={sky.sun_az} startUtc={sky.start_utc} body="sun" caption={`The Sun at ${hero.name}, January 2027`} />
          </div>
          <p className="mt-6">
            <Link href={siteLink} className="font-semibold text-sun-ink">
              Open this site and play the month
            </Link>
          </p>
        </section>

        <section aria-labelledby="h-missions" className="wrap pt-16">
          <h2 id="h-missions" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Start from a real mission
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">Two commercial landers reached the Moon in March 2025. Light and line of sight explain how each one ended.</p>
          <ul className="mt-7 grid gap-6 md:grid-cols-3">
            {MISSIONS.map((m) => (
              <li key={m.href} className="panel flex flex-col gap-2.5 p-6">
                <span className={`w-fit rounded-full border px-3 py-1 text-sm font-semibold ${TONE[m.tone]}`}>{m.outcome}</span>
                <h3 className="mt-1 font-display text-[23px] font-semibold leading-tight">{m.title}</h3>
                <p className="text-ink-2">{m.body}</p>
                <Link href={m.href} aria-label={`Open this forecast: ${m.title}`} className="mt-auto pt-2.5 font-semibold text-sun-ink">
                  Open this forecast
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="h-proof" className="wrap pb-16 pt-16">
          <h2 id="h-proof" className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            Checked against NASA
          </h2>
          <p className="mt-2.5 max-w-[46em] text-lg text-ink-2">Each step is compared with an independent NASA source.</p>
          <div className="mt-7 grid gap-6 md:grid-cols-3">
            <div className="border-t-2 border-ink pt-4">
              <p className="flex items-center gap-3 font-display text-[44px] font-semibold leading-none tracking-[-0.02em]">
                <Check />
                {degreesText(facts.horizons_worst_el_deg)}
              </p>
              <h3 className="mt-3 text-[17px] font-semibold">Where the Sun and Earth are</h3>
              <p className="mt-1.5 max-w-[23em] text-ink-2">
                Largest gap between our positions and NASA&apos;s own calculator over {facts.horizons_rows} test cases. The Sun&apos;s disc is {thousandsText(facts.sun_disc_ratio)} times wider than that.
              </p>
            </div>
            <div className="border-t-2 border-ink pt-4">
              <p className="flex items-center gap-3 font-display text-[44px] font-semibold leading-none tracking-[-0.02em]">
                <Check />
                {facts.mazarico_median_points.toFixed(1)} points
              </p>
              <h3 className="mt-3 text-[17px] font-semibold">How much sunlight a site gets</h3>
              <p className="mt-1.5 max-w-[23em] text-ink-2">
                Typical gap between our 13-year sunlight percentages and NASA&apos;s own sunlight map, across {facts.mazarico_sites} sites. The largest gaps are narrow peaks that the coarser NASA map blurs.
              </p>
            </div>
            <div className="border-t-2 border-ink pt-4">
              <p className="flex items-center gap-3 font-display text-[44px] font-semibold leading-none tracking-[-0.02em]">
                <Check />
                {Math.abs(facts.blue_ghost_end_minus_sunset_h).toFixed(1)} hours
              </p>
              <h3 className="mt-3 text-[17px] font-semibold">When night falls on a real mission</h3>
              <p className="mt-1.5 max-w-[23em] text-ink-2">How close our predicted sunset came to the real end of the Blue Ghost mission in March 2025.</p>
            </div>
          </div>
          <p className="mt-7">
            <Link href="/validate" className="font-semibold text-sun-ink">
              See every check and rerun one live
            </Link>
          </p>
        </section>
      </main>
    </AppFrame>
  );
}
