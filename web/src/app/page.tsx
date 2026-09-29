import Image from 'next/image';
import Link from 'next/link';
import { AppFrame } from '@/components/AppFrame';

/** Three real stories, each opening Explore on the site and date where it happened. */
const STORIES: { title: string; kicker: string; body: string; href: string }[] = [
  {
    title: 'de Gerlache Rim 2',
    kicker: 'Artemis III candidate region',
    body: 'A ridge on the rim of de Gerlache crater near 88°S. Long days and long nights: drag the date and watch the terrain shadows decide when the Sun clears the skyline and whether a battery lasts.',
    href: '/explore?site=de_gerlache_rim_2',
  },
  {
    title: 'IM-2 Athena, March 2025',
    kicker: 'CLPS landing that ended in a day',
    body: 'Landed near Mons Mouton on 6 March 2025, came to rest on its side in a crater and drained its batteries with the Sun still up. Replay the sky it never got to use.',
    href: '/explore?site=im2_athena&start=2025-03-06',
  },
  {
    title: 'Blue Ghost Mission 1, March 2025',
    kicker: 'CLPS landing that lived the whole day',
    body: 'A mare site with a flat skyline in Mare Crisium, far from the pole: two weeks of sunlight and Earth always in view. The easy case the polar sites are measured against.',
    href: '/explore?site=blue_ghost_m1&start=2025-03-02',
  },
];

/** Three renders of the Shackleton rim at three dates, captured from the app's own 3D view (20 m LOLA terrain): the shadows sweep once on load. */
const HERO_FRAMES = ['/hero/shackleton-rim-1.jpg', '/hero/shackleton-rim-2.jpg', '/hero/shackleton-rim-3.jpg'];

export default function Home() {
  return (
    <AppFrame>
      <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-6 md:px-6">
        <section data-testid="hero" className="relative min-h-[640px] overflow-hidden rounded-lg border border-line bg-sky">
          {HERO_FRAMES.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt={i === 0 ? 'The Shackleton crater rim under a low Sun: 20 m LOLA terrain rendered by Earthrise, shadows cast by the computed Sun direction' : ''}
              aria-hidden={i === 0 ? undefined : true}
              fill
              sizes="(min-width: 1152px) 1104px, 100vw"
              priority
              className={`hero-frame hero-frame-${i + 1} object-cover object-[35%_50%]`}
            />
          ))}
          <div className="absolute inset-x-0 bottom-0 p-4 md:p-8">
            <div className="glass max-w-xl rounded-md p-6">
              <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-[44px]">When is the Sun up, and can Earth hear you?</h1>
              <p className="mt-4 max-w-prose text-base text-ink-2 md:text-lg">
                Earthrise compares lunar south-pole landing sites and dates in seconds: the terrain skyline from NASA LOLA, the Sun and Earth from the JPL
                DE440 ephemeris, and the two numbers a lander lives or dies by, hours lit and hours with Earth in view.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <Link href="/explore" className="w-fit rounded-md bg-sun px-4 py-2 font-medium text-night hover:bg-sun-bright">
                  Explore a site
                </Link>
                <Link href="/compare" className="text-sm text-ink-2 underline-offset-4 hover:underline">
                  Compare sites
                </Link>
                <Link href="/validate" className="text-sm text-ink-2 underline-offset-4 hover:underline">
                  See the checks against JPL and LOLA
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="stories" className="flex flex-col gap-4">
          <h2 id="stories" className="font-display text-xl font-semibold">
            Start from a real mission
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {STORIES.map((s) => (
              <li key={s.href}>
                <Link href={s.href} aria-label={`Open in Explore: ${s.title}`} className="glass flex h-full flex-col gap-2 rounded-md p-5">
                  <p className="text-xs text-ink-3">{s.kicker}</p>
                  <h3 className="font-display text-xl font-semibold leading-tight">{s.title}</h3>
                  <p className="text-sm text-ink-2">{s.body}</p>
                  <p className="mt-auto pt-2 text-sm text-sun">Open in Explore</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2 text-sm text-ink-3">
          <p>
            Skylines come from NASA LRO LOLA elevation models at 20, 80 and 240 m; Sun and Earth directions from the JPL DE440 ephemeris, checked against JPL
            Horizons and the LOLA illumination maps on the Validate page. Everything is computed in your browser; the planner assistant only drives the
            controls.
          </p>
          <p>
            New to lunar nights?{' '}
            <Link href="/learn" className="text-ink-2 underline-offset-4 hover:underline">
              Start with the guided story
            </Link>
            .
          </p>
        </section>
      </main>
    </AppFrame>
  );
}
