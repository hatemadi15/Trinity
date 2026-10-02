'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { HorizonView } from '@/components/explore/HorizonView';
import { TimeBar } from '@/components/explore/TimeBar';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { shadowLevels } from '@/lib/data/terrain';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { exploreHref } from '@/lib/links';
import { StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, terrainField } from '@/lib/sky/terrainField';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { answerFor } from '@/lib/viz/answer';
import { landerState, liveSentence, measuredNote, skyLabel, standQuery } from '@/lib/viz/stand';
import { StandCanvas, type LookTarget, type RendererLike } from './StandCanvas';

const PLATE = 'rounded-lg border border-white/15 bg-black/75';
const LOOK = 'min-h-10 rounded-lg border border-white/20 px-3.5 text-[15px] hover:bg-white/10';
const defaultRenderer = (canvas: HTMLCanvasElement, scene: StandScene): RendererLike => new StandRenderer(canvas, scene);

/**
 * Stand on the Moon: the full-window view from the landing site for the site, period and hour of the
 * address (Explore's address plus `hour`), with Explore's answer, the sentence for the hour, the lander's
 * state and the time bar on quiet plates. Without WebGL 2 it shows the view all round with the same words.
 */
export function StandView({ store = exploreStore, createRenderer = defaultRenderer }: { store?: StoreApi<ExploreState>; createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike }) {
  const s = useStore(store);
  const reducedMotion = useReducedMotion();
  const [sky, setSky] = useState<SkyAssets | null>(null);
  const [groundReady, setGroundReady] = useState(false);
  const [failed, setFailed] = useState<'webgl' | 'data' | null>(null);
  const [look, setLook] = useState<LookTarget | null>(null);
  // ?quality=fast for weaker graphics: a lower pixel ratio, no drawn detail, coarser shadow steps.
  const [quality] = useState<'full' | 'fast'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quality') === 'fast' ? 'fast' : 'full'));

  useEffect(() => {
    let live = true;
    const search = window.location.search;
    const q = standQuery(search);
    void (async () => {
      await store.getState().init();
      await store.getState().applyQuery(search);
      if (q.hour !== undefined) store.getState().setCursor(q.hour);
      await store.getState().waitForTerrain();
      if (live) setGroundReady(true);
    })();
    loadSkyAssets(dataBase()).then(
      (assets) => live && setSky(assets),
      () => live && setFailed('data'),
    );
    return () => {
      live = false;
    };
  }, [store]);

  const scene = useMemo<StandScene | null>(() => {
    if (!groundReady || !sky || !s.site || !s.series || !s.mask) return null;
    const levels = shadowLevels(s.site, s.heightmap, s.contextHeightmap, s.capHeightmap);
    const siteHeightM = s.heightmap?.meta.site_height_m ?? s.maskMeta?.siteHeightM ?? 0;
    const field = levels.length ? terrainField(levels, s.site.lon, siteHeightM) : flatField(s.site.lon);
    return { field, mask: { az0: 0, step: 360 / s.mask.length, el: s.mask }, series: s.series, startUtc: s.startUtc, site: s.site, mastM: s.params.mastM, sky, quality };
  }, [groundReady, sky, s.site, s.series, s.mask, s.heightmap, s.contextHeightmap, s.capHeightmap, s.maskMeta, s.params.mastM, s.startUtc, quality]);
  const onFail = useCallback(() => setFailed('webgl'), []);

  if (s.status === 'error') {
    return (
      <main className="theme-dark fixed inset-0 grid place-items-center bg-black p-4 text-[#f2f0ea]">
        <p className="max-w-[520px] text-lg">
          The data for this view did not load. <Link href="/explore" className="underline underline-offset-4">Back to Explore</Link>
        </p>
      </main>
    );
  }
  if (s.status !== 'ready' || !s.site || !s.series || !s.summary || !s.power) {
    return (
      <main className="theme-dark fixed inset-0 grid place-items-center bg-black text-[#c3bfb6]">
        <p role="status" className="text-lg">Building the ground from NASA heights…</p>
      </main>
    );
  }

  const site = s.site, series = s.series;
  const hour = Math.min(series.hours - 1, Math.max(0, s.cursorHour));
  const answer = answerFor({ siteName: siteLabel(site), series, summary: s.summary, power: s.power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, batteryWh: s.params.power.batteryWh, best: s.best });
  const lander = landerState(s.power, s.startUtc, hour);
  // The note describes the view from the site: shown with it, not while the ground loads or in the fallback.
  const note = scene && !failed ? measuredNote(scene.field.levels.map((l) => l.cell)) : null;
  const face = (az: number, el: number, fov: number) => setLook({ yaw: az, pitch: Math.max(-8, Math.min(60, el + 1.5)), fov });

  return (
    <main className="theme-dark fixed inset-0 overflow-hidden bg-black text-[#f2f0ea]">
      {scene && !failed && (
        <StandCanvas
          scene={scene}
          hour={hour}
          look={look}
          startYaw={series.sunAz[hour]}
          reducedMotion={reducedMotion}
          createRenderer={createRenderer}
          sunLabel={skyLabel('sun', series, hour)}
          earthLabel={skyLabel('earth', series, hour)}
          onFail={onFail}
        />
      )}
      {failed && s.mask && (
        <div className="fixed inset-x-4 top-1/2 mx-auto max-w-[900px] -translate-y-1/3">
          <p className="mb-3 text-[15px] text-[#c3bfb6]">
            {failed === 'webgl' ? 'This browser cannot draw the view from the site, so here is the view all round instead.' : 'The view from the site could not be loaded, so here is the view all round instead.'}
          </p>
          <HorizonView mask={s.mask} series={series} cursor={hour} lat={site.lat} startUtc={s.startUtc} />
        </div>
      )}
      {!scene && !failed && <p role="status" className="fixed inset-x-0 top-1/2 text-center text-lg text-[#c3bfb6]">Building the ground from NASA heights…</p>}

      <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start justify-between gap-3 md:flex-row">
        <section aria-label="The answer for this site" className={`${PLATE} pointer-events-auto grid w-full max-w-[560px] gap-2 p-5`}>
          <p className="text-[15px] text-[#c3bfb6]">
            Standing at {siteLabel(site)}, {Math.abs(site.lat).toFixed(1)}° {site.lat < 0 ? 'S' : 'N'}
            {site.blurb ? `: ${site.blurb}` : ''}.
          </p>
          <h1 className="display text-balance text-[24px] font-bold leading-tight sm:text-[30px]">{answer.title}</h1>
          <p className="text-base">{liveSentence(series, hour)}</p>
          <p className="flex items-center gap-2 text-[15px]">
            <i aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${lander.on ? 'bg-[#8ddcaa]' : 'bg-[#ff9180]'}`} />
            {lander.text}
          </p>
          <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 w-fit items-center text-[15px] underline underline-offset-4">
            Back to Explore
          </Link>
          {note && (
            <details className="group text-[15px] text-[#c3bfb6] md:hidden">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-[#f2f0ea] [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
                What is measured
              </summary>
              <p className="pb-1">{note}</p>
            </details>
          )}
        </section>
        {!failed && (
          // On a phone the buttons sit just above the time bar, clear of the Sun and its label.
          <div role="group" aria-label="Look towards" className={`${PLATE} pointer-events-auto flex max-w-[360px] flex-wrap gap-2 p-2.5 max-md:fixed max-md:inset-x-4 max-md:bottom-[152px] max-md:max-w-none`}>
            <button type="button" className={LOOK} onClick={() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)}>
              Face the Sun
            </button>
            <button type="button" className={LOOK} onClick={() => face(series.earthAz[hour], series.earthEl[hour], 16)}>
              Face Earth
            </button>
            <button type="button" className={LOOK} onClick={() => setLook({ yaw: series.sunAz[hour], pitch: 70, fov: 72 })}>
              Look up
            </button>
            <p className="w-full px-1 text-[15px] text-[#c3bfb6]">
              <span className="pointer-coarse:hidden">Drag to look around; scroll to zoom.</span>
              <span className="hidden pointer-coarse:inline">Drag to look around; pinch to zoom.</span>
            </p>
          </div>
        )}
      </div>

      {note && (
        <aside className={`${PLATE} fixed bottom-32 right-4 hidden w-[340px] p-3.5 text-[15px] text-[#c3bfb6] md:block`}>
          <b className="text-[#f2f0ea]">What is measured.</b> {note}
        </aside>
      )}

      <div className="fixed inset-x-0 bottom-0">
        <TimeBar series={series} power={s.power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={s.params.power.batteryWh} onCursor={s.setCursor} />
      </div>
    </main>
  );
}
