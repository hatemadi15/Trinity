'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from './AppFrame';
import { SiteSelect } from './SiteSelect';
import { SkyDome } from './SkyDome';
import { SummaryTiles } from './SummaryTiles';
import { Timeline } from './Timeline';
import { TimeScrubber } from './TimeScrubber';
import { WindowControls } from './WindowControls';
import { dataBase } from '@/lib/data/loaders';
import { EngineClient } from '@/lib/engine-client';
import { maskAtAzimuth, type Series } from '@/lib/engine/metrics';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { utcLabel } from '@/lib/viz/format';

export function ExploreView({ store = exploreStore }: { store?: StoreApi<ExploreState> }) {
  const s = useStore(store);
  const [busy, setBusy] = useState(false);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const client = useRef<EngineClient | null>(null);

  useEffect(() => {
    void store.getState().init();
    const current = client;
    return () => current.current?.dispose();
  }, [store]);

  const onCustom = useCallback(
    async (lat: number, lon: number) => {
      setBusy(true);
      try {
        client.current ??= new EngineClient(dataBase());
        const res = await client.current.computeMask(lat, lon);
        store.getState().applyMask(
          {
            id: `custom_${lat}_${lon}`,
            name: `Custom ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
            lat,
            lon,
            category: 'custom',
            polar: true,
            source: 'user',
          },
          res.mask,
          { siteHeightM: res.siteHeightM, source: 'computed', failedTiles: res.failedTiles.length },
        );
      } catch (err) {
        store.getState().setCustomError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [store],
  );

  if (s.status === 'loading' || s.status === 'idle') {
    return (
      <AppFrame>
        <p className="px-6 py-10 text-ink-2">Loading NASA data…</p>
      </AppFrame>
    );
  }
  if (s.status === 'error' || !s.series || !s.summary || !s.mask) {
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
  return (
    <AppFrame>
      <main className="flex flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SiteSelect
            sites={s.sites}
            value={s.siteId}
            onSelect={(id) => void s.selectSite(id)}
            onCustom={onCustom}
            customError={s.customError}
            busy={busy}
          />
          <WindowControls startUtc={s.startUtc} days={s.days} onWindow={s.setWindow} />
        </div>
        {s.error && (
          <p role="status" className="text-sm text-warn">
            {s.error}
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
          <section aria-label="Sky dome" className="rounded-md bg-panel p-4">
            <h1 className="font-display text-2xl font-semibold">{s.site?.name}</h1>
            <p className="text-sm text-ink-2">
              {s.site?.lat.toFixed(3)}°, {s.site?.lon.toFixed(3)}°; skyline from LOLA{' '}
              {s.maskMeta?.source === 'computed' ? 'computed in your browser' : 'precomputed'}; site height{' '}
              {s.maskMeta?.siteHeightM.toFixed(0)} m
            </p>
            {s.maskMeta && s.maskMeta.failedTiles > 0 && (
              <p className="text-sm text-warn">
                {s.maskMeta.failedTiles} terrain tiles could not be loaded; parts of this skyline may be missing.
              </p>
            )}
            <div className="mx-auto mt-2 max-w-[500px]">
              <SkyDome mask={s.mask} series={s.series} cursor={s.cursorHour} />
            </div>
            <p className="mt-1 text-center text-xs text-ink-3">
              Outer half of the disc magnifies −10° to +10° around the horizon.
            </p>
          </section>
          <aside className="rounded-md bg-panel p-4">
            <SummaryTiles summary={s.summary} />
          </aside>
        </div>
        <section aria-label="Timeline" className="flex flex-col gap-3 rounded-md bg-panel p-4">
          <Timeline
            series={s.series}
            startUtc={s.startUtc}
            cursor={s.cursorHour}
            onCursor={s.setCursor}
            onHover={setHoverHour}
          />
          <TimeScrubber startUtc={s.startUtc} cursor={s.cursorHour} hours={s.series.hours} onCursor={s.setCursor} />
          <p className="text-sm text-ink-2" data-testid="readout" data-part="readout">
            {readout(s.series, s.mask, s.startUtc, readoutHour)}
          </p>
        </section>
      </main>
    </AppFrame>
  );
}

function readout(series: Series, mask: Float64Array, startUtc: string, h: number): string {
  const sunSky = maskAtAzimuth(mask, series.sunAz[h]);
  const earthSky = maskAtAzimuth(mask, series.earthAz[h]);
  const rel = (el: number, sky: number) =>
    `${Math.abs(el - sky).toFixed(1)}° ${el >= sky ? 'above' : 'below'} the skyline`;
  return `${utcLabel(startUtc, h)}: Sun ${rel(series.sunEl[h], sunSky)} (azimuth ${series.sunAz[h].toFixed(0)}°, ${Math.round(series.sunFraction[h] * 100)} % of the disk visible); Earth ${rel(series.earthEl[h], earthSky)} (azimuth ${series.earthAz[h].toFixed(0)}°).`;
}
