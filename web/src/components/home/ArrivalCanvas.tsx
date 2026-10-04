'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { loadGlobeAssets, type GlobeAssets } from '@/lib/data/globe';
import { dataBase, siteLabel } from '@/lib/data/loaders';
import { loadSkyAssets, type SkyAssets } from '@/lib/data/sky';
import { contextFileFor, loadHeightmap, loadTerrainManifest, shadowLevels, windowFileFor, type Heightmap } from '@/lib/data/terrain';
import type { Level } from '@/lib/engine/shadow';
import { flightKeys, polePoint, poseAt, type Key, type PathInput } from '@/lib/sky/arrivalPath';
import { hourAt, SWEEP } from '@/lib/sky/arrivalTiming';
import { dirAzEl, enuBasis, type Vec3 } from '@/lib/sky/frames';
import { eyeAt, StandRenderer, type StandScene } from '@/lib/sky/standRenderer';
import { flatField, meshHeightAt, terrainField } from '@/lib/sky/terrainField';
import { HERO_HOUR, hero, type Hero } from '@/lib/viz/arrival';
import { dateLong } from '@/lib/viz/format';
import { skyLabel } from '@/lib/viz/stand';
import { openingYaw, standLander } from '@/lib/viz/standOpening';

/** The renderer as the arrival drives it; a stub in tests. */
export type ArrivalRenderer = Pick<StandRenderer, 'setTime' | 'setPose' | 'setScene' | 'setGuides' | 'resize' | 'render' | 'project' | 'labels' | 'dispose' | 'resting'> & {
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

/** The flight's input for a scene and a view's shape: the Sun and Earth at the arrival's hour. */
export function pathInput(h: Hero, scene: StandScene, aspect: number): PathInput {
  const s = h.series, t = HERO_HOUR, eye = eyeAt(scene), e = dirAzEl(s.earthAz[t], s.earthEl[t]), m = h.earthKm[t] * 1000;
  return {
    basis: enuBasis(h.site.lat, h.site.lon),
    siteHeightM: h.siteHeightM,
    eyeY: eye,
    stand: { yaw: openingYaw(s, t, aspect < 1, !!scene.lander), pitch: 2, fov: aspect < 1 ? 80 : 60 },
    sun: dirAzEl(s.sunAz[t], s.sunEl[t]),
    earth: [e[0] * m, eye + e[1] * m, e[2] * m],
    groundAt: (x, z) => meshHeightAt(scene.field, x, z),
    aspect,
  };
}

const CHIP = 'pointer-events-none absolute whitespace-nowrap rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 text-[15px]';
/** A label over what it names, with a dot on the point; or beside it, to its right. */
const LABEL = `${CHIP} -translate-x-1/2 -translate-y-[130%]`;
const LABEL_RIGHT = `${CHIP} group translate-x-3 -translate-y-1/2 data-[side=left]:-translate-x-[calc(100%+12px)] data-[side=below]:-translate-x-1/2 data-[side=below]:translate-y-3`;
/**
 * Beside Earth, clear of its disc (at most about 60 px across). Either label beside its point turns to the left
 * where it would run off the view, and goes under the point where neither side has room.
 */
const LABEL_BESIDE_EARTH = `${CHIP} translate-x-[36px] -translate-y-1/2 data-[side=left]:-translate-x-[calc(100%+36px)] data-[side=below]:-translate-x-1/2 data-[side=below]:translate-y-[22px]`;
const DOT = 'absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current';
/** The dot of a label beside its point: on the label's left, or its right when the label turns. */
const SIDE_DOT = `${DOT} -left-3 top-1/2 group-data-[side=left]:left-auto group-data-[side=left]:-right-3 group-data-[side=left]:translate-x-1/2 group-data-[side=below]:left-1/2 group-data-[side=below]:-top-3`;
type Tag = 'earth' | 'pole' | 'site' | 'sun';
/** How far a pointer to a body out of view stands in from the view's edge, beyond half its own size, in pixels. */
const EDGE_IN_PX = 12;

/**
 * The arrival's live stage: the Moon from space down to the stand view, by the flight's progress. It starts
 * on the sky and the globe and swaps in the measured ground when it comes; labels name Earth and the pole from
 * space, the site on the way down and the Sun once standing; during the month's sweep a line gives the date.
 */
export default function ArrivalCanvas({ progress, reduced, capture = false, onLive, onFail, createRenderer = newRenderer, loaders }: StageProps) {
  const h = useMemo(() => hero(), []);
  const load = useMemo(() => loaders ?? browserArrivalLoaders(h.site.id), [loaders, h]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<Record<Tag, HTMLSpanElement | null>>({ earth: null, pole: null, site: null, sun: null });
  const dateRef = useRef<HTMLParagraphElement>(null);
  // The pointer to the Sun from the view's edge while it is out of sight, and its arrow.
  const edgeRef = useRef<HTMLSpanElement>(null), arrowRef = useRef<HTMLElement>(null);
  // Once standing, the pointer to Earth, wherever it is out of view.
  const earthEdgeRef = useRef<HTMLSpanElement>(null), earthArrowRef = useRef<HTMLElement>(null);
  const [sky, setSky] = useState<SkyAssets | null>(null);
  const [globe, setGlobe] = useState<GlobeAssets | null>(null);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const failRef = useRef(onFail), liveRef = useRef(onLive), reducedRef = useRef(reduced);
  useEffect(() => {
    failRef.current = onFail;
    liveRef.current = onLive;
    reducedRef.current = reduced;
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
    let keys: Key[] = [], input: PathInput | null = null, keyed: { scene: StandScene | null; aspect: number } = { scene: null, aspect: 0 };
    // The words on the screen (marked data-words), and the labels already placed this frame: a label that would
    // fall on either waits until they move apart (Earth's first, then the pole's, the site's and the Sun's).
    let words: DOMRect[] = [];
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
        // point where neither side has room.
        if (k === 'earth' || k === 'pole') {
          const view = el.getBoundingClientRect();
          n.removeAttribute('data-side');
          if (n.getBoundingClientRect().right > view.right - 4) {
            n.setAttribute('data-side', 'left');
            if (n.getBoundingClientRect().left < view.left + 4) n.setAttribute('data-side', 'below');
          }
        }
        const b = n.getBoundingClientRect();
        if (meets(b, words) || meets(b, placed)) n.hidden = true;
        else placed.push(b);
      }
    };
    const tick = () => {
      const s = sceneRef.current!;
      const W = el.clientWidth || window.innerWidth, H = el.clientHeight || window.innerHeight, aspect = W / H;
      if (keyed.scene !== s || Math.abs(keyed.aspect - aspect) > 1e-3) {
        r.resize(W, H);
        input = pathInput(h, s, aspect);
        keys = flightKeys(input);
        keyed = { scene: s, aspect };
      }
      const p = progress.current, hour = hourAt(p, HERO_HOUR, reducedRef.current), pose = poseAt(keys, p, input!);
      // The pose first: the hour's light depends on how high the camera is.
      r.setPose(pose);
      r.setTime(hour);
      // The month's paths only once standing: in flight their faint bands would cross the Moon.
      r.setGuides(p > 3.8);
      r.render();
      if (sharp && r.resting) settle();
      if (drawn && !live) {
        live = true;
        liveRef.current();
      }
      words = [...document.querySelectorAll('[data-words]')].map((w) => w.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
      placed.length = 0;
      show('earth', p < 0.85 ? r.project(input!.earth, true) : null);
      show('pole', p < 2.6 ? r.project(polePoint(input!), true) : null);
      show('site', p > 1.6 && p < 3.8 ? r.project([0, input!.groundAt(0, 0), 0], true) : null);
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
      const point = (chip: HTMLElement | null, arrow: HTMLElement | null, v: THREE.Vector3 | null) => {
        if (!chip) return;
        chip.hidden = true;
        const len = v ? Math.hypot(v.x, v.y) : 0;
        if (!drawn || !v || len < 1e-6) return;
        // From the point the camera looks at, out towards the body to the edge, the chip kept whole: in from each
        // edge by half its own size and a little.
        chip.hidden = false;
        const mx = chip.offsetWidth / 2 + EDGE_IN_PX, my = chip.offsetHeight / 2 + EDGE_IN_PX;
        const ux = v.x / len, uy = -v.y / len, ax = W * (0.5 + pose.shift[0]), ay = H * (0.5 - pose.shift[1]);
        const tx = ux > 0 ? (W - mx - ax) / ux : ux < 0 ? (mx - ax) / ux : Infinity, ty = uy > 0 ? (H - my - ay) / uy : uy < 0 ? (my - ay) / uy : Infinity;
        const t = Math.max(0, Math.min(tx, ty));
        chip.style.left = `${((ax + ux * t) / W) * 100}%`;
        chip.style.top = `${((ay + uy * t) / H) * 100}%`;
        if (arrow) arrow.style.transform = `rotate(${Math.atan2(uy, ux)}rad)`;
        const b = chip.getBoundingClientRect();
        chip.hidden = meets(b, words) || meets(b, placed);
        if (!chip.hidden) placed.push(b);
      };
      const sunNow = seen(dirAzEl(h.series.sunAz[hi], h.series.sunEl[hi])), earthNow = seen(dirAzEl(h.series.earthAz[hi], h.series.earthEl[hi]));
      show('sun', p > 0.85 && sunNow.inView ? r.labels().sun : null);
      point(edgeRef.current, arrowRef.current, p > 0.85 && !sunNow.inView ? sunNow.v : null);
      point(earthEdgeRef.current, earthArrowRef.current, p > 3.8 && !earthNow.inView ? earthNow.v : null);
      const d = dateRef.current;
      if (d) {
        d.hidden = !(p > SWEEP.from && p < SWEEP.to);
        if (!d.hidden) {
          const day = dateLong(h.startUtc, Math.round(hour));
          // The month runs by in a few seconds: the chip says so, so the light going round reads as time passing.
          d.textContent = `${/\d{4}$/.test(day) ? day : `${day} ${h.startUtc.slice(0, 4)}`}: a month, sped up`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      el.removeEventListener('webglcontextlost', lost);
      r.dispose();
      rRef.current = null;
      if (capture) delete hook.__arrival;
    };
  }, [started, createRenderer, capture, h, progress]);

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Earth and the pole lie close together at the Moon's foot: their names stand beside them, to the right. */}
        {/* Earth is drawn small because it is far: the label says how far, and how big it is. */}
        <span ref={(n) => { tags.current.earth = n; }} hidden className={`${LABEL_BESIDE_EARTH} w-max max-w-[16rem] whitespace-normal text-[#74adff]`}>
          Earth, {(Math.round(h.earthKm[HERO_HOUR] / 1000) * 1000).toLocaleString('en-US')} km away: nearly four times as wide as the Moon
        </span>
        <span ref={(n) => { tags.current.pole = n; }} hidden className={LABEL_RIGHT}>
          <i aria-hidden="true" className={SIDE_DOT} />
          The Moon&apos;s south pole
        </span>
        <span ref={(n) => { tags.current.site = n; }} hidden className={`${LABEL} text-[#f6d48a]`}>
          <i aria-hidden="true" className={`${DOT} left-1/2 top-[130%]`} />
          {siteLabel(h.site)}
        </span>
        <span ref={(n) => { tags.current.sun = n; }} hidden className={`${LABEL} text-[#f6b646]`}>
          <i aria-hidden="true" className={`${DOT} left-1/2 top-[130%]`} />
          {skyLabel('sun', h.series, HERO_HOUR)}
        </span>
        <span ref={edgeRef} hidden data-sun-edge="" className={`${CHIP} -translate-x-1/2 -translate-y-1/2 text-[#f6b646]`}>
          Sun
          <b ref={arrowRef} aria-hidden="true" className="ml-1.5 inline-block">
            →
          </b>
        </span>
        <span ref={earthEdgeRef} hidden data-earth-edge="" className={`${CHIP} -translate-x-1/2 -translate-y-1/2 text-[#74adff]`}>
          {skyLabel('earth', h.series, HERO_HOUR)}
          <b ref={earthArrowRef} aria-hidden="true" className="ml-1.5 inline-block">
            →
          </b>
        </span>
        <p ref={dateRef} hidden className="absolute left-1/2 top-6 -translate-x-1/2 rounded-[5px] border border-white/15 bg-black/75 px-3 py-1 text-[16px] text-[#f6d48a]" />
      </div>
    </>
  );
}
