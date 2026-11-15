'use client';
import Link from 'next/link';
import { Fold } from '@/components/Fold';
import { ReliefMap, type MapPin } from '@/components/ReliefMap';
import { lolaFor, Sources } from '@/components/Sources';
import { exploreHref } from '@/components/sites/SitesView';
import { HOME } from '@/lib/data/home';
import { landedWords, pointKind } from '@/lib/data/kind';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { SiteOverview } from '@/lib/store/explore';
import { pct0 } from '@/lib/viz/format';
import { nearestSites, reliefUV } from '@/lib/viz/relief';
import type { TerrainQuality } from '@/lib/uncertainty/budget';
import { coldTrapWords, type ColdTrapSite } from '@/lib/coldtraps/coldtraps';
import { groundWords } from './GroundQuality';

/** Farther than this, another site is not "nearby": a mare lander's nearest neighbour is thousands of km away. */
const NEAR_KM = 300;

/** The place on the relief map of the south pole, one line about it, and the nearest other sites with their sunlight. */
export function WhereOnMoon({
  site,
  sites,
  overview,
  startUtc,
  days,
  wide = false,
  ground = null,
  coldTraps = null,
}: {
  site: Site;
  sites: Site[];
  overview: Record<string, SiteOverview>;
  startUtc: string;
  days: number;
  /** The panel has the whole row: the map sits beside the words instead of above them. */
  wide?: boolean;
  /** The ground at the site from NASA's adjusted south-pole maps, when the uncertainty budget measured it. */
  ground?: TerrainQuality | null;
  /** The modelled cold traps near the site (data/coldtraps), when the layer lists it. */
  coldTraps?: ColdTrapSite | null;
}) {
  const half = HOME.relief.half_km;
  const onMap = (uv: { u: number; v: number }) => uv.u > 0.02 && uv.u < 0.98 && uv.v > 0.02 && uv.v < 0.98;
  const pins: MapPin[] = sites
    .filter((s) => s.category !== 'custom' || s.id === site.id)
    .flatMap((s) => {
      const uv = reliefUV(s.lat, s.lon, half);
      if (!onMap(uv)) return [];
      const best = overview[s.id]?.best;
      return [{ id: s.id, ...uv, label: siteLabel(s), href: exploreHref(s.id, startUtc, days), tone: best && best.poweredHours >= 336 ? ('good' as const) : ('plain' as const) }];
    });
  const here = pins.some((p) => p.id === site.id);
  const near = nearestSites(site, sites, 3).filter((n) => n.km <= NEAR_KM);
  // The day it landed opens Explore there only inside the 2024 to 2036 table; an older landing keeps its date.
  const landed = landedWords(site);
  const cold = coldTrapWords(coldTraps);
  return (
    <section aria-label="Where on the Moon" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="display text-[23px] font-semibold">Where on the Moon</h2>
        <Link href="/sites" className="text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          See all sites
        </Link>
      </div>
      <div data-part="layout" className={wide ? 'mt-3 grid gap-x-8 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]' : ''}>
        <div className={wide ? 'md:col-start-2 md:row-start-1' : ''}>
        <p className="mt-2 text-ink-2">
          <b className="font-semibold text-ink">{siteLabel(site)}.</b> {site.blurb ? `${site.blurb}.` : `A place at ${Math.abs(site.lat).toFixed(2)}° ${site.lat < 0 ? 'S' : 'N'}.`}
          {!here && ' It lies far outside this map of the south pole.'} {pointKind(site).sentence}
          {site.far_side && ' It lies on the far side, where Earth never rises: a lander there talks to Earth through a relay satellite.'}
          {landed &&
            (landed.startUtc ? (
              <>
                {` It landed on ${landed.date}. `}
                <Link href={exploreHref(site.id, landed.startUtc, days)} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  See the days after it landed
                </Link>
              </>
            ) : (
              ` It landed on ${landed.date}, before the years this app covers (2024 to 2036), so the figures are for the days chosen above.`
            ))}
        </p>
        {/* The measured ground and the modelled cold traps are read once: one tap away, under the place's own line. */}
        {(ground || cold) && (
          <Fold label={ground && cold ? 'Ground detail and cold traps' : ground ? 'Ground detail' : 'Modelled cold traps'} className="text-[15px]">
            <div data-part="ground" className="text-ink-2">
              {ground && <p className="text-[15px]">{groundWords(ground)}</p>}
              {cold && (
                <p className="mt-1 text-[15px]">
                  {cold}{' '}
                  <Link href="/learn#cold-traps" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                    What a cold trap is
                  </Link>
                </p>
              )}
            </div>
          </Fold>
        )}
        </div>
        <div className={`mt-3 ${wide ? 'md:col-start-1 md:row-span-3 md:row-start-1 md:mt-0' : ''}`}>
          <ReliefMap pins={pins} selectedId={site.id} />
          <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
            <span className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full bg-sun" />
              this site
            </span>
            <span className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full bg-good" />
              two weeks or more with power
            </span>
            <span className="flex items-center gap-2">
              <i className="h-3 w-3 rounded-full border-2 border-ink-3" />
              less
            </span>
          </p>
        </div>
        <div className={wide ? 'md:col-start-2 md:row-start-2' : ''}>
          {near.length === 0 ? (
            <p className="mt-4 border-t border-line pt-3 text-[15px] text-ink-2">No other site in the list is within {NEAR_KM} km.</p>
          ) : (
            <>
              <p id="near-title" className="mt-4 flex justify-between border-b border-line pb-2 text-[15px] font-semibold text-ink-2">
                <span>Nearby sites, same {days} days</span>
                <span>Sunlight</span>
              </p>
              <ul aria-label={`Nearby sites, same ${days} days`} className="divide-y divide-line">
                {near.map(({ site: other, km }) => {
                  const o = overview[other.id];
                  return (
                    <li key={other.id}>
                      <Link href={exploreHref(other.id, startUtc, days)} className="flex min-h-[48px] items-center gap-4 py-2 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium underline decoration-line-strong underline-offset-4">{siteLabel(other)}</span>, {km < 10 ? km.toFixed(1) : Math.round(km)} km away
                        </span>
                        {!o ? (
                          <span className="text-[15px] text-ink-2">working it out…</span>
                        ) : o.sunFraction > 0 ? (
                          <>
                            <span aria-hidden="true" className="h-2 w-20 overflow-hidden rounded-full bg-surface-2">
                              <span className="block h-full rounded-full bg-sun" style={{ width: `${Math.round(o.sunFraction * 100)}%` }} />
                            </span>
                            <b className="w-14 text-right font-semibold">{pct0(o.sunFraction)}</b>
                          </>
                        ) : (
                          <span className="text-[15px] text-ink-2">no sunlight</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      {/* The relief is LOLA's 80 m grid. The sunlight figures and the pins' colours come from horizons on the 20 m grid
          near the pole and the 80 m grid farther out, with DE440. The pins are NASA's Artemis III regions and the CLPS
          landings: IM-2 Athena is always on the map. A site north of 80° S reads its skyline from the 240 m grid. The
          cold-trap line, where the layer reaches the site, comes from Diviner's model. */}
      <Sources of={['lola', 'lola80', ...lolaFor(site).filter((k) => k === 'lola240'), ...(coldTraps?.covered ? (['diviner'] as const) : []), 'de440', 'artemis', 'clps']} />
    </section>
  );
}
