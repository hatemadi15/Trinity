'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { HorizonView } from '@/components/explore/HorizonView';
import { TimeBar } from '@/components/explore/TimeBar';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { shadowLevels } from '@/lib/data/terrain';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { exploreHref } from '@/lib/links';
import { StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, heightAt, terrainField } from '@/lib/sky/terrainField';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { answerFor } from '@/lib/viz/answer';
import { keyMoments, landerState, liveSentence, measuredNote, poleLine, radioNext, skyLabel, standingLine, standQuery, watchNext } from '@/lib/viz/stand';
import { StandCanvas, type LookTarget, type RendererLike } from './StandCanvas';

const PLATE = 'rounded-lg border border-white/15 bg-[#060607]/90';
const LOOK = 'min-h-10 rounded-lg border border-white/20 px-3.5 text-[15px] hover:bg-white/10';
const defaultRenderer = (canvas: HTMLCanvasElement, scene: StandScene): RendererLike => new StandRenderer(canvas, scene);
/**
 * The lander stands 16 m away, 30° to the right of what the view opens on: the Sun when it is up, else
 * Earth when it is in view, so the first view holds the lander with the Sun (or, at night, with Earth).
 * It is turned so the Sun lights one of the faces we see, its +x face 75° left of the Sun (from in front
 * of the Sun everything else is lit from behind). The view opens 5° right of the Sun or Earth, which keeps
 * the Sun clear of the answer's panel.
 */
const LANDER_DIST_M = 16;
const LANDER_RIGHT_DEG = 30;
const LANDER_FACE_LEFT_DEG = 75;
const OPEN_RIGHT_DEG = 5;

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
  // On a phone only the headline, the lander and what to watch show until "More about this hour".
  const [more, setMore] = useState(false);
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
    const sunAz = s.series.sunAz[opening];
    const anchor = openingAnchor(s.series, opening);
    const lander = s.power
      ? { azDeg: (anchor + LANDER_RIGHT_DEG) % 360, distM: LANDER_DIST_M, powered: s.power.powered, faceAzDeg: (sunAz - LANDER_FACE_LEFT_DEG + 360) % 360, earthAzDeg: s.series.earthAz[opening], earthElDeg: s.series.earthEl[opening] }
      : undefined;
    return { field, mask: { az0: 0, step: 360 / s.mask.length, el: s.mask }, series: s.series, startUtc: s.startUtc, site: s.site, mastM: s.params.mastM, sky, quality, lander };
  }, [openHour, sky, s.site, s.series, s.mask, s.heightmap, s.contextHeightmap, s.capHeightmap, s.maskMeta, s.params.mastM, s.startUtc, s.power, quality]);
  const onFail = useCallback(() => setFailed('webgl'), []);

  // The time bar and the phone's look buttons change height with the width and the words: what sits above
  // them reads their measured heights (--bar-h, --look-h) instead of fixed offsets.
  const mainRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = mainRef.current;
    if (!main || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      main.style.setProperty('--bar-h', `${barRef.current?.offsetHeight ?? 0}px`);
      main.style.setProperty('--look-h', `${lookRef.current?.offsetHeight ?? 0}px`);
      main.style.setProperty('--top-h', `${(topRef.current?.offsetHeight ?? 0) + 16}px`);
    };
    const ro = new ResizeObserver(measure);
    for (const el of [barRef.current, lookRef.current, topRef.current]) if (el) ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [s.status, wordsHidden, failed, scene, more]);

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
  // The radio story: no contact while it has power from the landing, and when power and Earth meet.
  const contact = answer.poweredHours > 0 ? answer.sentences[0] : null;
  const radio = radioNext(series, power, s.startUtc);
  const moments = keyMoments(series, power, s.startUtc);
  const opening = openHour === null ? hour : Math.min(series.hours - 1, Math.max(0, openHour));

  return (
    <main ref={mainRef} className="theme-dark fixed inset-0 overflow-hidden bg-black text-[#f2f0ea]">
      {scene && !failed && (
        <StandCanvas
          scene={scene}
          hour={hour}
          look={look}
          startYaw={(openingAnchor(series, opening) + (scene.lander ? OPEN_RIGHT_DEG : 0)) % 360}
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
        <button type="button" data-plate="" className={`${LOOK} fixed left-4 top-4 bg-black/75`} onClick={() => setWordsHidden(false)}>
          Show the words
        </button>
      ) : (
        <div className="pointer-events-none fixed inset-x-4 top-4 flex flex-col items-start justify-between gap-3 md:flex-row">
          <section ref={topRef} data-plate="" aria-label="The answer for this site" className={`${PLATE} pointer-events-auto grid w-full max-w-[600px] gap-2 p-4 md:p-5`}>
            <p className="text-[15px] text-[#c3bfb6] max-md:hidden">{standingLine(site, name, false)}</p>
            <p className="text-[14px] text-[#c3bfb6] md:hidden">{standingLine(site, name, true)}</p>
            <h1 className="display text-pretty text-[20px] font-bold leading-tight sm:text-[30px]">{title}</h1>
            <div className={`grid gap-2 ${more ? '' : 'max-md:hidden'}`}>
              {contact && (
                <p className="text-base">
                  <span>{contact}</span>
                  {radio && <span> </span>}
                  {radio && <span>{radio}</span>}
                </p>
              )}
              <p className="text-base">{liveSentence(series, hour, lander.on)}</p>
              {poleLine(site.lat) && <p className="text-[15px] text-[#e4e1da]">{poleLine(site.lat)}</p>}
            </div>
            <p className="flex items-center gap-2 text-[15px]">
              <i aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${lander.on ? 'bg-[#8ddcaa]' : 'bg-[#ff9180]'}`} />
              {lander.text}
            </p>
            <p className="text-[15px] text-[#f6d48a]">{watchNext(series, power, s.startUtc, hour)}</p>
            <div className={`grid gap-1 ${more ? '' : 'max-md:hidden'}`}>
              <Link href={exploreHref(site.id, s.startUtc, s.days)} className="flex min-h-10 w-fit items-center text-[15px] underline underline-offset-4">
                Back to the forecast
              </Link>
              {note && <HowWeKnow note={note} className="md:hidden" />}
            </div>
            <button type="button" className="flex min-h-10 w-fit items-center text-[15px] underline underline-offset-4 md:hidden" aria-expanded={more} onClick={() => setMore((m) => !m)}>
              {more ? 'Fewer words' : 'More about this hour'}
            </button>
          </section>
          <div className="pointer-events-none flex w-full max-w-[380px] flex-col gap-3 md:items-end">
            {!failed && (
              // On a phone the buttons make one row of short names just above the time bar, clear of the Sun.
              <div ref={lookRef} data-plate="" role="group" aria-label="Look towards" className={`${PLATE} pointer-events-auto flex flex-wrap gap-2 p-2.5 max-md:fixed max-md:inset-x-4 max-md:bottom-[calc(var(--bar-h,211px)+10px)] max-md:flex-nowrap max-md:justify-between max-md:gap-1 max-md:p-1.5 max-md:[&>button]:px-2`}>
                <button type="button" aria-label="Face the Sun" className={LOOK} onClick={() => face(series.sunAz[hour], series.sunEl[hour] - 2, 46)}>
                  <Short short="Sun" long="Face the Sun" />
                </button>
                <button type="button" aria-label="Face Earth" className={LOOK} onClick={() => face(series.earthAz[hour], series.earthEl[hour], 16)}>
                  <Short short="Earth" long="Face Earth" />
                </button>
                {scene?.lander && (
                  <button
                    type="button"
                    aria-label="Face the lander"
                    className={LOOK}
                    onClick={() => {
                      // Aim at the lander's middle where it stands: the ground can fall away from the eye.
                      const l = scene.lander!, a = (l.azDeg * Math.PI) / 180;
                      const ground = heightAt(scene.field, l.distM * Math.sin(a), -l.distM * Math.cos(a));
                      const eye = heightAt(scene.field, 0, 0) + scene.mastM;
                      setLookingUp(false);
                      setLook({ yaw: l.azDeg, pitch: (Math.atan2(ground + 1.7 - eye, l.distM) * 180) / Math.PI, fov: 36 });
                    }}
                  >
                    <Short short="Lander" long="Face the lander" />
                  </button>
                )}
                {lookingUp ? (
                  <button type="button" aria-label="Look ahead" className={LOOK} onClick={() => face(series.sunAz[hour], 0.5, 60)}>
                    <Short short="Ahead" long="Look ahead" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Look up"
                    className={LOOK}
                    onClick={() => {
                      setLookingUp(true);
                      setLook({ yaw: series.sunAz[hour], pitch: 70, fov: 72 });
                    }}
                  >
                    <Short short="Up" long="Look up" />
                  </button>
                )}
                <button type="button" aria-label="Hide the words" className={LOOK} onClick={() => setWordsHidden(true)}>
                  <Short short="Hide" long="Hide the words" />
                </button>
                <p className="w-full px-1 text-[15px] text-[#c3bfb6] max-md:hidden">Drag to look around; pinch or scroll to zoom.</p>
              </div>
            )}
            {note && (
              <div data-plate="" className="pointer-events-auto w-full max-md:hidden">
                <HowWeKnow note={note} className={`${PLATE} px-3.5`} />
              </div>
            )}
            {moments.length > 0 && (
              <div data-plate="" role="group" aria-label="Key moments" className={`${PLATE} pointer-events-auto w-full p-2.5 ${more ? '' : 'max-md:hidden'}`}>
                <p className="px-1 pb-1.5 text-[15px] text-[#c3bfb6]">Jump to</p>
                <div className="flex flex-wrap gap-2">
                  {moments.map((m) => (
                    <button key={m.label} type="button" className={LOOK} onClick={() => s.setCursor(m.hour)}>
                      {`${m.label}, ${m.day}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={barRef} data-plate="" className="fixed inset-x-0 bottom-0">
        {/* No chart above it here: the bar carries the dates and the hours the lander is off. */}
        <TimeBar series={series} power={power} startUtc={s.startUtc} cursor={hour} hoverHour={null} batteryWh={s.params.power.batteryWh} onCursor={s.setCursor} dates powered={power.powered} />
      </div>
    </main>
  );
}

/** A button's words: short on a phone, full elsewhere (the button's aria-label carries the full name). */
function Short({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true" className="md:hidden">
        {short}
      </span>
      <span aria-hidden="true" className="max-md:hidden">
        {long}
      </span>
    </>
  );
}

/** What the first view looks towards: the Sun when any of it is up, else Earth when it is in view, else where the Sun is. */
function openingAnchor(series: { sunFraction: ArrayLike<number>; earthVisible: ArrayLike<number>; sunAz: ArrayLike<number>; earthAz: ArrayLike<number> }, hour: number): number {
  if (series.sunFraction[hour] > 0) return series.sunAz[hour];
  if (series.earthVisible[hour] === 1) return series.earthAz[hour];
  return series.sunAz[hour];
}
