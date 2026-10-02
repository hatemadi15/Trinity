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
import { landerState, liveSentence, measuredNote, skyLabel, standQuery, watchNext } from '@/lib/viz/stand';
import { StandCanvas, type LookTarget, type RendererLike } from './StandCanvas';

const PLATE = 'rounded-lg border border-white/15 bg-black/75';
const LOOK = 'min-h-10 rounded-lg border border-white/20 px-3.5 text-[15px] hover:bg-white/10';
const defaultRenderer = (canvas: HTMLCanvasElement, scene: StandScene): RendererLike => new StandRenderer(canvas, scene);
/** The lander stands this far from the eye, a little to the right of the Sun the view opens on. */
const LANDER_DIST_M = 9;
const LANDER_RIGHT_DEG = 35;

/** "How we know this", folded away until asked for. */
function HowWeKnow({ note, className }: { note: string; className: string }) {
  return (
    <details className={`group text-[15px] text-[#c3bfb6] ${className}`}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-[#f2f0ea] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ▸
        </span>
        How we know this
      </summary>
      <p className="pb-2">{note}</p>
    </details>
  );
}

/**
 * Stand on the Moon: the full-window view from the landing site for the site, period and hour of the
 * address (Explore's address plus `hour`), with Explore's answer, the sentence for the hour, the lander's
 * state, what to watch next and the time bar on quiet plates that can be hidden for a clear view. A lander
 * stands beside the site for scale. Without WebGL 2 it shows the view all round with the same words.
 */
export function StandView({ store = exploreStore, createRenderer = defaultRenderer }: { store?: StoreApi<ExploreState>; createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => RendererLike }) {
  const s = useStore(store);
  const reducedMotion = useReducedMotion();
  const [sky, setSky] = useState<SkyAssets | null>(null);
  // The hour the view opened on, once the ground has loaded: it places the lander in the first view.
  const [openHour, setOpenHour] = useState<number | null>(null);
  const [failed, setFailed] = useState<'webgl' | 'data' | null>(null);
  const [look, setLook] = useState<LookTarget | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [wordsHidden, setWordsHidden] = useState(false);
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
      if (live) setOpenHour(store.getState().cursorHour);
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
    if (openHour === null || !sky || !s.site || !s.series || !s.mask) return null;
    const levels = shadowLevels(s.site, s.heightmap, s.contextHeightmap, s.capHeightmap);
    const siteHeightM = s.heightmap?.meta.site_height_m ?? s.maskMeta?.siteHeightM ?? 0;
    const field = levels.length ? terrainField(levels, s.site.lon, siteHeightM) : flatField(s.site.lon);
    const opening = Math.min(s.series.hours - 1, Math.max(0, openHour));
    const lander = s.power ? { azDeg: (s.series.sunAz[opening] + LANDER_RIGHT_DEG) % 360, distM: LANDER_DIST_M, powered: s.power.powered } : undefined;
    return { field, mask: { az0: 0, step: 360 / s.mask.length, el: s.mask }, series: s.series, startUtc: s.startUtc, site: s.site, mastM: s.params.mastM, sky, quality, lander };
  }, [openHour, sky, s.site, s.series, s.mask, s.heightmap, s.contextHeightmap, s.capHeightmap, s.maskMeta, s.params.mastM, s.startUtc, s.power, quality]);
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

  const site = s.site, series = s.series, power = s.power;
  const hour = Math.min(series.hours - 1, Math.max(0, s.cursorHour));
  const name = siteLabel(site);
  const answer = answerFor({ siteName: name, series, summary: s.summary, power, startUtc: s.startUtc, days: s.days, loadW: s.params.power.loadW, batteryWh: s.params.power.batteryWh, best: s.best });
  // The site's name stays on one line: "de Gerlache Rim 2", never "Rim / 2".
  const title = answer.title.replace(name, name.replace(/ /g, ' '));
  const lander = landerState(power, s.startUtc, hour);
  // The note describes the view from the site: shown with it, not while the ground loads or in the fallback.
  const note = scene && !failed ? measuredNote(scene.field.levels.map((l) => l.cell), scene.sky.stars.count) : null;
  const face = (az: number, el: number, fov: number) => {
    setLookingUp(false);
    setLook({ yaw: az, pitch: Math.max(-8, Math.min(60, el + 1.5)), fov });
  };

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
          night={series.sunFraction[hour] < 0.5}
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

      {wordsHidden ? (
        <button type="button" className={`${LOOK} fixed left-4 top-4 bg-black/75`} onClick={() => setWordsHidden(false)}>
          Show the words
        </button>
      ) : (
        <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start justify-between gap-3 md:flex-row">
          <section aria-label="The answer for this site" className={`${PLATE} pointer-events-auto grid w-full max-w-[600px] gap-2 p-4 md:p-5`}>
            <p className="text-[15px] text-[#c3bfb6] max-md:hidden">
              Standing at {name}, {Math.abs(site.lat).toFixed(1)}° {site.lat < 0 ? 'S' : 'N'}
              {site.blurb ? `: ${site.blurb}` : ''}.
            </p>
            <h1 className="display text-pretty text-[22px] font-bold leading-tight sm:text-[30px]">{title}</h1>
            <p className="text-base max-md:hidden">{liveSentence(series, hour, lander.on)}</p>
            <p className="flex items-center gap-2 text-[15px]">
              <i aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${lander.on ? 'bg-[#8ddcaa]' : 'bg-[#ff9180]'}`} />
              {lander.text}
            </p>
            <p className="text-[15px] text-[#f6d48a]">{watchNext(series, power, s.startUtc, hour)}</p>
            <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 w-fit items-center text-[15px] underline underline-offset-4">
              Back to Explore
            </Link>
            {note && <HowWeKnow note={note} className="md:hidden" />}
          </section>
          <div className="pointer-events-none flex w-full max-w-[380px] flex-col gap-3 md:items-end">
            {!failed && (
              // On a phone the buttons sit just above the time bar, clear of the Sun and its label.
              <div role="group" aria-label="Look towards" className={`${PLATE} pointer-events-auto flex flex-wrap gap-2 p-2.5 max-md:fixed max-md:inset-x-4 max-md:bottom-[152px]`}>
                <button type="button" className={LOOK} onClick={() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)}>
                  Face the Sun
                </button>
                <button type="button" className={LOOK} onClick={() => face(series.earthAz[hour], series.earthEl[hour], 16)}>
                  Face Earth
                </button>
                {lookingUp ? (
                  <button type="button" className={LOOK} onClick={() => face(series.sunAz[hour], 0.5, 60)}>
                    Look ahead
                  </button>
                ) : (
                  <button
                    type="button"
                    className={LOOK}
                    onClick={() => {
                      setLookingUp(true);
                      setLook({ yaw: series.sunAz[hour], pitch: 70, fov: 72 });
                    }}
                  >
                    Look up
                  </button>
                )}
                <button type="button" className={LOOK} onClick={() => setWordsHidden(true)}>
                  Hide the words
                </button>
                <p className="w-full px-1 text-[15px] text-[#c3bfb6]">Drag to look around; pinch or scroll to zoom.</p>
              </div>
            )}
            {note && <HowWeKnow note={note} className={`${PLATE} pointer-events-auto w-full px-3.5 max-md:hidden`} />}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0">
        {/* No chart above it here: the bar carries the dates and the hours the lander is off. */}
        <TimeBar series={series} power={power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={s.params.power.batteryWh} onCursor={s.setCursor} dates powered={power.powered} />
      </div>
    </main>
  );
}
