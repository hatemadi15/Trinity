'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { DataProblem, SYNC_HINT } from './DataProblem';
import { PlannerChat } from './PlannerChat';
import { GroundPanel } from './explore/GroundPanel';
import { LanderDialog } from './explore/LanderDialog';
import { NumbersCard } from './explore/NumbersCard';
import { PeriodBand } from './explore/PeriodBand';
import { RadioWindows } from './explore/RadioWindows';
import { exploreHref } from './sites/SitesView';
import { TimeBar } from './explore/TimeBar';
import { LunaControls } from './luna/LunaControls';
import { TimeChart } from './explore/TimeChart';
import { VerdictPanel } from './explore/VerdictPanel';
import { WhereOnMoon } from './explore/WhereOnMoon';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { globeTextureUrl } from '@/lib/data/terrain';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { standHref } from '@/lib/links';
import { COMPARE_MAX, exploreStore, type ExploreState } from '@/lib/store/explore';
import { timeWithPower } from '@/lib/engine/landing';
import { answerFor, nearbyAdvice, nearbyWords } from '@/lib/viz/answer';
import { dateTimeUtc } from '@/lib/viz/format';
import { checkPick } from '@/lib/viz/pick';
import { sceneStateAt } from '@/lib/viz/scene-state';
import { keyMoments } from '@/lib/viz/stand';

/**
 * Explore: the answer for one site and period first (in words, with the better landing date), then why
 * (the Sun, Earth and the battery hour by hour), then the ground, where the site is, and the assistant.
 * The time bar stays pinned to the bottom of the window.
 */
export function ExploreView({ store = exploreStore, navigate }: { store?: StoreApi<ExploreState>; navigate?: (href: string) => void }) {
  const s = useStore(store);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [landerOpen, setLanderOpen] = useState(false);
  const landerRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  useDemoMode(store);

  useEffect(() => {
    void store
      .getState()
      .init()
      .then(() => store.getState().applyQuery(typeof window === 'undefined' ? '' : window.location.search));
  }, [store]);
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

  const scene = useMemo(() => (s.eph && s.series && s.mask ? sceneStateAt(s.eph, s.series, s.mask, s.cursorHour) : null), [s.eph, s.series, s.mask, s.cursorHour]);
  const answer = useMemo(
    () => (s.series && s.summary && s.power && s.site ? answerFor({ siteName: siteLabel(s.site), series: s.series, summary: s.summary, power: s.power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, batteryWh: s.params.power.batteryWh, best: s.best }) : null),
    [s.site, s.series, s.summary, s.power, s.startUtc, s.days, s.params.power.loadW, s.params.power.batteryWh, s.best],
  );
  // A nearby site that keeps power clearly longer from the same landing day, once the overview has its figures.
  const nearby = useMemo(() => {
    if (!s.site || !s.power) return null;
    const advice = nearbyAdvice(s.site, s.sites, s.overview, timeWithPower(s.power));
    return advice ? { words: nearbyWords(advice, s.days), name: siteLabel(advice.site), href: exploreHref(advice.site.id, s.startUtc, s.days) } : null;
  }, [s.site, s.sites, s.overview, s.power, s.days, s.startUtc]);

  if (s.status === 'loading' || s.status === 'idle') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">Loading NASA data…</p>
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
  return (
    <AppFrame>
      <main className="flex flex-col">
        {/* Luna's better day (spec 22): lands there as the gold button does. */}
        <LunaControls
          controls={{
            'better-day': () => {
              if (!better) return 'This landing day is already the best one nearby.';
              s.setWindow(better.startUtc, s.days);
              return better.label;
            },
          }}
        />
        <div className="wrap flex w-full min-w-0 flex-col gap-6 pb-10 pt-6">
          <PeriodBand site={site} startUtc={s.startUtc} days={s.days} onWindow={s.setWindow} power={s.params.power} onLander={() => setLanderOpen(true)} landerRef={landerRef} />
          {s.error && (
            <p role="status" className="text-[15px] text-bad">
              {s.error}
            </p>
          )}
          <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <VerdictPanel
              answer={answer}
              site={site}
              nearby={nearby}
              standLink={standHref(site.id, s.startUtc, s.days, s.cursorHour)}
              onLand={(start) => s.setWindow(start, s.days)}
              onCompare={onCompare}
              onYear={() => void store.getState().findBestWindow(s.days)}
              yearNote={s.bestWindowNote}
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
            />
          </div>
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
          />
          <WhereOnMoon site={site} sites={s.sites} overview={s.overview} startUtc={s.startUtc} days={s.days} wide />
          <PlannerChat store={store} navigate={go} />
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
        {landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
      </main>
    </AppFrame>
  );
}
