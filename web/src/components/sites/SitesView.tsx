'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from '@/components/AppFrame';
import { DataProblem, SYNC_HINT } from '@/components/DataProblem';
import { hasNo, missingPart } from '@/lib/data/parts';
import { MoonNebula } from '@/components/MoonNebula';
import { PeriodControls } from '@/components/PeriodControls';
import { SkylineNote } from '@/components/SkylineNote';
import { ReliefMap, type MapPin } from '@/components/ReliefMap';
import { Sources } from '@/components/Sources';
import { Tip } from '@/components/Tip';
import { HOME } from '@/lib/data/home';
import { pointKind } from '@/lib/data/kind';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { landerLine } from '@/lib/lander';
import { exploreStore, type ExploreState, type SiteOverview } from '@/lib/store/explore';
import { landingWords } from '@/lib/period';
import { dayMonth, isoAt, pct0, spanShort } from '@/lib/viz/format';
import { checkPick } from '@/lib/viz/pick';
import { missingWords, pickProblem, terrainTag } from '@/lib/viz/terrain';
import { exploreHref } from '@/lib/links';
import { coldTrapShort, coldTrapSite, type ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import { useColdTraps } from '@/lib/coldtraps/useColdTraps';

const TWO_WEEKS_H = 14 * 24;

const GROUPS: { title: string; note: string; categories: string[] }[] = [
  {
    title: 'Shortlisted by NASA for a crewed Artemis landing',
    note: 'The nine candidate regions NASA named in October 2024. Each figure is for the centre of the region.',
    categories: ['artemis3'],
  },
  { title: 'Where commercial landers touched down', note: 'The landing spots of three real missions, for the same days as the rest of the list.', categories: ['clps_landed'] },
  { title: 'Where commercial landers are to land next', note: 'Two landings NASA has ordered, at the places announced so far.', categories: ['clps_planned'] },
  { title: 'Landers from other countries', note: "The landers of India, China and Japan, and the place Russia's Luna 25 was aiming for when it crashed.", categories: ['international'] },
  {
    title: 'Where the Apollo crews landed',
    note: 'The six crewed landings of 1969 to 1972, near the equator. Like every row here, the figures are for the days chosen above and the same lander, whose upright panel catches little of a Sun almost overhead.',
    categories: ['apollo'],
  },
  { title: 'High points and crater floors', note: 'The extremes: rims that almost never lose the Sun, floors that never see it.', categories: ['classic', 'reference'] },
];

const COLUMNS = 'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_16px] items-center gap-x-5';

/** The Explore address for a site and a period; the hour is kept only when the period does not start at midnight. */
export { exploreHref };

/** A row opens Explore on the landing day it names, where every figure of the row is one Explore shows; without a better day, on the period's start. */
function siteHref(siteId: string, o: SiteOverview | undefined, startUtc: string, days: number): string {
  return exploreHref(siteId, o?.best && o.best.hour > 0 ? isoAt(startUtc, o.best.hour) : startUtc, days);
}

/** Rows are ranked by the longest time with power, then by sunlight; a site with incomplete terrain after them (its figures may be too high), a site without figures last. */
const rank = (o: SiteOverview | undefined) => (o ? (o.terrain?.quality === 'incomplete' ? -1e6 : 0) + (o.best?.poweredHours ?? -1) * 10 + o.afterSun : -1e7);
/** A place that never sees Earth in its first days after landing: a lander there cannot send home what it finds. */
const noContact = (o: SiteOverview | undefined) => o !== undefined && o.afterEarth === 0;
/** On the far side Earth never rises at all (data/sites.json "far_side", checked against every hour of the table). */
const farSide = (site: Site) => site.far_side === true;

function Row({ site, o, href, startUtc, days, active, onActive, problem = null, cold = null }: { site: Site; o: SiteOverview | undefined; href: string; startUtc: string; days: number; active: boolean; onActive: (id: string | null) => void; problem?: string | null; cold?: string | null }) {
  const capped = o?.best ? o.best.poweredHours >= days * 24 : false;
  const tag = terrainTag(o?.terrain);
  return (
    <li>
      <Link
        href={href}
        data-row={site.id}
        data-active={active ? 'true' : undefined}
        onMouseEnter={() => onActive(site.id)}
        onMouseLeave={() => onActive(null)}
        onFocus={() => onActive(site.id)}
        onBlur={() => onActive(null)}
        className={`group ${COLUMNS} rounded-xl px-3 py-4 transition-[background-color,box-shadow] duration-300 ${active ? 'bg-surface shadow-[0_0_0_1px_rgb(var(--glow)/0.3),0_0_32px_-14px_rgb(var(--glow)/var(--glow-strength))]' : 'hover:bg-surface'}`}
      >
        <span>
          <span className="block text-[17px] font-semibold leading-snug transition-colors group-hover:text-accent-ink">{siteLabel(site)}</span>
          {/* The day every figure of the row counts from, before the figures. */}
          {o?.best && (
            <span className="mt-0.5 block text-[15px] font-medium text-ink">
              <span className="sr-only">, </span>Best landing day: {dayMonth(startUtc, o.best.hour)}
            </span>
          )}
          <span className="mt-0.5 block text-[15px] text-ink-2">{site.blurb}</span>
          {/* What kind of point the coordinate is, so a region's centre or a derived high point never reads as a surveyed landing spot. */}
          <span className="mt-0.5 block text-[15px] text-ink-2">
            <span className="sr-only">, </span>
            {pointKind(site).short}
          </span>
          {tag && <span className="mt-0.5 block text-[15px] font-medium text-warn">{tag}</span>}
        </span>
        {!o ? (
          <span className="col-span-3 text-[15px] text-ink-2">{problem ? 'could not be worked out for this mast height' : 'working it out…'}</span>
        ) : (
          <>
            <span className="flex items-center gap-3">
              <span className="sr-only"> Sunlight </span>
              {o.afterSun > 0 ? (
                <>
                  <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span data-bar="sun" className="block h-full rounded-full bg-sun shadow-[0_0_8px_rgb(235_232_223/0.5)]" style={{ width: `${Math.round(o.afterSun * 100)}%` }} />
                  </span>
                  <b className="w-12 text-right font-semibold">{pct0(o.afterSun)}</b>
                </>
              ) : (
                <span className="text-[15px] text-ink-2">No sunlight</span>
              )}
            </span>
            <span className="flex items-center gap-3">
              <span className="sr-only"> Earth in view </span>
              {o.afterEarth > 0 ? (
                <>
                  <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <span data-bar="earth" className="block h-full rounded-full bg-earth shadow-[0_0_8px_rgb(var(--glow)/0.6)]" style={{ width: `${Math.round(o.afterEarth * 100)}%` }} />
                  </span>
                  <b className="w-12 text-right font-semibold">{pct0(o.afterEarth)}</b>
                </>
              ) : (
                <span className="text-[15px] text-ink-2">{farSide(site) ? 'Never: far side' : 'No contact with Earth'}</span>
              )}
            </span>
            <span>
              <span className="sr-only"> Longest time with power </span>
              {o.best ? (
                <>
                  <b className={`block font-semibold ${o.best.poweredHours >= TWO_WEEKS_H ? 'text-good' : ''}`}>{capped ? `all ${days} days` : spanShort(Math.round(o.best.poweredHours))}</b>
                </>
              ) : (
                <span className="text-[15px] text-ink-2">No power from the Sun</span>
              )}
            </span>
          </>
        )}
        <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-ink-3 transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-accent-ink" aria-hidden="true">
          <path d="M6 3l5 5-5 5" />
        </svg>
        {/* The modelled cold traps near a polar site (data/coldtraps), under its power and radio figures across the whole row,
            so the narrow site column does not grow on a phone. */}
        {cold && (
          <span className="col-span-full mt-1 block text-[15px] text-ink-2">
            <span className="sr-only">, </span>
            {cold}
          </span>
        )}
      </Link>
    </li>
  );
}

function Elsewhere({ store, navigate }: { store: StoreApi<ExploreState>; navigate: (href: string) => void }) {
  const busy = useStore(store, (s) => s.maskBusy);
  const [lat, setLat] = useState('-89.5');
  const [lon, setLon] = useState('0');
  const [problem, setProblem] = useState<string | null>(null);
  async function submit() {
    const pick = lat.trim() === '' || lon.trim() === '' ? { ok: false as const } : checkPick(Number(lat), Number(lon));
    if (!pick.ok || pick.lat < -90) {
      setProblem('This tool covers the Moon south of 60° S. Give a latitude between -90 and -60, and a longitude in degrees.');
      return;
    }
    setProblem(null);
    await store.getState().selectCustom(pick.lat, pick.lon);
    const failed = store.getState().customError;
    // Without the height tiles (a copy set up with the committed data alone) no new place can be traced: say so, and that
    // the list still works, rather than show the file that was not there.
    if (failed && missingPart(failed) === 'tiles') setProblem(`That place cannot be worked out here: ${hasNo('tiles')}. The places in the list work without them.`);
    else if (failed) setProblem(pickProblem(failed));
    else navigate('/explore');
  }
  return (
    <section aria-labelledby="h-elsewhere" className="panel mt-12 rounded-2xl">
      <h2 id="h-elsewhere" className="display text-[32px]">
        Somewhere else
      </h2>
      <p className="mt-1.5 max-w-[46em] text-ink-2">Any point south of 60° S works. The hills around it are read from NASA elevation data in your browser, which takes a few seconds.</p>
      <form
        className="mt-4 flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
          Latitude (°)
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className="field w-36" />
        </label>
        <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
          Longitude (°)
          <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" className="field w-36" />
        </label>
        <button type="submit" disabled={busy} className="btn h-[52px]">
          {busy ? 'Working it out…' : 'Compute this place'}
        </button>
        {problem && (
          <p role="alert" className="basis-full text-bad">
            {problem}
          </p>
        )}
      </form>
    </section>
  );
}

/** The title band's sky: the planet and the bright gas stand right, clear of the title at the lower left. */
const SKY = { planetX: 0.82, planetY: 0.55, planetRadius: 0.12, bandAngle: 0.2, bandOffset: 0.1, sparkles: 6 };

/** "Choose a landing site": every catalogue site with its sunlight, its contact with Earth and its longest time with power. */
export function SitesView({ store = exploreStore, navigate, coldTraps }: { store?: StoreApi<ExploreState>; navigate?: (href: string) => void; coldTraps?: () => Promise<ColdTrapDoc> }) {
  const s = useStore(store);
  const coldDoc = useColdTraps(coldTraps);
  const coldOf = (id: string) => coldTrapShort(coldTrapSite(coldDoc, id));
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    void store.getState().init();
  }, [store]);
  useEffect(() => {
    if (s.status === 'ready') void store.getState().loadOverview();
  }, [store, s.status, s.startUtc, s.days, s.params]);

  const catalogue = useMemo(() => s.sites.filter((x) => x.category !== 'custom'), [s.sites]);
  const groups = useMemo(() => {
    const settled = !s.overviewBusy && Object.keys(s.overview).length > 0;
    return GROUPS.map((g) => {
      const all = catalogue.filter((x) => g.categories.includes(x.category));
      // The far side never sees Earth, whatever the period: its rows have a heading of their own from the start.
      const rows = all.filter((x) => !farSide(x));
      const far = all.filter(farSide);
      // The order changes once, when every figure is in: rows must not jump under the pointer while they load.
      if (!settled) return { ...g, rows, without: [] as Site[], far };
      const byRank = (list: Site[]) => [...list].sort((a, b) => rank(s.overview[b.id]) - rank(s.overview[a.id]));
      const sorted = byRank(rows);
      return { ...g, rows: sorted.filter((x) => !noContact(s.overview[x.id])), without: sorted.filter((x) => noContact(s.overview[x.id])), far: byRank(far) };
    });
  }, [catalogue, s.overview, s.overviewBusy]);
  const pins: MapPin[] = useMemo(() => {
    // The pole first, as the map's landmark, then in the order of the list, so the names written on the map are those of the rows at the top.
    const order = ['south_pole', ...groups.flatMap((g) => [...g.rows, ...g.without, ...g.far].map((r) => r.id))];
    return HOME.relief.sites
      .flatMap((p) => {
        const site = catalogue.find((x) => x.id === p.id);
        if (!site) return [];
        const best = s.overview[p.id]?.best;
        return [{ id: p.id, u: p.u, v: p.v, label: siteLabel(site), href: siteHref(p.id, s.overview[p.id], s.startUtc, s.days), tone: best && best.poweredHours >= TWO_WEEKS_H ? ('good' as const) : ('plain' as const) }];
      })
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }, [groups, catalogue, s.overview, s.startUtc, s.days]);
  const top = useMemo(() => {
    if (s.overviewBusy) return null;
    const better = (o: SiteOverview, than: SiteOverview) => o.best!.poweredHours > than.best!.poweredHours || (o.best!.poweredHours === than.best!.poweredHours && o.afterEarth > than.afterEarth);
    let found: { site: Site; o: SiteOverview } | null = null;
    let doubtful: { site: Site; o: SiteOverview } | null = null;
    for (const site of catalogue) {
      const o = s.overview[site.id];
      if (!o?.best || o.afterEarth === 0) continue;
      // A site with incomplete terrain is never named: its figures can only be too high.
      if (o.terrain?.quality === 'incomplete') {
        if (!doubtful || better(o, doubtful.o)) doubtful = { site, o };
      } else if (!found || better(o, found.o)) found = { site, o };
    }
    // Named only when no incomplete site could beat it: an incomplete figure, too high if anything, that is no higher cannot.
    if (doubtful && (!found || better(doubtful.o, found.o))) return { withheld: doubtful };
    return found;
  }, [catalogue, s.overview, s.overviewBusy]);
  const offMap = catalogue.filter((x) => !HOME.relief.sites.some((p) => p.id === x.id)).length;

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

  return (
    <AppFrame>
      <main className="pb-16">
        {/* The page's title over the Moon's sky in halftone (spec 23). */}
        <MoonNebula height="clamp(280px, 38svh, 380px)" params={SKY} scrim="left">
          <div className="wrap flex h-full w-full flex-col justify-end pb-10">
            <p className="eyebrow text-accent-ink">The south pole</p>
            <h1 data-band-end="" className="display mt-3 text-[48px] leading-none sm:text-[72px]">
              Choose a <em>landing site</em>
            </h1>
            <p className="mt-4 max-w-[46em] text-lg text-ink-2">{catalogue.length} places on the Moon, most near the south pole.</p>
          </div>
        </MoonNebula>
        {/* What this page does, in three steps, on the page itself rather than behind a tap (spec 23). What the
            figures count from is one point away, on step 2's "i", and each column's meaning on its own: the first
            screen keeps to its 105 words (spec 20.1), so the steps are their headings and the dates' own fields. */}
        <ol aria-label="How to choose" className="wrap mt-8 grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
          <li className="border-t border-ink pt-4">
            <p className="flex items-baseline gap-3">
              <span className="pixel text-[20px] text-accent-ink">1</span>
              <span className="display text-[28px] leading-none">Pick the dates</span>
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <PeriodControls startUtc={s.startUtc} days={s.days} onChange={s.setWindow} />
            </div>
          </li>
          <li className="border-t border-line-strong pt-4">
            <p className="flex items-baseline gap-3">
              <span className="pixel text-[20px] text-accent-ink">2</span>
              <span className="display text-[28px] leading-none">Compare the places</span>
              <Tip label="How these figures are counted">
                Each site&apos;s figures are for landing on its best day of the {s.days} days from {landingWords(s.startUtc, true)}, the day under its name, and the {s.days} days after it,
                for one lander: {landerLine(s.params.power)}, the hills seen from a {s.params.mastM} m mast. Explore and Compare start on the first day, so their figures can differ. In each
                group, the longest time with power comes first.
              </Tip>
            </p>
          </li>
          <li className="border-t border-line-strong pt-4">
            <p className="flex items-baseline gap-3">
              <span className="pixel text-[20px] text-accent-ink">3</span>
              <span className="display text-[28px] leading-none">Open one</span>
            </p>
          </li>
        </ol>
        <div className="wrap">
          {s.error && (
            <p role="status" className="mt-3 text-warn">
              {s.error}
            </p>
          )}

          <div className="mt-12 grid items-start gap-10 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
            <section aria-label="Map of the sites" className="max-w-[520px] xl:sticky xl:top-6 xl:max-w-none">
              <p className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
                <span className="flex items-center gap-2">
                  <i className="h-3 w-3 rounded-full bg-good" />
                  two weeks or more with power
                </span>
                <span className="flex items-center gap-2">
                  <i className="h-3 w-3 rounded-full border-2 border-ink-3" />
                  less
                </span>
              </p>
              <ReliefMap pins={pins} activeId={active} onActive={setActive} nameAll />
              <p className="mt-3 text-[15px] text-ink-2">
                The south pole is at the centre of the map. Point at a row to find its site on the map.{offMap > 0 ? ` ${offMap} places lie farther from the pole, outside this map.` : ''}
              </p>
            </section>

            <div>
              {/* Over the rows that wait for their hills at a new mast height. */}
              <SkylineNote state={s} ids={catalogue.map((x) => x.id)} className="mb-6" />
              {top && 'withheld' in top && (
                <p className="mb-8 text-[17px] text-ink">
                  The longest time with power is not named: the terrain at {siteLabel(top.withheld.site)} is incomplete{missingWords(top.withheld.o.terrain) ? ` (${missingWords(top.withheld.o.terrain)})` : ''}, so its figures may be too high.
                </p>
              )}
              {top && 'o' in top && (
                <p className="mb-8 text-[17px] text-ink">
                  Longest time with power in these days:{' '}
                  <Link href={siteHref(top.site.id, top.o, s.startUtc, s.days)} className="font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                    {siteLabel(top.site)}
                  </Link>
                  {pointKind(top.site).kind === 'derived' && ', a derived high point not checked as safe to land'}, {top.o.best!.poweredHours >= s.days * 24 ? `all ${s.days} days` : spanShort(Math.round(top.o.best!.poweredHours))} if it lands on {dayMonth(s.startUtc, top.o.best!.hour)}.
                </p>
              )}
              {groups.map((g, i) => (
                <section key={g.title} aria-labelledby={`h-group-${i}`} className={i > 0 ? 'mt-10' : ''}>
                  <h2 id={`h-group-${i}`} className="display text-[32px] leading-tight">
                    {g.title}
                  </h2>
                  <p className="mt-1 text-ink-2">{g.note}</p>
                  {/* The column heads, each with what it means one point away. The rows say their own heads to a screen reader. */}
                  <div className={`${COLUMNS} mt-5 border-b border-ink px-3 pb-2 text-[15px] font-semibold text-ink-2`}>
                    <span aria-hidden="true">Site</span>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">Sunlight</span>
                      <Tip label="What Sunlight means">The share of the days after landing when the Sun stands above the hills around the site, so its panels get light.</Tip>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">Earth in view (radio)</span>
                      <Tip label="What Earth in view means">The share of those days when Earth stands above the hills, so the lander can talk to Earth directly by radio.</Tip>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">Longest time with power</span>
                      <Tip label="What Longest time with power means" side="right">
                        How long the example lander keeps its battery up, landing on the site&apos;s best day. Green: two weeks or more.
                      </Tip>
                    </span>
                    <span />
                  </div>
                  <ul className="divide-y divide-line-strong">
                    {g.rows.map((site) => (
                      <Row key={site.id} site={site} o={s.overview[site.id]} href={siteHref(site.id, s.overview[site.id], s.startUtc, s.days)} startUtc={s.startUtc} days={s.days} active={active === site.id} onActive={setActive} problem={s.skylineProblems[site.id]} cold={coldOf(site.id)} />
                    ))}
                  </ul>
                  {/* Places that never see Earth get a heading of their own, so their place in the order explains itself. */}
                  {g.without.length > 0 && (
                    <>
                      <h3 className="mt-7 px-3 text-[17px] font-semibold text-ink">No contact with Earth in the first {s.days} days</h3>
                      <p className="border-b border-line-strong px-3 pb-2 text-[15px] text-ink-2">These places keep power for a while but cannot reach Earth by radio then.</p>
                      <ul className="divide-y divide-line-strong">
                        {g.without.map((site) => (
                          <Row key={site.id} site={site} o={s.overview[site.id]} href={siteHref(site.id, s.overview[site.id], s.startUtc, s.days)} startUtc={s.startUtc} days={s.days} active={active === site.id} onActive={setActive} problem={s.skylineProblems[site.id]} cold={coldOf(site.id)} />
                        ))}
                      </ul>
                    </>
                  )}
                  {/* The far side always faces away from Earth: no period changes that, so these rows say "never" and why. */}
                  {g.far.length > 0 && (
                    <div>
                      <h3 className="mt-7 px-3 text-[17px] font-semibold text-ink">On the far side: Earth never rises</h3>
                      <p className="border-b border-line-strong px-3 pb-2 text-[15px] text-ink-2">
                        The far side always faces away from Earth, so a lander there can talk to Earth only through a relay satellite, as Chang&apos;e 4 and Chang&apos;e 6 did through China&apos;s Queqiao
                        satellites.
                      </p>
                      <ul className="divide-y divide-line-strong">
                        {g.far.map((site) => (
                          <Row key={site.id} site={site} o={s.overview[site.id]} href={siteHref(site.id, s.overview[site.id], s.startUtc, s.days)} startUtc={s.startUtc} days={s.days} active={active === site.id} onActive={setActive} cold={coldOf(site.id)} />
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              ))}
              {/* The figures come from horizons on LOLA's 20 m grid near the pole, its 80 m grid farther out and its 240 m grid
                  north of 80° S, with DE440. The places are NASA's Artemis III regions, the CLPS landings and the landers LROC
                  and NSSDCA have located. */}
              <Sources of={['lola', 'lola80', 'lola240', 'de440', 'artemis', 'clps', 'landers']} />
              <Elsewhere store={store} navigate={go} />
            </div>
          </div>
        </div>
      </main>
    </AppFrame>
  );
}
