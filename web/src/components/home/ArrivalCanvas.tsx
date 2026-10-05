'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadGlobeAssets, type GlobeAssets } from '@/lib/data/globe';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { contextFileFor, loadHeightmap, loadTerrainManifest, shadowLevels, windowFileFor, type Heightmap } from '@/lib/data/terrain';
import type { Level } from '@/lib/engine/shadow';
import { flightKeys, polePoint, poseAt, siteEndHour, siteTrack, type Key, type PathInput } from '@/lib/sky/arrivalPath';
import { hourAt, LANDED } from '@/lib/sky/arrivalTiming';
import { dirAzEl, enuBasis, type Vec3 } from '@/lib/sky/frames';
import { eyeAt, StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, meshHeightAt, terrainField } from '@/lib/sky/terrainField';
import { HERO_HOUR, hero, type Hero } from '@/lib/viz/arrival';
import { dateLong } from '@/lib/viz/format';
import { EARTH_LOOP, keyMoments, skyLabel, type MomentKind } from '@/lib/viz/stand';
import { standLander } from '@/lib/viz/standOpening';

/** The renderer as the arrival drives it; a stub in tests. */
export type ArrivalRenderer = Pick<StandRenderer, 'setTime' | 'setPose' | 'setScene' | 'setGuides' | 'resize' | 'render' | 'project' | 'labels' | 'dispose' | 'resting'> & {
  /** Counts the scenes put on the screen (StandRenderer's); a stub may leave it out. */
  generation?: number;
  ready?: Promise<void>;
  onLost?: (why: string) => void;
  onSharp?: () => void;
};
/** What the arrival loads: the sky, the Moon from space, and the hero site's measured ground. */
export interface ArrivalLoaders {
  sky: () => Promise<SkyAssets>;
  globe: () => Promise<GlobeAssets>;
  terrain: () => Promise<{ cap: Heightmap; window: Heightmap | null; context: Heightmap | null }>;
}
/** 960 m cells each way round the site: the cap reaches 460 km, so shadows out to 200 km have their hills. */
export const ARRIVAL_CAP_HALF_PX = 480;

export function browserArrivalLoaders(siteId: string, base = dataBase()): ArrivalLoaders {
  return {
    sky: () => loadSkyAssets(base),
    globe: () => loadGlobeAssets(base),
    terrain: async () => {
      const m = await loadTerrainManifest(base), w = windowFileFor(m, siteId), c = contextFileFor(m, siteId);
      const [cap, window, context] = await Promise.all([
        loadHeightmap(base, m.cap.file, m.cap.meta),
        w ? loadHeightmap(base, w.file, w.meta) : Promise.resolve(null),
        c ? loadHeightmap(base, c.file, c.meta).catch(() => null) : Promise.resolve(null),
      ]);
      return { cap, window, context };
    },
  };
}

export interface StageProps {
  /** The flight's progress, 0 (the Moon from space) to 4 (standing), read every frame. */
  progress: { current: number };
  /** Reduced motion: the section stops the progress on the beats, each with its own hour; the stage draws what it is given. */
  reduced: boolean;
  /** For stills and the recorded walk: window.__arrival sets the progress and waits for a sharp frame. */
  capture?: boolean;
  onLive: () => void;
  onFail: (why: string) => void;
  createRenderer?: (canvas: HTMLCanvasElement, scene: StandScene) => ArrivalRenderer;
  loaders?: ArrivalLoaders;
}

const isTall = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
const fast = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quality') === 'fast';
const newRenderer = (canvas: HTMLCanvasElement, scene: StandScene): ArrivalRenderer => new StandRenderer(canvas, scene);

/** The scene for what has loaded: the sky and the globe, then the measured ground with the lander once it comes. */
export function arrivalScene(h: Hero, sky: SkyAssets, globe: GlobeAssets, levels: Level[] | null): StandScene {
  const ground = !!levels && levels.length > 0;
  return {
    field: ground ? terrainField(levels!, h.site.lon, h.siteHeightM) : flatField(h.site.lon),
    mask: { az0: 0, step: 360 / h.mask.length, el: h.mask },
    series: h.series,
    startUtc: h.startUtc,
    site: h.site,
    mastM: 2,
    sky,
    quality: fast() ? 'fast' : 'full',
    globe,
    siteHeightM: h.siteHeightM,
    earthKm: h.earthKm,
    ground,
    lander: ground ? standLander(h.series, h.power, isTall()) : undefined,
  };
}

/**
 * The flight's input for a scene and a view's shape: the Sun and Earth at the arrival's hour, and the lander the
 * flight lands beside (where the stand view puts it; its place stands even before the ground comes to draw it).
 */
export function pathInput(h: Hero, scene: StandScene, aspect: number): PathInput {
  const s = h.series, t = HERO_HOUR, eye = eyeAt(scene), e = dirAzEl(s.earthAz[t], s.earthEl[t]), m = h.earthKm[t] * 1000;
  const lander = scene.lander ?? standLander(s, h.power, aspect < 1), a = lander.azDeg * (Math.PI / 180);
  // After landing the month runs on at the site, the camera beside the lander following its story (siteTrack).
  const moments = keyMoments(s, h.power, h.startUtc);
  const track = siteTrack({ series: s, moments, aspect, startHour: t, endHour: siteEndHour(moments, s.hours) });
  return {
    basis: enuBasis(h.site.lat, h.site.lon),
    siteHeightM: h.siteHeightM,
    track,
    sun: dirAzEl(s.sunAz[t], s.sunEl[t]),
    earth: [e[0] * m, eye + e[1] * m, e[2] * m],
    groundAt: (x, z) => meshHeightAt(scene.field, x, z),
    aspect,
    lander: { x: lander.distM * Math.sin(a), z: -lander.distM * Math.cos(a) },
  };
}

const CHIP_BOX = 'pointer-events-none absolute rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px]';
const CHIP = `${CHIP_BOX} whitespace-nowrap`;
/** A label over what it names, with a dot on the point; or beside it, to its right. */
const LABEL = `${CHIP} -translate-x-1/2 -translate-y-[130%]`;
const LABEL_RIGHT = `${CHIP} group translate-x-3 -translate-y-1/2 data-[side=left]:-translate-x-[calc(100%+12px)] data-[side=below]:-translate-x-1/2 data-[side=below]:translate-y-3 data-[side=up]:-translate-y-full`;
/**
 * Beside Earth, clear of its disc (at most about 60 px across). Either label beside its point turns to the left
 * where it would run off the view, and goes under the point where neither side has room.
 */
const LABEL_BESIDE_EARTH = `${CHIP_BOX} w-max max-w-[15rem] translate-x-[36px] -translate-y-1/2 data-[side=left]:-translate-x-[calc(100%+36px)] data-[side=below]:-translate-x-1/2 data-[side=below]:translate-y-[22px] data-[side=up]:-translate-y-full`;
const DOT = 'absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current';
/** The dot of a label beside its point: on the label's left, or its right when the label turns. */
const SIDE_DOT = `${DOT} -left-3 top-1/2 group-data-[side=left]:left-auto group-data-[side=left]:-right-3 group-data-[side=left]:translate-x-1/2 group-data-[side=below]:left-1/2 group-data-[side=below]:-top-3 group-data-[side=up]:top-full`;
/** The line from a label to its dot below it: the 30 % of the label's height between them. */
const STEM = 'absolute left-1/2 top-full h-[30%] w-px -translate-x-1/2 bg-current opacity-60';
/** The line from a path's name down to its path, 8 px. */
const STEM_DOWN = 'absolute left-1/2 top-full h-2 w-px -translate-x-1/2 bg-current opacity-60';
/** The line from a label beside its point to the dot, either side; above or below the point the dot is close enough alone. */
const SIDE_STEM = 'absolute right-full top-1/2 h-px w-[9px] -translate-y-1/2 bg-current opacity-60 group-data-[side=left]:left-full group-data-[side=left]:right-auto group-data-[side=below]:hidden group-data-[side=up]:hidden';
type Tag = 'earth' | 'pole' | 'site' | 'sun' | 'earthHere';
/**
 * What lights the ground at the site at an hour, in words: the Sun, or at night Earth alone or nothing. In Earthlight
 * the ground looks blue, and the words say so, so the blue reads as the light and not as the ground's own colour
 * (16.3). At night the picture is brightened, as the stand view says, and the words say so: the ground would look
 * near black.
 */
export function lightWords(series: Pick<Hero['series'], 'sunFraction' | 'earthVisible'>, hour: number): string {
  if (series.sunFraction[hour] > 0) return 'in sunlight';
  return series.earthVisible[hour] === 1 ? 'night, in blue Earthlight (picture brightened)' : 'night (picture brightened)';
}
/** The date bar's key: what each colour of mark stands for, in the order of its lanes. */
const TICK_KEY = [
  ['#f6b646', 'Sunset or sunrise'],
  ['#e5e3dc', 'The battery runs out'],
  ['#74adff', 'Earth rises or sets'],
] as const;
/** The lane of a moment's mark on the date bar: the Sun's over the line, Earth's under it, the battery's across it. */
export function laneOf(kind: MomentKind): 'sun' | 'power' | 'earth' {
  return kind.startsWith('earth') ? 'earth' : kind.startsWith('sun') ? 'sun' : 'power';
}
const LANE_COLOUR = { sun: '#f6b646', power: '#e5e3dc', earth: '#74adff' } as const;
/**
 * Where a lane's mark sits against the 3 px line: the battery's 6 px tall across it, the Sun's and Earth's 10 px tall
 * from 5 px off it, a 2 px gap between lanes, so two marks a few hours apart in two lanes read as two.
 */
const LANE_PLACE = { sun: 'bottom-[calc(50%+5px)] h-2.5', power: 'top-1/2 h-1.5 -translate-y-1/2', earth: 'top-[calc(50%+5px)] h-2.5' } as const;
const DEG = Math.PI / 180;
/** How far a pointer to a body out of view stands in from the view's edge, beyond half its own size, in pixels. */
const EDGE_IN_PX = 12;
/** How far a label keeps from a beat's plate, and a label moved off one from the view's top and foot, in pixels. */
const PLATE_GAP_PX = 6, VIEW_IN_PX = 8;
type Box = { left: number; top: number; right: number; bottom: number };
/** Whether a box keeps that gap from every plate, beyond at least one of the plate's sides (less a hair, for rounding). */
const apart = (b: Box, plates: Box[]) => plates.every((w) => Math.max(w.left - b.right, b.left - w.right, w.top - b.bottom, b.top - w.bottom) >= PLATE_GAP_PX - 1e-6);
/**
 * How far to move a label down the view (up where negative), in pixels, so it keeps 6 px clear of every beat's plate
 * rather than sit under one: none where it already does. Else the shorter of the moves above a plate it meets (its
 * foot 6 px over the plate's top) and below it (its top 6 px under the plate's foot), of those that leave it clear of
 * every plate and 8 px inside the view; null where none does, and the label hides.
 */
export function clearOfPlates(box: Box, plates: Box[], viewTop: number, viewBottom: number): number | null {
  if (apart(box, plates)) return 0;
  let best: number | null = null;
  for (const w of plates) {
    if (apart(box, [w])) continue;
    for (const dy of [w.top - PLATE_GAP_PX - box.bottom, w.bottom + PLATE_GAP_PX - box.top]) {
      // Built from the box's edges: a DOMRect's are not its own properties, so spreading it would lose them.
      const moved = { left: box.left, right: box.right, top: box.top + dy, bottom: box.bottom + dy };
      const fits = moved.top >= viewTop + VIEW_IN_PX && moved.bottom <= viewBottom - VIEW_IN_PX && apart(moved, plates);
      if (fits && (best === null || Math.abs(dy) < Math.abs(best))) best = dy;
    }
  }
  return best;
}
/** The sides a label beside its point takes, in turn: right of it (no side set), left, below and above. */
const SIDES: (string | null)[] = [null, 'left', 'below', 'up'];

/**
 * The arrival's live stage: the Moon from space down to the stand view, by the flight's progress. It starts
 * on the sky and the globe and swaps in the measured ground when it comes; labels name Earth and the pole from
 * space, the site on the way down and the Sun once standing; through the month at the site a line gives the date.
 */
export default function ArrivalCanvas({ progress, capture = false, onLive, onFail, createRenderer = newRenderer, loaders }: StageProps) {
  const h = useMemo(() => hero(), []);
  // The month at the site's moments and its last hour, for the hours and the date's bar; when Earth comes into view
  // and the Sun comes back, for which path is named.
  const moments = useMemo(() => keyMoments(h.series, h.power, h.startUtc), [h]);
  const endHour = useMemo(() => siteEndHour(moments, h.series.hours), [moments, h]);
  const story = useMemo(() => {
    const at = (...kinds: string[]) => moments.find((m) => kinds.includes(m.kind))?.hour ?? Infinity;
    return { rise: at('earth-in'), back: at('sun-back', 'sun-power-back') };
  }, [moments]);
  const load = useMemo(() => loaders ?? browserArrivalLoaders(h.site.id), [loaders, h]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<Record<Tag, HTMLSpanElement | null>>({ earth: null, pole: null, site: null, sun: null, earthHere: null });
  // The date's bar: the date and what lights the ground, and the hour's mark on the month, the part gone filled.
  const barRef = useRef<HTMLDivElement>(null), dateRef = useRef<HTMLParagraphElement>(null), stateRef = useRef<HTMLParagraphElement>(null), markRef = useRef<HTMLElement>(null), fillRef = useRef<HTMLSpanElement>(null);
  // The pointer to the Sun from the view's edge while it is out of sight, and its arrow.
  const edgeRef = useRef<HTMLSpanElement>(null), arrowRef = useRef<HTMLElement>(null);
  // Once standing, the pointer to Earth, wherever it is out of view.
  const earthEdgeRef = useRef<HTMLSpanElement>(null), earthArrowRef = useRef<HTMLElement>(null);
  // The Sun's and Earth's words, for the hour shown (the month at the site moves it on): on their labels and pointers.
  const sunTextRef = useRef<HTMLSpanElement>(null), earthTextRef = useRef<HTMLSpanElement>(null), earthHereTextRef = useRef<HTMLSpanElement>(null);
  // Once landed, each body's path named over its line while it is the story.
  const pathNameRefs = useRef<Record<'sun' | 'earth', HTMLSpanElement | null>>({ sun: null, earth: null });
  // Over the pole, a name for the dark side.
  const nightRef = useRef<HTMLSpanElement>(null);
  const [sky, setSky] = useState<SkyAssets | null>(null);
  const [globe, setGlobe] = useState<GlobeAssets | null>(null);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const failRef = useRef(onFail), liveRef = useRef(onLive);
  useEffect(() => {
    failRef.current = onFail;
    liveRef.current = onLive;
  });

  useEffect(() => {
    let alive = true;
    load.sky().then(
      (a) => alive && setSky(a),
      () => alive && failRef.current('The sky did not load'),
    );
    load.globe().then(
      (g) => alive && setGlobe(g),
      () => alive && failRef.current('The Moon did not load'),
    );
    // The measured ground is an extra: without it the flight goes on over the globe.
    load.terrain().then(
      (t) => alive && setLevels(shadowLevels(h.site, t.window, t.context, t.cap, ARRIVAL_CAP_HALF_PX)),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [load, h]);

  const scene = useMemo(() => (sky && globe ? arrivalScene(h, sky, globe, levels) : null), [h, sky, globe, levels]);
  const sceneRef = useRef(scene);
  const rRef = useRef<ArrivalRenderer | null>(null);
  useEffect(() => {
    // A later scene (the ground arrived) replaces the one on the screen once it is built.
    if (scene && rRef.current && sceneRef.current !== scene) rRef.current.setScene(scene);
    sceneRef.current = scene;
  }, [scene]);

  const started = scene !== null;
  useEffect(() => {
    const el = canvas.current, first = sceneRef.current;
    if (!started || !el || !first) return;
    let r: ArrivalRenderer;
    try {
      r = createRenderer(el, first);
    } catch (e) {
      failRef.current(e instanceof Error ? e.message : String(e));
      return;
    }
    rRef.current = r;
    let alive = true, raf = 0, drawn = false, live = false;
    const fail = (why: string) => {
      if (alive) failRef.current(why);
    };
    r.onLost = fail;
    void Promise.resolve(r.ready).then(
      () => {
        drawn = true;
      },
      (e: unknown) => fail(e instanceof Error ? e.message : String(e)),
    );
    const lost = (e: Event) => {
      e.preventDefault();
      fail('The graphics context was lost');
    };
    el.addEventListener('webglcontextlost', lost);
    // Stills and the recorded walk: the page sets the flight's progress and waits for a sharp frame: the next
    // frame drawn that rests where it was asked, or the renderer's sharp frame once it comes to rest there.
    let sharp: (() => void) | null = null;
    const settle = () => {
      const s = sharp;
      sharp = null;
      s?.();
    };
    r.onSharp = settle;
    const hook = window as unknown as { __arrival?: { setProgress: (p: number) => void; sharp: () => Promise<void> } };
    if (capture) {
      hook.__arrival = {
        setProgress: (p) => {
          progress.current = p;
        },
        sharp: () =>
          new Promise<void>((res) => {
            sharp = res;
          }),
      };
    }
    // The hour the Sun's and Earth's words were last written for.
    let wordsHour = HERO_HOUR;
    let keys: Key[] = [], input: PathInput | null = null, keyed: { scene: StandScene | null; aspect: number } = { scene: null, aspect: 0 };
    // The words on the screen (marked data-words), and the labels already placed this frame. A label under one of the
    // beats' sentences, whose plates (data-plate, `plates`) scroll over the view, would show half covered or through
    // the plate, so none stays there. The night's name and the pointers to the Sun and Earth move up or down clear of
    // the plates (`clearOfPlates`), and the pole's name turns to another side: none blinks off as a plate goes by (part
    // C read 1), and each hides only where it has no room. The other labels hide while they meet any words, as the
    // date's bar does. Words with no plate (the first screen's headline over the Moon, `bare`) would show through a
    // label, so the labels that move give way to those too.
    let words: DOMRect[] = [];
    let bare: DOMRect[] = [];
    let plates: DOMRect[] = [];
    const placed: DOMRect[] = [];
    const meets = (b: DOMRect, rects: DOMRect[]) => rects.some((w) => b.left < w.right && b.right > w.left && b.top < w.bottom && b.bottom > w.top);
    const show = (k: Tag, at: { x: number; y: number; visible: boolean } | null) => {
      const n = tags.current[k];
      if (!n) return;
      n.hidden = !(drawn && at && at.visible);
      if (!n.hidden && at) {
        n.style.left = `${at.x * 100}%`;
        n.style.top = `${at.y * 100}%`;
        // A label beside its point turns to the other side where it would run off the view, and goes under the
        // point where neither side has room; beside it, it rises where it would run off the bottom, as Earth's long
        // name does on a phone.
        if (k === 'earth' || k === 'pole') {
          const view = el.getBoundingClientRect();
          n.removeAttribute('data-side');
          if (n.getBoundingClientRect().right > view.right - 4) {
            n.setAttribute('data-side', 'left');
            if (n.getBoundingClientRect().left < view.left + 4) n.setAttribute('data-side', 'below');
          } else if (n.getBoundingClientRect().bottom > view.bottom - 4) n.setAttribute('data-side', 'up');
        }
        let b = n.getBoundingClientRect();
        // The pole's name turns where a beat's plate would cover it, to the first of its other sides in turn that is
        // clear of the plates, the words with no plate and the labels placed, and inside the view; it hides where none is.
        if (k === 'pole' && !apart(b, plates)) {
          const view = el.getBoundingClientRect(), from = SIDES.indexOf(n.getAttribute('data-side'));
          let turned = false;
          for (let i = 1; i < SIDES.length && !turned; i++) {
            const side = SIDES[(from + i) % SIDES.length];
            if (side) n.setAttribute('data-side', side);
            else n.removeAttribute('data-side');
            b = n.getBoundingClientRect();
            turned = apart(b, plates) && !meets(b, bare) && !meets(b, placed) && b.left >= view.left + 4 && b.right <= view.right - 4 && b.top >= view.top + 4 && b.bottom <= view.bottom - 4;
          }
          if (!turned) {
            n.hidden = true;
            return;
          }
        }
        if (meets(b, k === 'pole' ? bare : words) || meets(b, placed)) n.hidden = true;
        else placed.push(b);
      }
    };
    /**
     * Moves a chip up or down clear of the beats' plates (`clearOfPlates`), its left as it was: its box there, or null
     * where neither way has room.
     */
    const offPlates = (n: HTMLElement): DOMRect | null => {
      const b = n.getBoundingClientRect(), view = el.getBoundingClientRect(), dy = clearOfPlates(b, plates, view.top, view.bottom);
      if (dy === null) return null;
      if (dy === 0) return b;
      n.style.top = `${parseFloat(n.style.top) + (dy / view.height) * 100}%`;
      return n.getBoundingClientRect();
    };
    // What was set last, so a frame where nothing has changed sets nothing: the hour's sky (thousands of stars placed
    // again), the pose, and the labels' pass over the page's boxes. The renderer draws only what changed. At rest the
    // labels are placed again four times a second, for words that move without a scroll (a font arriving).
    let lastHour = NaN, lastMove = '', lastLabels = '', labelledAt = 0, posed: ReturnType<typeof poseAt> | null = null;
    const RELABEL_MS = 250;
    const tick = () => {
      raf = 0;
      const s = sceneRef.current!;
      const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight, aspect = W / H;
      if (keyed.scene !== s || Math.abs(keyed.aspect - aspect) > 1e-3) {
        r.resize(W, H);
        input = pathInput(h, s, aspect);
        keys = flightKeys(input);
        keyed = { scene: s, aspect };
      }
      const p = progress.current, hour = hourAt(p, HERO_HOUR, endHour), move = `${p} ${keys.length} ${aspect} ${W}x${H}`;
      if (move !== lastMove || !posed) {
        lastMove = move;
        posed = poseAt(keys, p, input!);
        // The pose first: the hour's light depends on how high the camera is.
        r.setPose(posed);
        // The month's paths only once standing: in flight their faint bands would cross the Moon.
        // The paths and the rings without the level horizon: the story is told without it.
        r.setGuides(p > LANDED, false);
      }
      if (hour !== lastHour) {
        lastHour = hour;
        r.setTime(hour);
      }
      r.render();
      if (sharp && r.resting) settle();
      if (drawn && !live) {
        live = true;
        liveRef.current();
      }
      const labelsKey = `${move} ${hour} ${drawn} ${r.generation ?? 0}`, now = performance.now();
      if (labelsKey === lastLabels && now - labelledAt < RELABEL_MS) {
        raf = visible ? requestAnimationFrame(tick) : 0;
        return;
      }
      lastLabels = labelsKey;
      labelledAt = now;
      const pose = posed;
      // Words faded near the top (a beat's, scrolling away) no longer count: they are gone from over the date's bar.
      const shownWords = [...document.querySelectorAll<HTMLElement>('[data-words]')].filter((w) => Number(w.style.opacity || 1) >= 0.25);
      const boxOf = (w: HTMLElement) => w.getBoundingClientRect();
      words = shownWords.map(boxOf).filter((b) => b.width > 0 && b.height > 0);
      bare = shownWords.filter((w) => !w.hasAttribute('data-plate')).map(boxOf).filter((b) => b.width > 0 && b.height > 0);
      plates = shownWords.filter((w) => w.hasAttribute('data-plate')).map(boxOf).filter((b) => b.width > 0 && b.height > 0);
      placed.length = 0;
      // Once landed the date's bar, first, so the labels keep off it: the date, a moment for a day or so after it
      // passes, else what lights the ground; the hour's mark on the month. It gives way only to the words.
      const bar = barRef.current, d = dateRef.current, st = stateRef.current;
      if (bar && d && st) {
        bar.hidden = !(drawn && p > LANDED);
        if (!bar.hidden) {
          const k = Math.min(h.series.hours - 1, Math.max(0, Math.round(hour)));
          const day = dateLong(h.startUtc, k), dated = /\d{4}$/.test(day) ? day : `${day} ${h.startUtc.slice(0, 4)}`;
          const recent = [...moments].reverse().find((m) => m.hour <= hour && hour - m.hour < 30);
          // The date on one line and what happens on the next, each one line, so the bar never changes height.
          const what = recent ? recent.label : lightWords(h.series, k);
          d.textContent = dated;
          st.textContent = what.charAt(0).toUpperCase() + what.slice(1);
          const at = `${(hour / (h.series.hours - 1)) * 100}%`;
          if (markRef.current) markRef.current.style.left = at;
          if (fillRef.current) fillRef.current.style.width = at;
          const b = bar.getBoundingClientRect();
          if (meets(b, words)) bar.hidden = true;
          else placed.push(b);
        }
      }
      show('earth', p < 0.85 ? r.project(input!.earth, true) : null);
      // From the cap down the ridge is the beat's subject ("NASA has shortlisted this ridge"): its name is placed
      // first, and the pole's gives way where the two would meet, as they do on a phone.
      const poleAt = p < 2.6 ? r.project(polePoint(input!), true) : null, siteAt = p > 1.6 && p < LANDED ? r.project([0, input!.groundAt(0, 0), 0], true) : null;
      if (p > 1.6) {
        show('site', siteAt);
        show('pole', poleAt);
      } else {
        show('pole', poleAt);
        show('site', siteAt);
      }
      // After the whole Moon the Sun is named where it shows, and pointed to from the view's edge where it does
      // not, so its circle round the pole during the month is seen, not only told; once standing, Earth is
      // pointed to as well, so the missing radio has a place. Whether a body shows is worked out here, from its
      // direction in the camera's frame and the view's width and shift.
      const hi = Math.min(h.series.hours - 1, Math.max(0, Math.round(hour))), toCamera = new THREE.Quaternion(...pose.quaternion).invert();
      const tanV = Math.tan((pose.fov * Math.PI) / 360);
      const seen = (dir: Vec3) => {
        const v = new THREE.Vector3(...dir).applyQuaternion(toCamera);
        const nx = v.x / -v.z / (tanV * aspect) + 2 * pose.shift[0], ny = v.y / -v.z / tanV + 2 * pose.shift[1];
        return { v, inView: v.z < 0 && Math.abs(nx) < 0.97 && Math.abs(ny) < 0.97 };
      };
      /** A pointer chip on the view's edge towards a direction out of view, kept far enough in to stay whole. */
      // The camera's pitch, degrees: where a body's height falls on the view's edge once landed.
      const pitchDeg = Math.asin(Math.max(-1, Math.min(1, new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...pose.quaternion)).y))) / DEG;
      /**
       * A pointer chip on the view's edge towards a direction out of view, kept far enough in to stay whole. In flight
       * it stands where the line from the point the camera looks at, out towards the body, meets the edge. Once landed
       * (`elDeg`, the body's height) it stands on the left or right edge, the way round the body is, at the body's
       * height, its arrow along the horizon: a Sun or Earth behind you is never pointed to up in the sky. A beat's
       * plate in its way moves it up or down, clear.
       */
      const point = (chip: HTMLElement | null, arrow: HTMLElement | null, v: THREE.Vector3 | null, elDeg?: number) => {
        if (!chip) return;
        chip.hidden = true;
        const len = v ? Math.hypot(v.x, v.y) : 0;
        if (!drawn || !v || (len < 1e-6 && elDeg === undefined)) return;
        chip.hidden = false;
        const mx = chip.offsetWidth / 2 + EDGE_IN_PX, my = chip.offsetHeight / 2 + EDGE_IN_PX;
        if (elDeg !== undefined) {
          const right = v.x >= 0, y = H * (0.5 - pose.shift[1]) - (Math.tan((elDeg - pitchDeg) * DEG) / tanV) * (H / 2);
          chip.style.left = `${((right ? W - mx : mx) / W) * 100}%`;
          chip.style.top = `${(Math.min(H - my, Math.max(my, y)) / H) * 100}%`;
          if (arrow) arrow.style.transform = `rotate(${right ? 0 : Math.PI}rad)`;
        } else {
          // From the point the camera looks at, out towards the body to the edge, in from each edge by half the chip's
          // own size and a little.
          const ux = v.x / len, uy = -v.y / len, ax = W * (0.5 + pose.shift[0]), ay = H * (0.5 - pose.shift[1]);
          const tx = ux > 0 ? (W - mx - ax) / ux : ux < 0 ? (mx - ax) / ux : Infinity, ty = uy > 0 ? (H - my - ay) / uy : uy < 0 ? (my - ay) / uy : Infinity;
          const t = Math.max(0, Math.min(tx, ty));
          chip.style.left = `${((ax + ux * t) / W) * 100}%`;
          chip.style.top = `${((ay + uy * t) / H) * 100}%`;
          if (arrow) arrow.style.transform = `rotate(${Math.atan2(uy, ux)}rad)`;
        }
        const b = offPlates(chip);
        chip.hidden = !b || meets(b, bare) || meets(b, placed);
        if (b && !chip.hidden) placed.push(b);
      };
      const sunNow = seen(dirAzEl(h.series.sunAz[hi], h.series.sunEl[hi])), earthNow = seen(dirAzEl(h.series.earthAz[hi], h.series.earthEl[hi]));
      if (hi !== wordsHour) {
        wordsHour = hi;
        if (sunTextRef.current) sunTextRef.current.textContent = skyLabel('sun', h.series, hi);
        if (earthTextRef.current) earthTextRef.current.textContent = skyLabel('earth', h.series, hi);
        if (earthHereTextRef.current) earthHereTextRef.current.textContent = skyLabel('earth', h.series, hi);
      }
      // The paths' names hang over their lines, each kept off the other's path, and on a wide screen gather right of
      // the words at the left.
      const lab = p > 0.85 ? r.labels({ above: true, middle: aspect >= 1 ? 0.65 : 0.5 }) : null;
      // Once standing, the lander's box on the screen counts as placed: no name sits on it.
      if (p > 3.8 && lab?.landerBox) {
        const view = el.getBoundingClientRect(), b = lab.landerBox;
        placed.push(new DOMRect(view.left + b.left * view.width, view.top + b.top * view.height, (b.right - b.left) * view.width, (b.bottom - b.top) * view.height));
      }
      show('sun', lab && sunNow.inView ? lab.sun : null);
      show('earthHere', p > LANDED && lab?.earth && earthNow.inView ? lab.earth : null);
      // Over the pole, across the view from the Sun: the dark side is ground at night, not space.
      const night = nightRef.current;
      if (night) {
        night.hidden = true;
        const len = Math.hypot(sunNow.v.x, sunNow.v.y);
        if (drawn && p > 0.85 && p < 1.6 && len > 1e-6) {
          // Whole inside the view by its own width (measured shown), as on a phone, where it is most of the view's width.
          night.hidden = false;
          const ux = -sunNow.v.x / len, uy = sunNow.v.y / len, r0 = 0.28 * Math.min(W, H), hw = Math.min(W / 2, night.offsetWidth / 2 + 8);
          const x = Math.min(W - hw, Math.max(hw, W * (0.5 + pose.shift[0]) + ux * r0)), y = Math.min(H - 40, Math.max(40, H * (0.5 - pose.shift[1]) + uy * r0));
          night.style.left = `${(x / W) * 100}%`;
          night.style.top = `${(y / H) * 100}%`;
          // Moved up or down clear of a beat's plate, rather than half under it.
          const b = offPlates(night);
          night.hidden = !b || meets(b, bare) || meets(b, placed);
          if (b && !night.hidden) placed.push(b);
        }
      }
      // The paths' names once landed (the guides show only then), each while its body is the story: the Sun's until
      // Earth comes into view, then Earth's until the Sun comes back. Each gives way to the words, a beat's plate
      // included, and the labels placed.
      const named = (n: HTMLElement | null, at: { x: number; y: number; visible: boolean } | null | undefined, story: boolean) => {
        if (!n) return;
        n.hidden = !(drawn && p > LANDED && story && at && at.visible);
        if (n.hidden || !at) return;
        n.style.left = `${at.x * 100}%`;
        n.style.top = `${at.y * 100}%`;
        // Whole inside the view: moved in from an edge it would run past, as a long name does on a phone.
        let b = n.getBoundingClientRect();
        const view = el.getBoundingClientRect(), over = Math.max(0, b.right - (view.right - 4)) - Math.max(0, view.left + 4 - b.left);
        if (over !== 0) {
          n.style.left = `calc(${at.x * 100}% - ${over}px)`;
          b = n.getBoundingClientRect();
        }
        n.hidden = meets(b, words) || meets(b, placed);
        if (!n.hidden) placed.push(b);
      };
      // A phone's narrow view has no room for them beside the bodies' own names: none there.
      named(pathNameRefs.current.sun, lab?.pathNames?.find((pn) => pn.body === 'sun'), aspect >= 1 && hour < story.rise);
      named(pathNameRefs.current.earth, lab?.pathNames?.find((pn) => pn.body === 'earth'), aspect >= 1 && hour >= story.rise - 24 && hour < story.back);
      point(edgeRef.current, arrowRef.current, p > 0.85 && !sunNow.inView ? sunNow.v : null, p > LANDED ? h.series.sunEl[hi] : undefined);
      point(earthEdgeRef.current, earthArrowRef.current, p > LANDED && !earthNow.inView ? earthNow.v : null, h.series.earthEl[hi]);
      raf = visible ? requestAnimationFrame(tick) : 0;
    };
    // While the arrival is out of view no frames are drawn; they start again when it comes back.
    let visible = true;
    const watch =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries.some((e) => e.isIntersecting);
            if (visible && !raf) raf = requestAnimationFrame(tick);
          });
    watch?.observe(el);
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      watch?.disconnect();
      el.removeEventListener('webglcontextlost', lost);
      r.dispose();
      rRef.current = null;
      if (capture) delete hook.__arrival;
    };
  }, [started, createRenderer, capture, h, progress, moments, endHour, story]);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Earth and the pole lie close together at the Moon's foot: their names stand beside them, to the right. */}
        {/* Earth is drawn small because it is far: the label says how far, and how big it is. */}
        <span ref={(n) => { tags.current.earth = n; }} hidden className={`${LABEL_BESIDE_EARTH} text-[#74adff]`}>
          Earth, {(Math.round(h.earthKm[HERO_HOUR] / 1000) * 1000).toLocaleString('en-US')} km away on {dateLong(h.startUtc, HERO_HOUR)} {h.startUtc.slice(0, 4)}: it looks small only because it is far
        </span>
        <span ref={(n) => { tags.current.pole = n; }} hidden className={LABEL_RIGHT}>
          <i aria-hidden="true" className={SIDE_DOT} />
          <i aria-hidden="true" data-stem="" className={SIDE_STEM} />
          The Moon&apos;s south pole
        </span>
        <span ref={(n) => { tags.current.site = n; }} hidden className={`${LABEL} text-[#f6d48a]`}>
          <i aria-hidden="true" className={`${DOT} left-1/2 top-[130%]`} />
          <i aria-hidden="true" data-stem="" className={STEM} />
          {siteLabel(h.site)}
        </span>
        <span ref={(n) => { tags.current.sun = n; }} hidden className={`${LABEL} text-[#f6b646]`}>
          <i aria-hidden="true" className={`${DOT} left-1/2 top-[130%]`} />
          <i aria-hidden="true" data-stem="" className={STEM} />
          <span ref={sunTextRef}>{skyLabel('sun', h.series, HERO_HOUR)}</span>
        </span>
        <span ref={edgeRef} hidden data-sun-edge="" className={`${CHIP} -translate-x-1/2 -translate-y-1/2 text-[#f6b646]`}>
          Sun
          <b ref={arrowRef} aria-hidden="true" className="ml-1.5 inline-block">
            →
          </b>
        </span>
        {/* Each path's name hangs over its line, in its body's colour. */}
        <span ref={(n) => { pathNameRefs.current.sun = n; }} hidden data-path-name="" className={`${CHIP} -translate-x-1/2 -translate-y-[calc(100%+8px)] text-[#f6d48a]`}>
          Sun&apos;s path this month
          <i aria-hidden="true" data-stem="" className={STEM_DOWN} />
        </span>
        <span ref={(n) => { pathNameRefs.current.earth = n; }} hidden data-path-name="" className={`${CHIP} -translate-x-1/2 -translate-y-[calc(100%+8px)] text-[#a9c8ff]`}>
          Earth&apos;s path this month
          <span className="block text-[14px] text-[#c6c5c0]">{EARTH_LOOP}</span>
          <i aria-hidden="true" data-stem="" className={STEM_DOWN} />
        </span>
        <span ref={(n) => { tags.current.earthHere = n; }} hidden data-earth-here="" className={`${LABEL} text-[#74adff]`}>
          <i aria-hidden="true" className={`${DOT} left-1/2 top-[130%]`} />
          <i aria-hidden="true" data-stem="" className={STEM} />
          <span ref={earthHereTextRef}>{skyLabel('earth', h.series, HERO_HOUR)}</span>
        </span>
        <span ref={nightRef} hidden className={`${CHIP} -translate-x-1/2 -translate-y-1/2 text-[#c3bfb6]`}>
          Ground at night: the Sun is below the horizon
        </span>
        <span ref={earthEdgeRef} hidden data-earth-edge="" className={`${CHIP} -translate-x-1/2 -translate-y-1/2 text-[#74adff]`}>
          <span ref={earthTextRef}>{skyLabel('earth', h.series, HERO_HOUR)}</span>
          <b ref={earthArrowRef} aria-hidden="true" className="ml-1.5 inline-block">
            →
          </b>
        </span>
        <div ref={barRef} hidden data-date-bar="" className="absolute left-1/2 top-4 w-[min(400px,calc(100%-32px))] -translate-x-1/2 rounded-[6px] border border-white/15 bg-black/75 px-3 pb-1.5 pt-1.5">
          <p ref={dateRef} data-date="" className="truncate text-[16px] leading-snug text-[#f6d48a]" />
          <p ref={stateRef} data-state="" className="truncate text-[15px] leading-snug text-[#e9e6df]" />
          <div className="relative mx-1.5 mt-5 h-[3px] rounded-full bg-white/25">
            <span ref={fillRef} className="absolute inset-y-0 left-0 rounded-full bg-white/70" />
            {moments.map((m) => (
              <i key={m.kind} data-tick="" data-lane={laneOf(m.kind)} className={`absolute w-1 -translate-x-1/2 rounded-full ${LANE_PLACE[laneOf(m.kind)]}`} style={{ left: `${(m.hour / (h.series.hours - 1)) * 100}%`, background: LANE_COLOUR[laneOf(m.kind)] }} />
            ))}
            <b ref={markRef} data-mark="" className="absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-[#f6d48a]" />
          </div>
          <p className="mt-5 flex flex-wrap gap-x-3 gap-y-0.5 text-[15px] text-[#c6c5c0]">
            {TICK_KEY.map(([colour, text]) => (
              <span key={text} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <i aria-hidden="true" className="inline-block h-3 w-[3px] rounded-full" style={{ background: colour }} />
                {text}
              </span>
            ))}
          </p>
        </div>
      </div>
    </>
  );
}
