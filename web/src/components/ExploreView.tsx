'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { GuidedStory } from './GuidedStory';
import { webglAvailable } from './three/Scene3D';
import { PlannerChat } from './PlannerChat';
import { PlannerParamsPanel } from './PlannerParamsPanel';
import { SiteSelect } from './SiteSelect';
import { SkyDome } from './SkyDome';
import { SummaryTiles } from './SummaryTiles';
import { Timeline } from './Timeline';
import { TimeScrubber } from './TimeScrubber';
import { WindowControls } from './WindowControls';
import { Scene3DLazy } from './three';
import { dataBase } from '@/lib/data/loaders';
import { globeTextureUrl } from '@/lib/data/terrain';
import { maskAtAzimuth, type Series } from '@/lib/engine/metrics';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { COMPARE_MAX, exploreStore, type Exaggeration, type ExploreState, type SceneMode } from '@/lib/store/explore';
import { utcLabel } from '@/lib/viz/format';
import { checkPick } from '@/lib/viz/pick';
import { sceneStateAt } from '@/lib/viz/scene-state';

export function ExploreView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [webgl] = useState(() => webglAvailable());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  useDemoMode(store);

  useEffect(() => {
    void store
      .getState()
      .init()
      .then(() => store.getState().applyQuery(typeof window === 'undefined' ? '' : window.location.search));
  }, [store]);

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

  const scene = useMemo(
    () => (s.eph && s.series && s.mask ? sceneStateAt(s.eph, s.series, s.mask, s.cursorHour) : null),
    [s.eph, s.series, s.mask, s.cursorHour],
  );

  if (s.status === 'loading' || s.status === 'idle') {
    return (
      <AppFrame>
        <p className="px-6 py-10 text-ink-2">Loading NASA data…</p>
      </AppFrame>
    );
  }
  if (s.status === 'error' || !s.series || !s.summary || !s.mask || !s.site || !scene) {
    const missing = /HTTP 404/.test(s.error ?? '');
    return (
      <AppFrame>
        <div role="alert" className="mx-6 my-10 max-w-prose border-l-2 border-bad pl-4 text-ink-2">
          <p className="text-ink">{missing ? 'Data files are missing.' : 'Something went wrong while loading.'}</p>
          <p className="mt-2 text-sm">
            {missing ? (
              <>
                Run <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local --tiles</code> inside{' '}
                <code className="text-ink">pipeline/</code> and reload this page.
              </>
            ) : (
              s.error
            )}
          </p>
        </div>
      </AppFrame>
    );
  }
  const readoutHour = hoverHour ?? s.cursorHour;
  const inCompare = s.compareIds.includes(s.site.id);
  return (
    <AppFrame>
      <main data-testid="cockpit" className="flex flex-col lg:h-[calc(100vh-3rem)] lg:overflow-hidden">
        <div className="glass-bar flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-line px-4 py-2">
          <SiteSelect
            sites={s.sites}
            value={s.siteId}
            onSelect={(id) => void s.selectSite(id)}
            onCustom={(lat, lon) => void s.selectCustom(lat, lon)}
            customError={s.customError}
            busy={s.maskBusy}
          />
          <WindowControls
            startUtc={s.startUtc}
            days={s.days}
            onWindow={s.setWindow}
            onBestWindow={(d) => void store.getState().findBestWindow(d)}
            bestWindowNote={s.bestWindowNote}
          />
          <button
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((o) => !o)}
            className={`ml-auto self-end rounded-md border px-3 py-1 text-sm ${settingsOpen ? 'border-sun text-ink' : 'border-line text-ink-2 hover:text-ink'}`}
          >
            Planner settings
          </button>
        </div>
        {s.error && (
          <p role="status" className="px-4 py-1 text-sm text-warn">
            {s.error}
          </p>
        )}
        <div className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="3D view" className="relative min-h-[420px] overflow-hidden rounded-md bg-sky lg:min-h-0">
            <div className="absolute inset-0">
              <Scene3DLazy
                mode={s.mode}
                scene={scene}
                site={s.site}
                sites={s.sites}
                heightmap={s.heightmap}
                capHeightmap={s.capHeightmap}
                exaggeration={s.exaggeration}
                textureUrl={globeTextureUrl(dataBase(), s.terrainManifest)}
                onPick={onPick}
                reducedMotion={reducedMotion}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="glass pointer-events-auto max-w-[min(540px,100%)] rounded-md px-3 py-2">
                  <h1 className="font-display text-xl font-semibold leading-tight">{s.site.name}</h1>
                  <p className="text-xs text-ink-2">
                    {s.site.lat.toFixed(3)}°, {s.site.lon.toFixed(3)}°; {skylineNote(s)}
                    {s.site.approximate ? '; region centre digitised from NASA’s map (about ±5 km)' : ''}
                    {s.maskBusy ? `; recomputing the skyline for a ${s.params.mastM} m mast…` : ''}
                  </p>
                  {s.mode === 'globe' && s.customError && (
                    <p role="alert" className="mt-1 text-xs text-bad">
                      {s.customError}. Custom sites need LOLA coverage south of 60°S.
                    </p>
                  )}
                  {s.maskMeta && s.maskMeta.failedTiles > 0 && (
                    <p className="mt-1 text-xs text-warn">
                      {s.maskMeta.failedTiles} terrain tiles could not be loaded; parts of this skyline may be missing.
                    </p>
                  )}
                </div>
                {s.audience === 'learn' && (
                  <div className="pointer-events-auto w-[min(400px,60%)]">
                    <GuidedStory webgl={webgl} />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="glass pointer-events-auto flex flex-col gap-1 rounded-md px-3 py-2">
                  <ModeControls mode={s.mode} exaggeration={s.exaggeration} onMode={s.setMode} onExaggeration={s.setExaggeration} />
                  <p className="max-w-[420px] text-xs text-ink-3">{sceneCaption(s)}</p>
                </div>
                <div className="glass pointer-events-auto flex items-center gap-3 rounded-md px-3 py-2">
                  <button
                    type="button"
                    disabled={inCompare || s.compareIds.length >= COMPARE_MAX}
                    onClick={() => void store.getState().addToCompare(s.site!.id)}
                    className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
                  >
                    {inCompare ? 'In compare' : 'Add to compare'}
                  </button>
                  <Link href="/compare" className="text-sm text-ink-2 underline-offset-4 hover:underline">
                    Compared sites ({s.compareIds.length})
                  </Link>
                  <Link href="/brief" className="text-sm text-ink-2 underline-offset-4 hover:underline">
                    Export brief
                  </Link>
                </div>
              </div>
            </div>
            {settingsOpen && (
              <div className="glass absolute right-3 top-3 z-20 w-[min(760px,calc(100%-1.5rem))] rounded-md p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">Planner settings</span>
                  <button
                    type="button"
                    aria-label="Close settings"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-md border border-line px-2 py-0.5 text-sm text-ink-2 hover:text-ink"
                  >
                    Close
                  </button>
                </div>
                <PlannerParamsPanel embedded params={s.params} onParams={s.setParams} onPower={s.setPower} busy={s.maskBusy} />
              </div>
            )}
          </section>
          <aside className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
            <section aria-label="Sky dome" className="glass rounded-md p-3">
              <div className="mx-auto max-w-[220px]">
                <SkyDome mask={s.mask} series={s.series} cursor={s.cursorHour} />
              </div>
              <p className="mt-1 text-center text-xs text-ink-3">Outer half of the disc magnifies −10° to +10°.</p>
            </section>
            <section className="glass rounded-md p-3">
              <SummaryTiles summary={s.summary} power={s.power} audience={s.audience} dense />
            </section>
            <PlannerChat store={store} defaultOpen />
          </aside>
        </div>
        <section aria-label="Timeline" className="glass-bar flex flex-col gap-1 border-t border-line px-4 py-2">
          <Timeline series={s.series} startUtc={s.startUtc} cursor={s.cursorHour} onCursor={s.setCursor} onHover={setHoverHour} width={1400} />
          <TimeScrubber startUtc={s.startUtc} cursor={s.cursorHour} hours={s.series.hours} onCursor={s.setCursor} />
          <p className="text-sm text-ink-2" data-testid="readout" data-part="readout">
            {readout(s.series, s.mask, s.startUtc, readoutHour)}
          </p>
        </section>
      </main>
    </AppFrame>
  );
}

function skylineNote(s: ExploreState): string {
  if (s.maskMeta?.source === 'flat') return 'flat horizon (no LOLA polar coverage)';
  const how = s.maskMeta?.source === 'computed' ? 'computed in your browser' : 'precomputed';
  return `skyline from LOLA ${how}; site height ${s.maskMeta?.siteHeightM.toFixed(0)} m`;
}

function sceneCaption(s: ExploreState): string {
  if (s.mode === 'globe') return 'Pick a site on the globe: click anywhere south of 60°S. Drag to orbit, scroll to zoom.';
  if (s.heightmap) {
    const { cell_m, width } = s.heightmap.meta;
    return `LOLA ${cell_m} m terrain, ${(width * cell_m) / 1000} km across; drag to orbit, scroll to zoom. Shadows follow the time cursor.`;
  }
  if (s.terrainState === 'loading' || s.windowLoading) return 'Loading terrain…';
  if (s.capHeightmap) return 'No 20 m window for this site; showing the 960 m south-cap model, 48 km across. Shadows follow the time cursor.';
  return 'Terrain data is not loaded; run sync-local --tiles to add it.';
}

function ModeControls({
  mode,
  exaggeration,
  onMode,
  onExaggeration,
}: {
  mode: SceneMode;
  exaggeration: Exaggeration;
  onMode: (m: SceneMode) => void;
  onExaggeration: (x: Exaggeration) => void;
}) {
  const btn = (active: boolean) =>
    `rounded-md border px-3 py-1 text-sm ${active ? 'border-sun bg-panel text-ink' : 'border-line text-ink-2 hover:text-ink'}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="View" className="flex gap-1">
        <button type="button" className={btn(mode === 'terrain')} aria-pressed={mode === 'terrain'} onClick={() => onMode('terrain')}>
          Terrain
        </button>
        <button type="button" className={btn(mode === 'globe')} aria-pressed={mode === 'globe'} onClick={() => onMode('globe')}>
          Globe
        </button>
      </div>
      {mode === 'terrain' && (
        <div role="group" aria-label="Vertical exaggeration" className="flex gap-1">
          <button type="button" className={btn(exaggeration === 1)} aria-pressed={exaggeration === 1} onClick={() => onExaggeration(1)}>
            1×
          </button>
          <button type="button" className={btn(exaggeration === 3)} aria-pressed={exaggeration === 3} onClick={() => onExaggeration(3)}>
            3× height
          </button>
        </div>
      )}
    </div>
  );
}

function readout(series: Series, mask: Float64Array, startUtc: string, h: number): string {
  const sunSky = maskAtAzimuth(mask, series.sunAz[h]);
  const earthSky = maskAtAzimuth(mask, series.earthAz[h]);
  const rel = (el: number, sky: number) =>
    `${Math.abs(el - sky).toFixed(1)}° ${el >= sky ? 'above' : 'below'} the skyline`;
  return `${utcLabel(startUtc, h)}: Sun ${rel(series.sunEl[h], sunSky)} (azimuth ${series.sunAz[h].toFixed(0)}°, ${Math.round(series.sunFraction[h] * 100)} % of the disk visible); Earth ${rel(series.earthEl[h], earthSky)} (azimuth ${series.earthAz[h].toFixed(0)}°).`;
}
