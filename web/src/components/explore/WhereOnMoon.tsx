'use client';
import Link from 'next/link';
import { ReliefMap, type MapPin } from '@/components/ReliefMap';
import { exploreHref } from '@/components/sites/SitesView';
import { HOME } from '@/lib/data/home';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { SiteOverview } from '@/lib/store/explore';
import { pct0 } from '@/lib/viz/format';
import { nearestSites, reliefUV } from '@/lib/viz/relief';

/** The place on the relief map of the south pole, one line about it, and the nearest other sites with their sunlight. */
export function WhereOnMoon({ site, sites, overview, startUtc, days }: { site: Site; sites: Site[]; overview: Record<string, SiteOverview>; startUtc: string; days: number }) {
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
  const near = nearestSites(site, sites, 3);
  return (
    <section aria-label="Where on the Moon" className="panel">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="display text-[23px] font-semibold">Where on the Moon</h2>
        <Link href="/sites" className="text-[15px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          See all sites
        </Link>
      </div>
      <p className="mt-2 text-ink-2">
        <b className="font-semibold text-ink">{siteLabel(site)}.</b> {site.blurb ? `${site.blurb}.` : `A place at ${Math.abs(site.lat).toFixed(2)}° ${site.lat < 0 ? 'S' : 'N'}.`}
        {!here && ' It lies far outside this map of the south pole.'}
      </p>
      <div className="mt-3">
        <ReliefMap pins={pins} selectedId={site.id} />
      </div>
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
    </section>
  );
}
