'use client';
import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from '@/components/AppFrame';
import { DataProblem, SYNC_HINT } from '@/components/DataProblem';
import { PeriodControls } from '@/components/PeriodControls';
import { SkylineNote } from '@/components/SkylineNote';
import { Sources } from '@/components/Sources';
import { HOME } from '@/lib/data/home';
import { pointKind } from '@/lib/data/kind';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { landerLine } from '@/lib/lander';
import { exploreStore, type ExploreState, type SiteOverview } from '@/lib/store/explore';
import { landingWords } from '@/lib/period';
import { dayMonth, isoAt, pct0, spanShort } from '@/lib/viz/format';
import { terrainTag } from '@/lib/viz/terrain';
import { exploreHref } from '@/lib/links';
import { coldTrapShort, coldTrapSite, type ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import { useColdTraps } from '@/lib/coldtraps/useColdTraps';
import { GroupMark, MARKER_GROUPS, SiteMap, type MarkerGroup, type SiteMarker } from './SiteMap';

/** Explore's own-site mode: no site filled in, the visitor gives the place and the details there. */
export const OWN_SITE_HREF = '/explore?own=1';

/** The catalogue's categories in the map's three groups; any other category stands with the last. */
const GROUP_OF: Record<string, MarkerGroup> = { artemis3: 'artemis', clps_landed: 'lander', clps_planned: 'lander', apollo: 'lander', international: 'lander' };
const groupOf = (site: Site): MarkerGroup => GROUP_OF[site.category] ?? 'other';

/** The Explore address for a site and a period; the hour is kept only when the period does not start at midnight. */
export { exploreHref };

/** A site opens Explore on the landing day its figures name, where every one of them is a figure Explore shows; without a better day, on the period's start. */
function siteHref(siteId: string, o: SiteOverview | undefined, startUtc: string, days: number): string {
  return exploreHref(siteId, o?.best && o.best.hour > 0 ? isoAt(startUtc, o.best.hour) : startUtc, days);
}

/** The list is ranked by the longest time with power, then by sunlight; a site with incomplete terrain after them (its figures may be too high), a site without figures last. */
const rank = (o: SiteOverview | undefined) => (o ? (o.terrain?.quality === 'incomplete' ? -1e6 : 0) + (o.best?.poweredHours ?? -1) * 10 + o.afterSun : -1e7);
/** A place that never sees Earth in its first days after landing: a lander there cannot send home what it finds. */
const noContact = (o: SiteOverview | undefined) => o !== undefined && o.afterEarth === 0;
/** On the far side Earth never rises at all (data/sites.json "far_side", checked against every hour of the table). */
const farSide = (site: Site) => site.far_side === true;

/**
 * A site's figures for the chosen dates, in two short lines: its sunlight and its view of Earth over the days after
 * its best landing day, then the longest time the example lander keeps power and that day.
 */
function siteFacts(site: Site, o: SiteOverview | undefined, startUtc: string, days: number, problem: string | null | undefined): string[] {
  if (!o) return [problem ? 'Could not be worked out for this mast height' : 'Working it out…'];
  const sun = o.afterSun > 0 ? `Sunlight ${pct0(o.afterSun)}` : 'No sunlight';
  const earth = o.afterEarth > 0 ? `Earth in view ${pct0(o.afterEarth)}` : farSide(site) ? 'Earth never in view: far side' : 'No contact with Earth';
  const power = o.best
    ? `Longest with power: ${o.best.poweredHours >= days * 24 ? `all ${days} days` : spanShort(Math.round(o.best.poweredHours))}, landing ${dayMonth(startUtc, o.best.hour)}`
    : 'No power from the Sun';
  return [`${sun} · ${earth}`, power];
}

/** A site in the list: its name, what kind of point it is and the same figures as its card on the map. */
function Row({ site, facts, tag, cold, href }: { site: Site; facts: string[]; tag: string | null; cold: string | null; href: string }) {
  return (
    <li>
      <Link href={href} data-row={site.id} title={site.blurb} className="group block rounded-lg px-3 py-2.5 hover:bg-surface-2">
        <span className="block text-[17px] font-semibold leading-snug group-hover:text-accent-ink">{siteLabel(site)}</span>
        {/* What kind of point the coordinate is, so a region's centre or a derived high point never reads as a surveyed landing spot. */}
        <span className="block text-[15px] text-ink-2">
          <span className="sr-only">, </span>
          {pointKind(site).short}
        </span>
        {tag && (
          <span className="block text-[15px] font-medium text-warn">
            <span className="sr-only">, </span>
            {tag}
          </span>
        )}
        {facts.map((line) => (
          <span key={line} className="block text-[15px] text-ink">
            <span className="sr-only">, </span>
            {line}
          </span>
        ))}
        {/* The modelled cold traps near a polar site (data/coldtraps). */}
        {cold && (
          <span className="block text-[15px] text-ink-2">
            <span className="sr-only">, </span>
            {cold}
          </span>
        )}
      </Link>
    </li>
  );
}

/** What the three marks stand for: beside the title on a wide screen, under the maps on a narrow one. */
function MarkerKey({ className }: { className: string }) {
  return (
    <ul aria-label="Key to the markers" className={`flex gap-x-5 gap-y-1.5 text-[15px] text-stage-ink-2 ${className}`}>
      {MARKER_GROUPS.map((g) => (
        <li key={g.group} className="flex items-center gap-2.5">
          <GroupMark group={g.group} />
          {g.name}
        </li>
      ))}
    </ul>
  );
}

/**
 * "Choose a landing site" (spec 23): the map is the page. Every catalogue site is a marker on the south pole's relief
 * or on the inset of the whole Moon; its name and figures show while it is pointed at, and it opens Explore filled in
 * for it. The bar under the map holds the dates the figures are for, the same sites as a list, and the way to a
 * site of one's own, which Explore asks for.
 */
export function SitesView({ store = exploreStore, coldTraps }: { store?: StoreApi<ExploreState>; coldTraps?: () => Promise<ColdTrapDoc> }) {
  const s = useStore(store);
  const coldDoc = useColdTraps(coldTraps);
  const [open, setOpen] = useState<'list' | 'dates' | null>(null);
  const listId = useId();
  const datesId = useId();
  const listHead = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    void store.getState().init();
  }, [store]);
  useEffect(() => {
    if (s.status === 'ready') void store.getState().loadOverview();
  }, [store, s.status, s.startUtc, s.days, s.params]);
  // The list opens with the focus on its heading, so the keyboard and a screen reader start at its top.
  useEffect(() => {
    if (open === 'list') listHead.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const catalogue = useMemo(() => s.sites.filter((x) => x.category !== 'custom'), [s.sites]);
  const entries = useMemo(
    () =>
      catalogue.map((site) => {
        const o = s.overview[site.id];
        return { site, o, href: siteHref(site.id, o, s.startUtc, s.days), facts: siteFacts(site, o, s.startUtc, s.days, s.skylineProblems[site.id]), tag: terrainTag(o?.terrain) };
      }),
    [catalogue, s.overview, s.startUtc, s.days, s.skylineProblems],
  );
  const markers: SiteMarker[] = useMemo(
    () =>
      entries.map(({ site, href, facts, tag }) => {
        const pin = HOME.relief.sites.find((p) => p.id === site.id);
        return { id: site.id, label: siteLabel(site), group: groupOf(site), href, at: pin ? { u: pin.u, v: pin.v } : { lat: site.lat, lon: site.lon }, kind: pointKind(site).short, facts, warn: tag };
      }),
    [entries],
  );
  const groups = useMemo(() => {
    // The order changes once, when every figure is in: rows must not jump under the pointer while they load.
    const settled = !s.overviewBusy && Object.keys(s.overview).length > 0;
    // Longest with power first; then the places with no contact with Earth in these days, and the far side, which never has any.
    const tier = (e: (typeof entries)[number]) => (farSide(e.site) ? 2 : noContact(e.o) ? 1 : 0);
    return MARKER_GROUPS.map((g) => {
      const rows = entries.filter((e) => groupOf(e.site) === g.group);
      return { ...g, rows: settled ? [...rows].sort((a, b) => tier(a) - tier(b) || rank(b.o) - rank(a.o)) : rows };
    });
  }, [entries, s.overview, s.overviewBusy]);

  if (s.status === 'idle' || s.status === 'loading') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">Loading NASA data…</p>
        </main>
      </AppFrame>
    );
  }
  if (s.status === 'error') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <DataProblem error={s.error} hint={SYNC_HINT} />
        </main>
      </AppFrame>
    );
  }

  const toggle = (what: 'list' | 'dates') => setOpen((now) => (now === what ? null : what));
  return (
    <AppFrame>
      <main>
        {/* The window under the header: the map, and the bar at its foot. The bar comes first for the keyboard, before the markers. */}
        <div data-part="screen" className="relative flex flex-col lg:h-[calc(100svh-69px)] lg:min-h-[600px]">
          <div data-part="bar" className="sticky bottom-0 z-[38] order-last flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line bg-page py-3 pl-[132px] pr-4 sm:pl-[190px] lg:pr-8">
            <button type="button" aria-expanded={open === 'dates'} aria-controls={datesId} onClick={() => toggle('dates')} className="btn btn-sm max-sm:px-3">
              <span className="text-ink-2 max-sm:sr-only">Dates</span>
              <span className="sr-only">: </span>
              <span>
                <span className="max-sm:hidden">{landingWords(s.startUtc, true)}</span>
                <span className="sm:hidden">
                  {dayMonth(s.startUtc, 0)} {s.startUtc.slice(0, 4)}
                </span>
                , {s.days} days
              </span>
            </button>
            <button type="button" aria-expanded={open === 'list'} aria-controls={listId} onClick={() => toggle('list')} className="btn btn-sm max-sm:px-3">
              List
            </button>
            <Link href={OWN_SITE_HREF} className="btn btn-sm btn-primary">
              Choose your own site
            </Link>
            {open === 'dates' && (
              <section id={datesId} aria-label="The dates the figures are for" className="panel absolute bottom-full right-4 mb-3 w-[min(600px,calc(100vw-32px))] shadow-[0_24px_60px_-20px_rgb(var(--glow)/var(--glow-strength))] lg:right-8">
                <div className="flex flex-wrap items-end gap-4">
                  <PeriodControls startUtc={s.startUtc} days={s.days} onChange={s.setWindow} />
                </div>
                <p className="mt-4 text-[15px] text-ink-2">
                  Each site&apos;s figures are for landing on its best day of the {s.days} days from {landingWords(s.startUtc, true)} and the {s.days} days after it, for one lander:{' '}
                  {landerLine(s.params.power)}, the hills seen from a {s.params.mastM} m mast. Explore and Compare start on the first day, so their figures can differ.
                </p>
              </section>
            )}
          </div>
          <section aria-label="Map of the sites" data-part="stage" data-stage="" className="relative bg-stage text-stage-ink lg:min-h-0 lg:flex-1">
            <div data-part="title" className="pointer-events-none relative z-20 px-4 pb-3 pt-5 lg:absolute lg:left-8 lg:top-8 lg:max-w-[460px] lg:p-0">
              <h1 className="display text-[34px] leading-none sm:text-[40px] lg:text-[52px]">
                Choose a <em>landing site</em>
              </h1>
              <p className="mt-2 text-[17px] text-stage-ink-2 lg:mt-3">
                <span className="max-lg:hidden">Point at a marker for its name, and click to open it.</span>
                <span className="lg:hidden">Tap a marker, then its name to open it.</span>
              </p>
              <MarkerKey className="mt-4 flex-col max-lg:hidden" />
              {/* While the hills are worked out again for a new mast height, and when they could not be. */}
              <SkylineNote state={s} ids={catalogue.map((x) => x.id)} className="mt-3 !text-stage-ink-2" />
              {s.error && (
                <p role="status" className="mt-3 text-[#f0b860]">
                  {s.error}
                </p>
              )}
            </div>
            {open === 'list' && (
              <section id={listId} aria-labelledby={`${listId}-h`} data-part="list" className="relative z-[35] border-line bg-page px-3 pb-6 pt-5 text-ink lg:absolute lg:inset-y-0 lg:right-0 lg:w-[440px] lg:overflow-y-auto lg:border-l">
                <div className="flex items-center justify-between gap-4 px-3">
                  <h2 id={`${listId}-h`} ref={listHead} tabIndex={-1} className="display text-[28px] leading-none outline-none">
                    All {catalogue.length} sites
                  </h2>
                  <button type="button" onClick={() => setOpen(null)} className="btn btn-sm">
                    Close
                  </button>
                </div>
                {groups.map((g) => (
                  <section key={g.group} aria-labelledby={`${listId}-${g.group}`} className="mt-6">
                    <h3 id={`${listId}-${g.group}`} className="flex items-center gap-2.5 border-b border-line-strong px-3 pb-2 text-[15px] font-semibold text-ink-2">
                      {g.name}
                    </h3>
                    <ul className="mt-1">
                      {g.rows.map((e) => (
                        <Row key={e.site.id} site={e.site} facts={e.facts} tag={e.tag} cold={coldTrapShort(coldTrapSite(coldDoc, e.site.id))} href={e.href} />
                      ))}
                    </ul>
                  </section>
                ))}
              </section>
            )}
            {/* On a narrow screen the open list takes the map's place; on a wide one it stands beside it. */}
            <div data-part="maps" className={open === 'list' ? 'max-lg:hidden' : undefined}>
              <SiteMap markers={markers} />
              <MarkerKey className="flex-wrap px-4 pb-5 pt-1 lg:hidden" />
            </div>
          </section>
        </div>
        {/* The figures come from horizons on LOLA's 20 m grid near the pole, its 80 m grid farther out and its 240 m grid
            north of 80° S, with DE440; the list's cold-trap line, once its layer is in, from Diviner's model. The places are
            NASA's Artemis III regions, the CLPS landings and the landers LROC and NSSDCA have located; the inset is the CGI Moon Kit's map. */}
        <div className="wrap py-6">
          <Sources of={['lola', 'lola80', 'lola240', ...(coldDoc ? (['diviner'] as const) : []), 'de440', 'artemis', 'clps', 'landers', 'moonkit']} />
        </div>
      </main>
    </AppFrame>
  );
}
