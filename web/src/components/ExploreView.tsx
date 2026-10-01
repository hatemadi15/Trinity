'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { PlannerChat } from './PlannerChat';
import { GroundPanel } from './explore/GroundPanel';
import { LanderDialog } from './explore/LanderDialog';
import { NumbersCard } from './explore/NumbersCard';
import { PeriodBand } from './explore/PeriodBand';
import { TimeBar } from './explore/TimeBar';
import { TimeChart } from './explore/TimeChart';
import { VerdictPanel } from './explore/VerdictPanel';
import { WhereOnMoon } from './explore/WhereOnMoon';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { globeTextureUrl } from '@/lib/data/terrain';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { COMPARE_MAX, exploreStore, type ExploreState } from '@/lib/store/explore';
import { answerFor } from '@/lib/viz/answer';
import { dateTimeUtc } from '@/lib/viz/format';
import { checkPick } from '@/lib/viz/pick';
import { sceneStateAt } from '@/lib/viz/scene-state';

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
    () => (s.series && s.summary && s.power ? answerFor({ series: s.series, summary: s.summary, power: s.power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, best: s.best }) : null),
    [s.series, s.summary, s.power, s.startUtc, s.days, s.params.power.loadW, s.best],
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
  if (s.status === 'error' || !s.series || !s.summary || !s.power || !s.mask || !s.site || !scene || !answer) {
    const missing = /HTTP 404/.test(s.error ?? '');
    return (
      <AppFrame>
        <main className="wrap py-12">
          <div role="alert" className="max-w-prose border-l-2 border-bad pl-4 text-ink-2">
            <p className="text-ink">{missing ? 'Data files are missing.' : 'Something went wrong while loading.'}</p>
            <p className="mt-2 text-[15px]">
              {missing ? (
                <>
                  Run <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local --tiles</code> inside <code className="text-ink">pipeline/</code> and reload this page.
                </>
              ) : (
                s.error
              )}
            </p>
          </div>
        </main>
      </AppFrame>
    );
  }

  const site = s.site;
  const shownHour = hoverHour ?? s.cursorHour;
  return (
    <AppFrame>
      <main className="flex flex-col">
        <div className="wrap flex flex-col gap-6 pb-10 pt-6">
          <PeriodBand site={site} startUtc={s.startUtc} days={s.days} onWindow={s.setWindow} power={s.params.power} onLander={() => setLanderOpen(true)} landerRef={landerRef} />
          {s.error && (
            <p role="status" className="text-[15px] text-bad">
              {s.error}
            </p>
          )}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <VerdictPanel siteName={siteLabel(site)} answer={answer} onLand={(start) => s.setWindow(start, s.days)} onCompare={onCompare} onYear={() => void store.getState().findBestWindow(s.days)} yearNote={s.bestWindowNote} />
            <NumbersCard
              site={site}
              summary={s.summary}
              power={s.power}
              params={s.params}
              days={s.days}
              maskMeta={s.maskMeta}
              inCompare={s.compareIds.includes(site.id)}
              compareFull={s.compareIds.length >= COMPARE_MAX}
              onAddToCompare={() => void store.getState().addToCompare(site.id)}
            />
          </div>
          <TimeChart
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
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <GroundPanel
              site={site}
              sites={s.sites}
              scene={scene}
              mode={s.mode}
              exaggeration={s.exaggeration}
              heightmap={s.heightmap}
              capHeightmap={s.capHeightmap}
              textureUrl={globeTextureUrl(dataBase(), s.terrainManifest)}
              terrainState={s.terrainState}
              windowLoading={s.windowLoading}
              customError={s.customError}
              when={dateTimeUtc(s.startUtc, shownHour)}
              onMode={s.setMode}
              onExaggeration={s.setExaggeration}
              onPick={onPick}
              reducedMotion={reducedMotion}
            />
            <WhereOnMoon site={site} sites={s.sites} overview={s.overview} startUtc={s.startUtc} days={s.days} />
          </div>
          <PlannerChat store={store} navigate={go} variant="panel" />
        </div>
        <TimeBar series={s.series} power={s.power} startUtc={s.startUtc} cursor={s.cursorHour} hoverHour={hoverHour} batteryWh={s.params.power.batteryWh} onCursor={s.setCursor} />
        {landerOpen && <LanderDialog params={s.params} onPower={s.setPower} onParams={s.setParams} busy={s.maskBusy} onClose={() => setLanderOpen(false)} returnFocus={landerRef} />}
      </main>
    </AppFrame>
  );
}
