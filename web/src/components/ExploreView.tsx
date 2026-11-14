'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { DataProblem, SYNC_HINT } from './DataProblem';
import { PlannerChat } from './PlannerChat';
import { SkylineNote } from './SkylineNote';
import { GroundPanel } from './explore/GroundPanel';
import { LanderDialog } from './explore/LanderDialog';
import { ShareDialog } from './explore/ShareDialog';
import { NumbersCard } from './explore/NumbersCard';
import { PeriodBand } from './explore/PeriodBand';
import { RadioWindows } from './explore/RadioWindows';
import { exploreHref } from './sites/SitesView';
import { TimeBar } from './explore/TimeBar';
import { LunaControls } from './luna/LunaControls';
import { TimeChart } from './explore/TimeChart';
import { VerdictPanel } from './explore/VerdictPanel';
import { WhereOnMoon } from './explore/WhereOnMoon';
import { YearView } from './explore/YearView';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { globeTextureUrl } from '@/lib/data/terrain';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { briefHref, standHref, withSettings } from '@/lib/links';
import { useAddressFollows } from '@/lib/hooks/useAddressFollows';
import { useDataVersions } from '@/lib/hooks/useDataVersions';
import { appVersion } from '@/lib/share/versions';
import { COMPARE_MAX, exploreStore, scanOf, terrainOf, type ExploreState } from '@/lib/store/explore';
import { neighbourhoodRange, rangeWords } from '@/lib/plan/neighbourhood';
import { placeOptions, timeOptions } from '@/lib/plan/options';
import { periodOutcome } from '@/lib/plan/outcome';
import { answerFor, nearbyWords, placesNoteWords, planView, spotSite } from '@/lib/viz/answer';
import { nearestSites } from '@/lib/viz/relief';
import { comparisonHref } from '@/lib/scenario/codec';
import { scenarioStore, type ScenarioState } from '@/lib/store/scenarios';
import { dateTimeUtc } from '@/lib/viz/format';
import { trustedAnswer, trustedOverview, verdictLimitation } from '@/lib/viz/terrain';
import { checkPick } from '@/lib/viz/pick';
import { sceneStateAt } from '@/lib/viz/scene-state';
import { keyMoments } from '@/lib/viz/stand';
import { siteBudget, sureLines, type UncertaintyDoc } from '@/lib/uncertainty/budget';
import { useUncertainty } from '@/lib/uncertainty/useUncertainty';

/**
 * Explore: the answer for one site and period first (in words, with the better landing date), then why
 * (the Sun, Earth and the battery hour by hour), then the ground, where the site is, and the assistant.
 * The time bar stays pinned to the bottom of the window.
 */
export function ExploreView({
  store = exploreStore,
  scenarios = scenarioStore,
  navigate,
  uncertainty,
}: {
  store?: StoreApi<ExploreState>;
  /** The comparison "Compare from here" starts; by default the app's. */
  scenarios?: StoreApi<ScenarioState>;
  navigate?: (href: string) => void;
  /** Injected in tests; by default the app's data/uncertainty/budget.json. */
  uncertainty?: () => Promise<UncertaintyDoc>;
}) {
  const s = useStore(store);
  const budget = useUncertainty(uncertainty);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [landerOpen, setLanderOpen] = useState(false);
  const landerRef = useRef<HTMLButtonElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLButtonElement>(null);
  const dataVersions = useDataVersions(shareOpen);
  const reducedMotion = useReducedMotion();
  useDemoMode(store);

  // The address the visit came with is read before the data loads and applied once it is in; only then does the page
  // write its own, so its defaults never replace a shared link before it is read.
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    const search = typeof window === 'undefined' ? '' : window.location.search;
    void store
      .getState()
      .init()
      .then(() => store.getState().applyQuery(search))
      .then(() => setLinked(true));
  }, [store]);
  // From then on the address follows the site, the period (its landing hour and length included) and every setting the
  // figures depend on, so a reload or a copied address opens the same forecast.
  const link = s.site ? withSettings(exploreHref(s.site.id, s.startUtc, s.days), s.params, s.rankBy) : null;
  useAddressFollows(link, linked && s.status === 'ready');
  // The home page links to /explore#ask. On a first visit the page still says "Loading NASA data…" when Next looks
  // for #ask, and Next drops a target it cannot find. So once the data is in, the page goes to the assistant
  // itself, once, and puts the cursor in its box, as "Or ask in plain words" does.
  const arrived = useRef(false);
  useEffect(() => {
    if (s.status !== 'ready' || arrived.current) return;
    arrived.current = true;
    if (window.location.hash !== '#ask') return;
    const ask = document.getElementById('ask');
    // Called only where the browser has it: jsdom, for one, does not.
    ask?.scrollIntoView?.({ block: 'start' });
    ask?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true });
  }, [s.status]);
  // Where on the Moon lists the nearest sites for the same period and lander.
  useEffect(() => {
    if (s.status === 'ready') void store.getState().loadOverview();
  }, [store, s.status, s.startUtc, s.days, s.params]);
  // A site known only to a few kilometres: the same period at points round it, in the worker, after the main result.
  useEffect(() => {
    if (s.status === 'ready') void store.getState().loadNeighbourhood();
  }, [store, s.status, s.siteId, s.startUtc, s.days, s.params]);

  const onPick = useCallback(
    (lat: number, lon: number) => {
      const r = checkPick(lat, lon);
      if (!r.ok) {
        store.getState().setCustomError(r.message);
        return;
      }
      void store.getState().selectCustom(r.lat, r.lon);
    },
    [store],
  );

  const onCompare = useCallback(() => {
    const { site, compareIds } = store.getState();
    if (site && !compareIds.includes(site.id) && compareIds.length < COMPARE_MAX) {
      void store
        .getState()
        .addToCompare(site.id)
        .then(() => go('/compare'));
    } else {
      go('/compare');
    }
  }, [store, go]);

  // "Compare from here": this landing, with every setting, as a comparison's baseline; Compare opens on its link.
  const onScenario = useCallback(() => {
    if (scenarios.getState().startFrom(store.getState())) go(comparisonHref(scenarios.getState().scenarios));
  }, [store, scenarios, go]);

  const scene = useMemo(() => (s.eph && s.series && s.mask ? sceneStateAt(s.eph, s.series, s.mask, s.cursorHour) : null), [s.eph, s.series, s.mask, s.cursorHour]);
  // The terrain behind the figures, and whether they are still from another mast height than the one chosen.
  const terrain = s.maskMeta ? terrainOf(s.maskMeta) : undefined;
  const behind = s.maskMeta !== null && s.maskMeta.source !== 'flat' && (s.maskMeta.mastM ?? 2) !== s.params.mastM;
  // The period's landing times, ranked with the requirements: the better date comes from here.
  const times = useMemo(
    () => (s.series && s.site ? timeOptions({ scan: scanOf(s.series), cfg: s.params.power, req: s.requirements, hours: s.series.hours, startUtc: s.startUtc, by: s.rankBy }) : null),
    [s.series, s.site, s.params.power, s.requirements, s.startUtc, s.rankBy],
  );
  const current = useMemo(() => (s.series && s.power ? periodOutcome(s.series, s.power) : null), [s.series, s.power]);
  const hood = s.neighbourhood && s.site && s.neighbourhood.siteId === s.site.id ? s.neighbourhood : null;
  // The places nearby from the same landing day, once the overview has their figures, and the spots round an approximate
  // site: only from figures for the chosen mast, and never to or from a place whose terrain is incomplete.
  const places = useMemo(() => {
    if (!s.site || !current || behind || terrain?.quality === 'incomplete') return null;
    const centre = s.site;
    const outcomes = Object.fromEntries(Object.entries(trustedOverview(s.overview, s.params.mastM)).map(([id, o]) => [id, o.now]));
    const extra = hood && !hood.busy ? hood.points.flatMap((p) => (p.outcome ? [{ place: { site: spotSite(centre, p), km: p.km }, outcome: p.outcome }] : [])) : [];
    return placeOptions({ site: centre, sites: s.sites, outcomes, extra, current, req: s.requirements, by: s.rankBy });
  }, [s.site, s.sites, s.overview, current, hood, s.requirements, s.params.mastM, behind, terrain, s.rankBy]);
  // Why the places nearby are not ranked yet, or which of those within reach are left out, by name.
  const placesNote = useMemo(() => {
    if (!s.site) return null;
    const leftOut = nearestSites(s.site, s.sites, s.sites.length)
      .filter((x) => x.km <= 30 && x.site.category !== 'custom')
      .flatMap((x): { name: string; why: 'incomplete' | 'mast' }[] => {
        const o = s.overview[x.site.id];
        if (!o) return [];
        if (o.terrain?.quality === 'incomplete') return [{ name: siteLabel(x.site), why: 'incomplete' }];
        return o.mastM !== s.params.mastM ? [{ name: siteLabel(x.site), why: 'mast' }] : [];
      });
    return placesNoteWords({ busy: s.overviewBusy, behind, incompleteHere: terrain?.quality === 'incomplete', mastM: s.params.mastM, leftOut });
  }, [s.site, s.sites, s.overview, s.overviewBusy, s.params.mastM, behind, terrain]);
  const told = useMemo(
    () => (s.series && s.summary && s.power && s.site ? answerFor({ siteName: siteLabel(s.site), series: s.series, summary: s.summary, power: s.power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, batteryWh: s.params.power.batteryWh, best: s.best, plan: times, farSide: s.site.far_side, panel: s.params.power.panel }) : null),
    [s.site, s.series, s.summary, s.power, s.startUtc, s.days, s.params.power.loadW, s.params.power.batteryWh, s.params.power.panel, s.best, times],
  );
  // No better day from an incomplete terrain, or from figures still waiting for the chosen mast (lib/viz/terrain).
  const answer = useMemo(() => (told ? trustedAnswer(told, terrain, behind) : null), [told, terrain, behind]);
  // A nearby place that does clearly better from the same landing day: more power by a day, or fewer requirements failed.
  const nearby = useMemo(() => {
    const b = places?.better;
    return b ? { words: nearbyWords({ site: b.item.site, km: b.item.km, hours: b.outcome.poweredH, earthNever: b.outcome.contactH === 0 }, s.days), name: siteLabel(b.item.site), href: exploreHref(b.item.site.id, s.startUtc, s.days) } : null;
  }, [places, s.days, s.startUtc]);
  // Every option behind the recommendations, for the panel's fold.
  const plan = useMemo(
    () =>
      times
        ? planView({
            times,
            places,
            year: s.yearPlan,
            req: s.requirements,
            startUtc: s.startUtc,
            days: s.days,
            hrefFor: (id) => exploreHref(id, s.startUtc, s.days),
            spots: hood && !hood.busy ? { count: hood.points.filter((p) => p.outcome).length, km: hood.radiusKm } : null,
            by: s.rankBy,
            placesNote,
          })
        : null,
    [times, places, hood, s.yearPlan, s.requirements, s.startUtc, s.days, s.rankBy, placesNote],
  );
  // The same result round an approximate point, next to the result.
  const range = useMemo(() => {
    if (!hood || !current) return null;
    if (hood.busy) return { words: `Working out the results within ${hood.radiusKm} km…` };
    return rangeWords(neighbourhoodRange(current, hood.points), { radiusKm: hood.radiusKm, ms: hood.skylineMs, mastM: hood.mastM, stated: hood.stated });
  }, [hood, current]);

  // The verdict's times with their supported margins (data/uncertainty), and the ground at a measured site.
  const sure = useMemo(
    () => (s.series && s.power && s.site ? sureLines({ doc: budget, site: { id: s.site.id, polar: s.site.polar }, series: s.series, power: s.power, startUtc: s.startUtc }) : null),
    [budget, s.site, s.series, s.power, s.startUtc],
  );

  if (s.status === 'loading' || s.status === 'idle') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">Loading NASA data…</p>
        </main>
      </AppFrame>
    );
  }
  // A site whose skyline could not be had (its horizon file missing from the server, say): its name, the reason in plain
  // words and the way to another site, with nothing of the site shown before.
  if (s.status === 'ready' && s.site && !s.series && s.error) {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <h1 className="text-[28px] font-semibold text-ink">{siteLabel(s.site)}</h1>
          <p role="alert" className="mt-3 max-w-prose text-[17px] text-ink-2">
            {s.error}
          </p>
          <p className="mt-4 text-[15px]">
            <Link href="/sites" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Choose another site
            </Link>
          </p>
        </main>
      </AppFrame>
    );
  }
  if (s.status === 'error' || !s.series || !s.summary || !s.power || !s.mask || !s.site || !scene || !answer) {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <DataProblem error={s.error} hint={SYNC_HINT} />
        </main>
      </AppFrame>
    );
  }

  const site = s.site;
  const better = answer?.better;
  // The view from the site and the brief work their figures out from the same settings.
  const standLink = withSettings(standHref(site.id, s.startUtc, s.days, s.cursorHour), s.params, s.rankBy);
  return (
    <AppFrame>
      <main className="flex flex-col">
        {/* Luna's better day (spec 22): lands there as the gold button does. */}
        <LunaControls
          controls={{
            'better-day': () => {
              if (!better) return told?.better ? (answer.hint ?? 'No better landing day is named.') : 'This landing day is already the best one nearby.';
              s.setWindow(better.startUtc, s.days);
              return better.label;
            },
          }}
        />
        <div className="wrap flex w-full min-w-0 flex-col gap-6 pb-10 pt-6">
          <PeriodBand site={site} startUtc={s.startUtc} days={s.days} onWindow={s.setWindow} power={s.params.power} onLander={() => setLanderOpen(true)} landerRef={landerRef} />
          {/* The selected site and the places the nearby search reads, while their hills are worked out for the chosen mast. */}
          <SkylineNote state={s} ids={[site.id, ...s.sites.filter((x) => x.category !== 'custom' && x.id !== site.id).map((x) => x.id)]} selected />
          {s.error && (
            <p role="status" className="text-[15px] text-bad">
              {s.error}
            </p>
          )}
          <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <VerdictPanel
              answer={answer}
              limitation={verdictLimitation(terrain)}
              site={site}
              nearby={nearby}
              standLink={standLink}
              onLand={(start) => s.setWindow(start, s.days)}
              onCompare={onCompare}
              onYear={() => void store.getState().findBestWindow(s.days)}
              yearNote={s.bestWindowNote}
              plan={plan}
              requirements={s.requirements}
              onRequirements={s.setRequirements}
              rankBy={s.rankBy}
              onRankBy={s.setRankBy}
              range={range}
              sure={sure}
            />
            <NumbersCard
              site={site}
              summary={s.summary}
              power={s.power}
              params={s.params}
              days={s.days}
              maskMeta={s.maskMeta}
              contactHours={answer.contactHours}
              series={s.series}
              hour={s.cursorHour}
              startUtc={s.startUtc}
              briefLink={withSettings(briefHref(site.id, s.startUtc, s.days), s.params, s.rankBy)}
              onShare={() => setShareOpen(true)}
              shareRef={shareRef}
            />
          </div>
          {/* This landing, every setting with it, as a comparison's baseline: under the answer, outside its word cap. */}
          <p className="-mt-2">
            <button type="button" onClick={onScenario} className="min-h-[40px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Compare from here
            </button>
          </p>
          <TimeChart
            site={site}
            series={s.series}
            mask={s.mask}
            power={s.power}
            batteryWh={s.params.power.batteryWh}
            startUtc={s.startUtc}
            days={s.days}
            cursor={s.cursorHour}
            hoverHour={hoverHour}
            onCursor={s.setCursor}
            onHover={setHoverHour}
          />
          {/* When Earth is in view for radio, and when the lander has power to use it, at the time bar's hour. */}
          <RadioWindows series={s.series} power={s.power} startUtc={s.startUtc} hour={s.cursorHour} />
          {/* Every landing day of the next 12 months, after the chart so the first screen keeps the answer and the chart's
              title: a day pressed there lands the period on it, as the date box does. */}
          <YearView eph={s.eph} site={site} mask={s.mask} startUtc={s.startUtc} days={s.days} params={s.params} onLand={(start) => s.setWindow(start, s.days)} />
          <GroundPanel
            site={site}
            sites={s.sites}
            scene={scene}
            mode={s.mode}
            exaggeration={s.exaggeration}
            heightmap={s.heightmap}
            contextHeightmap={s.contextHeightmap}
            capHeightmap={s.capHeightmap}
            textureUrl={globeTextureUrl(dataBase(), s.terrainManifest)}
            terrainState={s.terrainState}
            windowLoading={s.windowLoading}
            customError={s.customError}
            // The ground is lit for the time bar's hour, not the hour under the pointer on the chart.
            when={dateTimeUtc(s.startUtc, s.cursorHour)}
            startUtc={s.startUtc}
            days={s.days}
            mask={s.mask}
            series={s.series}
            cursor={s.cursorHour}
            onMode={s.setMode}
            onExaggeration={s.setExaggeration}
            onPick={onPick}
            reducedMotion={reducedMotion}
            standLink={standLink}
          />
          <WhereOnMoon site={site} sites={s.sites} overview={s.overview} startUtc={s.startUtc} days={s.days} wide ground={siteBudget(budget, site.id)?.terrain_quality ?? null} />
          <PlannerChat store={store} scenarios={scenarios} navigate={go} />
        </div>
        {/* The period's key moments as dots with Next, as on the stand view, so Play and Next show what happens on the first
            screen (21.1); a preview on the bar moves the chart's time line and the date, as the chart's own does. */}
        <TimeBar
          series={s.series}
          power={s.power}
          startUtc={s.startUtc}
          cursor={s.cursorHour}
          hoverHour={hoverHour}
          batteryWh={s.params.power.batteryWh}
          onCursor={s.setCursor}
          moments={keyMoments(s.series, s.power, s.startUtc).map((m) => ({ label: `${m.label}, ${m.day}`, hour: m.hour }))}
          onHover={setHoverHour}
        />
        {shareOpen && s.eph && link && (
          <ShareDialog
            input={{ site, startUtc: s.startUtc, days: s.days, params: s.params, eph: s.eph, series: s.series, power: s.power, summary: s.summary, maskMeta: s.maskMeta, best: s.best }}
            link={new URL(link, window.location.origin).href}
            versions={{ app: appVersion(), data: dataVersions ?? { data: null, sites: null, ephemeris: null, terrain: null } }}
            onClose={() => setShareOpen(false)}
            returnFocus={shareRef}
          />
        )}
        {landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
      </main>
    </AppFrame>
  );
}
