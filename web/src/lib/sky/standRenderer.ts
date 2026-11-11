import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GlobeAssets } from '../data/globe';
import type { SkyAssets } from '../data/sky';
import { R_MOON_M } from '../engine/constants';
import type { Series } from '../engine/metrics';
import type { Pose } from './arrivalPath';
import { earthAxes, earthLitFraction } from './earth';
import { dirAzEl, enuBasis, meToWorld, type Vec3 } from './frames';
import { buildGlobe, GLOBE } from './globe';
import { moonMatrixAt } from './moonOrientation';
import { EARTH_FRAG, EARTH_VERT, NIGHT, STAR_FRAG, STAR_VERT } from './shaders';
import { FramePacer, movingRatio, RatioPacer } from './framePacer';

import { cachedTexture, releaseCachedTextures } from './textureCache';
import { placeStars, starColour, starGain, starSize } from './stars';
import { LANDER } from './landerShape';
import { buildLander, landerDust } from './landerMesh';
import { buildGround, STAND_REACH_M } from './groundLevels';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { BOULDERS, boulderMeshes, pebbleMesh, placeBoulders, placePebbles, siteSeed, type Boulder } from './boulders';
import { heightAt, meshHeightAt, type TerrainField } from './terrainField';
import { standResident } from '../viz/standOpening';

export { toTextureHeights } from './groundLevels';

/** Everything the stand view draws for one site and period. `fast`: a lower pixel ratio, no drawn detail, coarser shadow steps. */
export interface StandScene {
  field: TerrainField;
  mask: { az0: number; step: number; el: ArrayLike<number> };
  series: Series;
  startUtc: string;
  site: { lat: number; lon: number };
  mastM: number;
  sky: SkyAssets;
  quality?: 'full' | 'fast';
  /**
   * A lander drawn beside the site for scale: its direction and distance from the eye, its power hour by
   * hour, the direction its lit face looks (default 70° left of the first hour's Sun) and where its antenna
   * points (default the first hour's Earth).
   */
  lander?: { azDeg: number; distM: number; powered: ArrayLike<number>; faceAzDeg?: number; earthAzDeg?: number; earthElDeg?: number };
  /** The whole Moon round the measured ground, for views from above (the home page's arrival); none in the stand view. */
  globe?: GlobeAssets;
  /** The site's ground above the Moon's reference sphere (m): the globe's centre lies the Moon's radius and this below the site. */
  siteHeightM?: number;
  /** Earth's distance (km) hour by hour, for its direction from a camera away from the site; 384,400 km when absent. */
  earthKm?: ArrayLike<number>;
  /** False for the sky and the globe alone, before the ground has loaded: no ground, skyline, rocks or lander. */
  ground?: boolean;
  /** The key moments' days, marked on the Sun's or Earth's path at their hours. */
  marks?: { hour: number; body: 'sun' | 'earth'; text: string }[];
  /** The resident (spec 20.2): a small creature behind you as the view opens, for a visitor who looks round; stand view only, never in flight. */
  resident?: boolean;
}

type Spot = { x: number; y: number; visible: boolean };
/** A path's name ("Sun's path this month"), at a place on its path, for a label. */
export type PathName = Spot & { body: 'sun' | 'earth'; text: string };
/**
 * How the labels are asked for: `above`, each path's name hangs over its line (the arrival), so it keeps off the
 * other path; `middle`, the share of the view's width the names gather towards (half way unless given: the arrival
 * gives the side its words leave free).
 */
export interface LabelOptions { above?: boolean; middle?: number }
/** A box on the screen, its sides as fractions of the view's width (left, right) and height (top, bottom). */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** How much brighter than its colour the lit power light shines: above white, so the bloom gives it a glow. */
const LAMP_GLOW = 2.5;
/**
 * Where the labels go, as fractions of the view's width and height (y is the label's foot); `parts` are the
 * lander's solar panel (its top), antenna dish and power light, named when the view is close.
 */
export interface SkyLabels {
  sun: Spot;
  earth: Spot;
  stars: (Spot & { name: string })[];
  lander: Spot | null;
  parts?: { panel: Spot; dish: Spot; lamp: Spot } | null;
  /**
   * Your own shadow while any of the Sun is up: a spot 15 m along it, its length along the real ground and
   * what it would be on level ground, in metres.
   */
  shadow?: (Spot & { lengthM: number; levelM: number }) | null;
  /** The key moments' days on the paths, while the guides show. */
  marks?: (Spot & { text: string })[];
  /** The Sun's path and Earth's named where they show, while the guides do. */
  pathNames?: PathName[];
  /** The box round the lander on the screen, which the other labels keep off; null while it is out of view. */
  landerBox?: ScreenBox | null;
  /** Where the level horizon's name goes: the left end of the first stretch of the line in view that clears the hills, 3° or more long; null when none does, or while the guides or the line are hidden. */
  level?: Spot | null;
  /** The top of the resident's shell (spec 20.2), so the page can tell when it stands well in view; never named, which would give it away. Null without one. */
  resident?: Spot | null;
}

const DEG = Math.PI / 180;
/** The sky sphere and the far skyline ring, metres from the eye. */
const RS = 300000, RING = 200000;
const SUN_D = 2 * RS * Math.tan(0.2665 * DEG), EARTH_R = RS * Math.tan(0.95 * DEG);

/**
 * The share of the Sun's light that the sunlit dust round a shadow scatters into it: 1.5 % with the Sun 8°
 * up or more, less as it sinks (with the sine of its height, so with how much sunlight the ground round
 * catches), and never under a third of that.
 */
export function bounceShare(sunElDeg: number): number {
  const k = Math.sin(Math.max(0, sunElDeg) * DEG) / Math.sin(8 * DEG);
  return 0.015 * Math.min(1, Math.max(0.3, k));
}

/**
 * How long your shadow is along the real ground, metres: the ray towards the Sun from the top of a person
 * `tallM` tall, traced out along the shadow until it meets the ground, which stands `riseAt(d)` metres
 * above your feet d metres out (0 on level ground: then 1.8 / tan of the Sun's height). 500 m at most.
 */
export function shadowOnGround(riseAt: (d: number) => number, sunElDeg: number, tallM = 1.8): number {
  const t = Math.tan(Math.max(0.2, sunElDeg) * DEG);
  for (let d = 0.25; d <= 500; d += 0.25) {
    const rise = riseAt(d);
    if (tallM - d * t <= rise) return Math.min(500, Math.hypot(d, rise));
  }
  return 500;
}

/**
 * The light that stands for eyes adapting to the dark, when neither the Sun nor Earth lights the scene: up
 * to 0.35, none while either does (the sunlit share counts once, Earth's light twice).
 */
const nightFloor = (sunFraction: number, earthshine: number) => 0.35 * Math.max(0, 1 - Math.min(1, sunFraction + 2 * earthshine));

/**
 * Within 10 m of the ground at the site the view counts as standing: the far skyline is the eye's own horizon, and
 * from higher up the near crests drop below it and would bare it as a band. The measured ground draws below 1600 km
 * over the site, the globe beyond (groundLevels.ts has the ground's reach). From 500 m up the eye's night light fades
 * out. From space the camera exposes for the sunlit Moon (a fixed gain) and shows the brighter stars faintly.
 */
const STANDING_M = 10, ALOFT_M = 500, MEASURED_M = 1600000, SPACE_GAIN = 1.8, SPACE_STARS = 0.7;

/** The Southern Cross's four stars (long bar Acrux to Gacrux, short bar Mimosa to Imai), when all are named. */
export function crossStars(names: { index: number; name: string }[] | undefined): [number, number, number, number] | null {
  const at = (n: string) => names?.find((x) => x.name === n)?.index;
  const [a, g, m, i] = [at('Acrux'), at('Gacrux'), at('Mimosa'), at('Imai')];
  return a === undefined || g === undefined || m === undefined || i === undefined ? null : [a, g, m, i];
}

/**
 * Where "Look up" turns: the middle of the Southern Cross in the site's sky at a time (degrees; the cross
 * stands about 50° up from the Moon's south pole all month), or null when its four stars are not all named.
 */
export function lookUpTarget(sky: SkyAssets, latDeg: number, lonDeg: number, utcMs: number): { az: number; el: number } | null {
  const idx = crossStars(sky.names);
  if (!idx) return null;
  const m = moonMatrixAt(sky.moon, utcMs), b = enuBasis(latDeg, lonDeg), j = sky.stars.j2000;
  const sum: Vec3 = [0, 0, 0];
  for (const k of idx) {
    const x = j[k * 3], y = j[k * 3 + 1], z = j[k * 3 + 2];
    const w = meToWorld(b, [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z]);
    const n = Math.hypot(w[0], w[1], w[2]) || 1;
    for (let i = 0; i < 3; i++) sum[i] += w[i] / n;
  }
  const n = Math.hypot(sum[0], sum[1], sum[2]) || 1;
  const d: Vec3 = [sum[0] / n, sum[1] / n, sum[2] / n];
  return { az: ((Math.atan2(d[0], -d[2]) / DEG) % 360 + 360) % 360, el: Math.asin(d[1]) / DEG };
}

const lerpAngle = (a: number, b: number, f: number) => (a + ((((b - a + 540) % 360) - 180) * f) + 360) % 360;

/** The series at a fractional hour, angles taken the short way round. */
function sampleSeries(s: Series, t: number) {
  const i = Math.min(s.hours - 1, Math.max(0, Math.floor(t))), j = Math.min(s.hours - 1, i + 1), f = Math.min(1, Math.max(0, t - i));
  const mix = (a: ArrayLike<number>) => a[i] + (a[j] - a[i]) * f;
  return { sunAz: lerpAngle(s.sunAz[i], s.sunAz[j], f), sunEl: mix(s.sunEl), earthAz: lerpAngle(s.earthAz[i], s.earthAz[j], f), earthEl: mix(s.earthEl), sunFraction: mix(s.sunFraction) };
}

/** A texture drawn on a 512-pixel canvas, or none outside a browser. */
function canvasTexture(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  if (!g) return null;
  draw(g);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const radial = (stops: [number, string][]) =>
  canvasTexture((g) => {
    const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    for (const [o, c] of stops) grd.addColorStop(o, c);
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  });

/**
 * Textures three keeps for the page's life and hands to the materials itself (its table for physically based shading,
 * the DFG LUT). Each renderer that uploads one listens to it, which would keep the renderer and its WebGL context
 * after it has gone, so a renderer gives them back as it goes, with the cached maps; the next one uploads them again.
 * Found through the renderer's own uniforms for each material, so before the materials are disposed.
 */
export function threesOwnTextures(root: THREE.Object3D, properties: { get(o: object): unknown }): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      const table = (properties.get(mat) as { uniforms?: { dfgLUT?: { value?: unknown } } }).uniforms?.dfgLUT?.value;
      if (table instanceof THREE.Texture) found.add(table);
    }
  });
  return [...found];
}

/** How high the eye stands over the drawn ground: the mast's height (2 m by default), never under a person's 1.5 m. */
export const eyeHeightM = (mastM: number) => Math.max(1.5, mastM);
/** Where the eye is: over the drawn ground at the site, so the mesh never stands above it. */
export const eyeAt = (scene: Pick<StandScene, 'field' | 'mastM'>) => meshHeightAt(scene.field, 0, 0) + eyeHeightM(scene.mastM);

/**
 * The resident (spec 20.2) in its own frame: its soles on the ground at y = 0 and its head towards +z. A shell 0.34 m
 * wide, 0.26 m tall and 0.42 m long (SHELL, half of each, as a boulder's stone is fitted to a box 2 across), its middle
 * SHELL_Y up; four stubby legs, LEG_X either side of the middle and LEG_Z before and behind it, LEG_R thick and reaching
 * up into the shell; a small head (HEAD, half its width, height and length) pushed out of the shell's front at HEAD_AT;
 * and two dark eye dots on its face, EYE_R across, at EYE either side. Its feet sink BED_M into the dust. The body's
 * colours are multiplied by the rocks' grey: a little darker and warmer than the shell on the whole, the eyes nearly black.
 */
const RESIDENT = {
  SHELL: [0.17, 0.13, 0.21],
  SHELL_Y: 0.18,
  LEG_X: 0.1,
  LEG_Z: 0.11,
  LEG_R: 0.035,
  LEG_TOP: 0.17,
  HEAD: [0.05, 0.045, 0.06],
  HEAD_AT: [0, 0.15, 0.21],
  EYE_R: 0.012,
  EYE: [0.025, 0.165, 0.258],
  BED_M: 0.015,
  BODY_RGB: [0.95, 0.92, 0.88],
  EYE_RGB: [0.08, 0.08, 0.08],
} as const;
/**
 * The resident's shadow on the ground: one more sphere in the rocks' uniform, data for the loop the ground's shader
 * already runs, not code. The first thing to drop (set false) if the laptop's frame probe moves with the resident in.
 */
export const RESIDENT_SHADOW = true;

/**
 * The resident's body as one mesh: its head, four legs and two eyes, 260 triangles, with the rocks' own attributes and
 * nothing more (a position, a normal and a colour of three; no uv, tangent or morph), so drawn in a boulder's material it
 * takes the program three already built for the boulders. The legs are open at both ends: their soles are in the dust and
 * their tops inside the shell.
 */
function residentBody(): THREE.BufferGeometry {
  const { HEAD, HEAD_AT, EYE, EYE_R, LEG_X, LEG_Z, LEG_R, LEG_TOP, BODY_RGB, EYE_RGB } = RESIDENT;
  const part = (geo: THREE.BufferGeometry, at: THREE.Matrix4, rgb: readonly number[]) => {
    geo.applyMatrix4(at);
    geo.deleteAttribute('uv');
    const n = geo.getAttribute('position').count;
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 3 * n }, (_, i) => rgb[i % 3]), 3));
    return geo;
  };
  const parts = [
    part(new THREE.SphereGeometry(1, 10, 8), new THREE.Matrix4().makeScale(HEAD[0], HEAD[1], HEAD[2]).setPosition(HEAD_AT[0], HEAD_AT[1], HEAD_AT[2]), BODY_RGB),
    ...[-1, 1].map((side) => part(new THREE.SphereGeometry(EYE_R, 6, 4), new THREE.Matrix4().makeTranslation(side * EYE[0], EYE[1], EYE[2]), EYE_RGB)),
    ...[-1, 1].flatMap((across) => [-1, 1].map((along) => part(new THREE.CylinderGeometry(LEG_R, 1.15 * LEG_R, LEG_TOP, 6, 1, true), new THREE.Matrix4().makeTranslation(across * LEG_X, LEG_TOP / 2, along * LEG_Z), BODY_RGB))),
  ];
  const body = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return body;
}

/**
 * The resident's meshes, placed (spec 20.2). Its shell is one of the boulders' own stones (`stones`, whose radii are
 * `radii`), a rounded lump where there is one, else the smallest, drawn with that stone's geometry and material, so
 * nothing is uploaded for it; its body (residentBody) is drawn in the same material. It stands at `at` facing the eye,
 * turned to the plane through the drawn ground under its four feet, so on a slope no foot floats or sinks deeper than
 * the rest. With the shell's top, where the view looks for it, and the sphere that stands for it in the ground's
 * shadows as a boulder's does: over its middle, its top at the shell's highest point, three quarters of its half-width wide.
 */
function residentMeshes(stones: THREE.Mesh[], radii: number[], at: { x: number; z: number }, field: TerrainField) {
  const src = stones.find((m) => m.name === 'rock-lump') ?? stones[radii.indexOf(Math.min(...radii))];
  if (!src) return null;
  const { SHELL, SHELL_Y, LEG_X, LEG_Z, BED_M } = RESIDENT;
  const shell = new THREE.Mesh(src.geometry, src.material);
  shell.scale.set(SHELL[0], SHELL[1], SHELL[2]);
  shell.position.y = SHELL_Y;
  const group = new THREE.Group();
  group.add(shell, new THREE.Mesh(residentBody(), src.material));
  // Its head towards the eye; the drawn ground under each foot, the feet turned with it, before and behind, either side.
  const yaw = Math.atan2(-at.x, -at.z), c = Math.cos(yaw), s = Math.sin(yaw);
  const under = (x: number, z: number) => meshHeightAt(field, at.x + x * c + z * s, at.z - x * s + z * c);
  const h = [under(-LEG_X, -LEG_Z), under(LEG_X, -LEG_Z), under(-LEG_X, LEG_Z), under(LEG_X, LEG_Z)];
  // The plane through them: how fast it rises across it (towards +x) and along it (towards its head), metres a metre.
  const across = (h[1] + h[3] - h[0] - h[2]) / (4 * LEG_X), along = (h[2] + h[3] - h[0] - h[1]) / (4 * LEG_Z);
  const up = new THREE.Vector3(0, 1, 0);
  group.quaternion.setFromAxisAngle(up, yaw).multiply(new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(-across, 1, -along).normalize()));
  group.position.set(at.x, (h[0] + h[1] + h[2] + h[3]) / 4 - BED_M, at.z);
  group.updateMatrixWorld(true);
  const pos = shell.geometry.getAttribute('position'), v = new THREE.Vector3(), mid = shell.getWorldPosition(new THREE.Vector3());
  let top = -Infinity;
  for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(shell.matrixWorld).y);
  const w = 0.75 * SHELL[0];
  return { group, top: new THREE.Vector3(mid.x, top, mid.z), sphere: new THREE.Vector4(mid.x, top - w, mid.z, w) };
}

/**
 * The scene for a site and period, without WebGL: the measured ground, the far skyline, the stars, the
 * Sun and Earth, and the camera. `update(hour)` moves the bodies and sets the light for a fractional hour;
 * `setView` turns the camera; `labels` says where the labels go.
 */
export function buildScene(scene: StandScene, opts: { halfFloat?: boolean } = {}) {
  const root = new THREE.Scene();
  root.background = new THREE.Color(0x000000);
  const fast = scene.quality === 'fast';
  const basis = enuBasis(scene.site.lat, scene.site.lon);
  const eye = eyeAt(scene);
  // Views from above (the home page's arrival): the globe round the measured ground, the camera anywhere.
  const hasGround = scene.ground !== false, flight = !!scene.globe, siteH = scene.siteHeightM ?? 0;
  const moonC = new THREE.Vector3(0, -(R_MOON_M + siteH), 0);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, flight ? 1e10 : 700000);
  camera.position.set(0, eye, 0);

  // The measured ground: up to three levels as height textures (for the shadows) and meshes (to see), and in flight the
  // cap's coarser ring beyond them (groundLevels.ts). None until the ground has loaded: the sky and the globe alone.
  const { meshes: ground, cap, capRing } = hasGround ? buildGround(scene.field, { fast, flight, halfFloat: opts.halfFloat ?? false, viewerY: meshHeightAt(scene.field, 0, 0) }) : { meshes: [] as THREE.Mesh[], cap: null, capRing: null };
  ground.forEach((g) => root.add(g));

  // The skyline beyond the measured ground: the site's horizon as a dark ring.
  const n = scene.mask.el.length;
  const maskAt = (az: number) => Number(scene.mask.el[Math.round(((((az - scene.mask.az0) % 360) + 360) % 360) / scene.mask.step) % n]);
  const ringPos = new Float32Array((n + 1) * 6), ringCol = new Float32Array((n + 1) * 6), ringIdx: number[] = [];
  const drop = (RING * RING) / (2 * R_MOON_M);
  for (let i = 0; i <= n; i++) {
    const az = (scene.mask.az0 + (i % n) * scene.mask.step) * DEG, el = Number(scene.mask.el[i % n]) * DEG;
    const x = RING * Math.sin(az), z = -RING * Math.cos(az);
    ringPos.set([x, eye + RING * Math.tan(el), z, x, eye - drop - 6000, z], i * 6);
    ringCol.set([0.035, 0.034, 0.032, 0.01, 0.01, 0.01], i * 6);
    if (i < n) ringIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }
  const ringGeo = new THREE.BufferGeometry();
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
  ringGeo.setAttribute('color', new THREE.BufferAttribute(ringCol, 3));
  ringGeo.setIndex(ringIdx);
  const skyline = hasGround ? new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })) : null;
  if (skyline) root.add(skyline);
  else ringGeo.dispose();

  // The sky travels with the camera: the stars, the Sun and Earth sit in one group round it (at the eye in the
  // stand view), at their true angular sizes.
  const skyGroup = new THREE.Group();
  skyGroup.position.set(0, eye, 0);
  root.add(skyGroup);

  // The stars: the catalogue in its colours, placed for the hour.
  const st = scene.sky.stars;
  const starPos = new Float32Array(st.count * 3), starCol = new Float32Array(st.count * 3), size = new Float32Array(st.count);
  for (let i = 0; i < st.count; i++) {
    const col = starColour(st.bv[i]), g = starGain(st.vmag[i]);
    starCol.set([col[0] * g, col[1] * g, col[2] * g], i * 3);
    size[i] = starSize(st.vmag[i]);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const starMat = new THREE.ShaderMaterial({ uniforms: { uGain: { value: 1 }, uPx: { value: 1 } }, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  skyGroup.add(stars);
  // The Southern Cross: two faint lines between its four stars.
  const crossIdx = crossStars(scene.sky.names);
  const crossPos = new Float32Array(12);
  const cross = crossIdx
    ? new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(crossPos, 3)),
        new THREE.LineBasicMaterial({ color: 0x8090b0, transparent: true, opacity: 0.55, depthWrite: false }),
      )
    : null;
  if (cross) {
    cross.frustumCulled = false;
    skyGroup.add(cross);
  }

  // The Sun: white, small and hard, with only a small glow close round the disc: with no air there is no
  // halo across the sky and no starburst, only what a lens adds right at the disc.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, '#fff'], [0.46, '#fff'], [0.5, 'rgba(255,255,255,0)']]), color: new THREE.Color(14, 14, 13.5), transparent: true, depthWrite: false, toneMapped: false }));
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,255,255,0.6)'], [0.06, 'rgba(240,244,255,0.22)'], [0.22, 'rgba(225,232,255,0.06)'], [0.6, 'rgba(220,230,255,0.014)'], [1, 'rgba(0,0,0,0)']]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  // The disc at its true size (it fills 92 % of its sprite), so Earth beside it is plainly four times wider.
  sun.scale.setScalar(SUN_D / 0.92);
  // A faint lens glare round it, so it reads as the Sun with no label; its bright core stays at the disc.
  glare.scale.setScalar(SUN_D * 8);
  skyGroup.add(sun, glare);

  // Earth: NASA's Blue Marble and clouds, 1.9° wide, lit by the Sun and turned for the hour.
  const earthMat = new THREE.ShaderMaterial({ uniforms: { uDay: { value: null }, uClouds: { value: null }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uMaps: { value: 0 } }, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  if (typeof document !== 'undefined') {
    // Kept for the page's life, so a scene rebuilt as the ground arrives shows Earth's face at once.
    const day = cachedTexture(scene.sky.earthDayUrl, true), clouds = cachedTexture(scene.sky.earthCloudsUrl, false);
    earthMat.uniforms.uDay.value = day.texture;
    earthMat.uniforms.uClouds.value = clouds.texture;
    void Promise.all([day.ready, clouds.ready]).then(() => { earthMat.uniforms.uMaps.value = 1; }, () => {});
  }
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 48), earthMat);
  earth.matrixAutoUpdate = false;
  skyGroup.add(earth);

  // The guides (hidden with the words): the month's paths of the Sun and Earth, solid where they clear the
  // skyline, faint where the hills hide them and not at all where they run under the ground; the level horizon,
  // faint, where it clears the hills; and a ring where a hidden Sun or Earth sits, on the hill that hides it.
  const guides = new THREE.Group();
  skyGroup.add(guides);
  const RG = RS * 0.98;
  /** Scales the sky group round the camera: in flight it stands beyond the far side of the Moon, the guides with it. */
  const skyScale = (k: number) => skyGroup.scale.setScalar(k);
  /**
   * A band 0.15 degrees tall along directions on the sky, as a mesh: WebGL draws lines a pixel thin. A solid
   * band tests depth, so the far skyline hides it where the hills do. A faint one, like the rings, does not: it
   * shows through the slope a few metres uphill and the far hills alike, so the labels that name it always point
   * at a line; the lander, drawn after the guides (ORDER), covers them. Along a path, `floor`
   * is each hour's lowest open sky (degrees): the level horizon, or the skyline where it dips below level, as it
   * can from a high point. Below it the path runs under the ground, not behind a hill, and draws nothing: an
   * hour's piece whose two ends both lie there, and a triangle wholly there (where the path goes down through it),
   * are left as points, so every hour keeps its six indices and a range of hours stays a range of indices. With
   * `dash` (hours), the band is drawn in dashes that long with gaps as long, as the chart below dots a hidden Sun:
   * the faint band, which alone shows where the hills hide a path. `depth`, true by default for a solid band only,
   * tests a band against what is drawn before it: the level horizon is faint but tested, so the hills hide it (16.3).
   */
  const band = (dirs: Vec3[], colour: number, faint: boolean, opacity: number, floor?: number[], dash = 0, depth = !faint) => {
    const n = dirs.length, pos = new Float32Array(n * 6), idx: number[] = [], half = RG * Math.tan(0.075 * DEG);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(...dirs[i]).normalize(), up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize(), c = d.clone().multiplyScalar(RG);
      pos.set([c.x + up.x * half, c.y + up.y * half, c.z + up.z * half, c.x - up.x * half, c.y - up.y * half, c.z - up.z * half], i * 6);
    }
    // Heights as sines: a corner k belongs to the hour k / 2.
    const low = floor?.map((f) => Math.sin(f * DEG));
    const under = (k: number) => !!low && pos[k * 3 + 1] / RG < low[k >> 1];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, gone = (!!low && dirs[i][1] < low[i] && dirs[i + 1][1] < low[i + 1]) || (dash > 0 && Math.floor(i / dash) % 2 === 1);
      for (const t of [[a, a + 1, a + 2], [a + 2, a + 1, a + 3]]) idx.push(...(gone || t.every(under) ? [a, a, a] : t));
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, ...BLENDED, opacity, depthWrite: false, depthTest: depth, side: THREE.DoubleSide, toneMapped: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = faint ? ORDER.FAINT : ORDER.SOLID;
    guides.add(mesh);
    return mesh;
  };
  const along = (az: ArrayLike<number>, el: ArrayLike<number>) => Array.from({ length: scene.series.hours }, (_, h) => dirAzEl(az[h], el[h]));
  const sunDirs = along(scene.series.sunAz, scene.series.sunEl), earthDirs = along(scene.series.earthAz, scene.series.earthEl);
  // Each hour's lowest open sky along a path: below the level horizon only where the skyline dips under it.
  const floorAlong = (az: ArrayLike<number>) => Array.from({ length: scene.series.hours }, (_, h) => Math.min(0, maskAt(az[h])));
  const sunFloor = floorAlong(scene.series.sunAz), earthFloor = floorAlong(scene.series.earthAz);
  // Where the hills hide them the paths show dotted (the faint bands, in dashes about a degree long: two hours of the
  // Sun's path, sixteen of Earth's slower one).
  const paths = [band(sunDirs, 0xf6b646, false, 0.9, sunFloor), band(sunDirs, 0xf6b646, true, 0.3, sunFloor, 2), band(earthDirs, 0x74adff, false, 0.9, earthFloor), band(earthDirs, 0x74adff, true, 0.3, earthFloor, 16)];
  const levelBand = band(Array.from({ length: 361 }, (_, k) => dirAzEl(k, 0)), 0xffffff, true, 0.18, undefined, 0, true);
  /**
   * Each path for one synodic month round the hour, centred on it where the period allows: 709 hours, the first
   * and the last 708 apart, under the 708.7 from one new Moon to the next. Over a longer period a path comes
   * round on itself a little higher or lower and reads as two lines. A period of a month or less is drawn whole.
   */
  const MONTH_H = 709;
  /**
   * The month's two ends meet at nearly the same azimuth, a little higher or lower: each path fades out over the
   * first and the last day of the stretch drawn, so they read as neither a break nor a step. One alpha for each
   * corner, shared by the four bands (whose colours stay their materials'), set again as the stretch moves.
   */
  const FADE_H = 24;
  const fade = new THREE.BufferAttribute(new Float32Array(scene.series.hours * 8).fill(1), 4);
  for (const p of paths) {
    p.geometry.setAttribute('color', fade);
    (p.material as THREE.MeshBasicMaterial).vertexColors = true;
  }
  // The hours of the stretch drawn, first and last: a moment's chip shows only on it.
  let drawnFrom = 0, drawnTo = scene.series.hours - 1, fadedFrom = -1;
  const pathWindow = (t: number) => {
    const from = Math.min(Math.max(0, Math.round(t) - (MONTH_H - 1) / 2), Math.max(0, scene.series.hours - MONTH_H));
    for (const p of paths) p.geometry.setDrawRange(from * 6, (Math.min(MONTH_H, scene.series.hours) - 1) * 6);
    drawnFrom = from;
    drawnTo = from + Math.min(MONTH_H, scene.series.hours) - 1;
    if (from === fadedFrom) return;
    for (let h = 0; h < scene.series.hours; h++) {
      const a = Math.min(1, Math.max(0, Math.min(h - drawnFrom, drawnTo - h) / FADE_H));
      fade.setW(2 * h, a);
      fade.setW(2 * h + 1, a);
    }
    fade.needsUpdate = true;
    fadedFrom = from;
  };
  // The rings on hidden bodies go with the labels that name those bodies, not with the guides (16.2).
  const rings = new THREE.Group();
  skyGroup.add(rings);
  const ring = (colour: number, degrees: number) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: canvasTexture((g) => {
          g.strokeStyle = '#fff';
          g.lineWidth = 36;
          g.beginPath();
          g.arc(256, 256, 200, 0, 2 * Math.PI);
          g.stroke();
        }),
        color: colour,
        ...BLENDED,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.85,
      }),
    );
    s.scale.setScalar(2 * RG * Math.tan((degrees * DEG) / 2));
    s.visible = false;
    s.renderOrder = ORDER.RINGS;
    rings.add(s);
    return s;
  };
  const markers = { sun: ring(0xf6b646, 1.6), earth: ring(0x74adff, 2.8) };

  // The whole Moon round the measured ground, for views from above.
  const globe = scene.globe ? buildGlobe({ basis, siteHeightM: siteH, assets: scene.globe, halfFloat: opts.halfFloat ?? false, cutM: hasGround ? GLOBE.CUT_M : 0 }) : null;
  if (globe) root.add(globe.mesh);

  // A lander beside the site, for scale: gold foil body, solar panel, legs, an antenna and a light that shows its power.
  const ls = scene.lander;
  const lander = ls && hasGround
    ? buildLander(ls.azDeg, ls.distM, ls.faceAzDeg ?? (scene.series.sunAz[0] - 70 + 360) % 360, ls.earthAzDeg ?? scene.series.earthAz[0], ls.earthElDeg ?? scene.series.earthEl[0])
    : null;
  // Drawn after the guides (ORDER), so it covers the paths and the rings that show through the ground behind it, and
  // the level horizon; solid, and tested and written in depth, so the hills still hide it and its parts hide each other.
  lander?.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.renderOrder = ORDER.LANDER;
  });
  const landerBox = new THREE.Box3();
  // The Sun; the sunlit dust's light from below, which fills the lander's shaded sides (as in the Apollo
  // photographs); and Earth's faint blue light.
  const sunLight = new THREE.DirectionalLight(0xffffff, 0), skyLight = new THREE.HemisphereLight(0x0a0a0c, 0x8a857c, 0), earthLight = new THREE.AmbientLight(0x8aa7ff, 0);
  // A neutral fill: faint by day, and at night the light that stands for eyes adapting to the dark (grey, not Earth's
  // blue, which comes only with Earth), from the sky above and next to none from the ground below (NIGHT.SKY), so the
  // rocks' and the lander's tops are lighter than their sides, as the ground is lit (17.5).
  const fillLight = new THREE.HemisphereLight(0xc4c6ca, 0x060607, 0);
  // A faint key light at night, from 50° up and 90° round from the Sun's place, a third of the fill's share of the sky
  // (NIGHT.KEY against NIGHT.SKY): under the hemisphere alone every side of a stone took the same light and a near one
  // read as a loaf; the key gives the stones' facets and the lander's edges a lit side and a shaded one (18.4). Off
  // by day, when the Sun does that. The measured ground takes no light from it: its shader lights itself.
  const keyLight = new THREE.DirectionalLight(0xc4c6ca, 0);
  root.add(sunLight, sunLight.target, skyLight, earthLight, fillLight, keyLight, keyLight.target);
  // In flight (the home page's arrival) the camera is no one standing at the site: no person's shadow at its feet.
  if (flight) for (const g of ground) (g.material as THREE.ShaderMaterial).uniforms.uViewer.value.set(1e9, 0, 1e9);
  if (lander) {
    const lx = lander.group.position.x, lz = lander.group.position.z, ly = meshHeightAt(scene.field, lx, lz);
    lander.group.position.y = ly;
    root.add(lander.group);
    sunLight.target.position.set(lx, ly + 1.5, lz);
    lander.group.updateMatrixWorld(true);
    landerBox.setFromObject(lander.group);
    const yaw = lander.group.rotation.y;
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uLanderOn.value = 1;
      u.uLanderCenter.value.set(lx, ly, lz);
      u.uLanderCS.value.set(Math.cos(yaw), Math.sin(yaw));
    }
  }

  // Boulders round the eye, kept clear of the lander, with their shadows on the ground.
  const seed = siteSeed(scene.site.lat, scene.site.lon);
  const placed: Boulder[] = hasGround ? placeBoulders(seed, lander ? { x: lander.group.position.x, z: lander.group.position.z } : null) : [];
  const rocks = hasGround ? boulderMeshes(placed, (x, z) => meshHeightAt(scene.field, x, z), seed) : { group: new THREE.Group(), spheres: [] as THREE.Vector4[] };
  root.add(rocks.group);
  // Pebbles: the near ground's grit, shapes the low Sun catches.
  const pebbles = hasGround ? pebbleMesh(placePebbles(seed, lander ? { x: lander.group.position.x, z: lander.group.position.z } : null), (x, z) => meshHeightAt(scene.field, x, z), seed) : null;
  if (pebbles) root.add(pebbles);
  // The resident (spec 20.2): a small creature with a rock for a back, behind you as the view opens, to be found by
  // turning round; in the stand view only, with its ground and its lander (the arrival, in flight, never has it). Its
  // shell is a boulder's own stone and its body 260 triangles in that stone's material: two draw calls, culled when off
  // screen, no new program to compile, no light, no pass, and no work in the frame but the one projection for its spot.
  const resident = scene.resident && hasGround && !flight && lander ? residentMeshes(rocks.group.children as THREE.Mesh[], placed.map((b) => b.r), standResident(ls!, placed, seed), scene.field) : null;
  if (resident) root.add(resident.group);
  // Its shadow is one sphere more in the rocks' uniform (RESIDENT_SHADOW), while there is room for it.
  const spheres = resident && RESIDENT_SHADOW && rocks.spheres.length < BOULDERS.MAX ? [...rocks.spheres, resident.sphere] : rocks.spheres;
  for (const g of ground) {
    const u = (g.material as THREE.ShaderMaterial).uniforms;
    spheres.forEach((v, i) => (u.uRocks.value as THREE.Vector4[])[i].copy(v));
    u.uRockCount.value = spheres.length;
  }

  const startMs = Date.parse(scene.startUtc + 'Z');
  // A camera's exposure: by day it is set for the sunlit ground, so only the brightest stars show, and they
  // come out as the view looks up, away from the dazzling ground.
  let sunNow = 0, sunElNow = 0, pitchNow = 0;
  // How far the camera is into space: 0 below 30 km over the site, 1 from 600 km.
  let spaceNow = 0;
  // Your shadow's length along the ground, kept until the Sun moves.
  let shadowKey = '', shadowLen = 0;
  const viewDir = new THREE.Vector3(0, 0, -1);
  const skyward = () => {
    const up = Math.min(1, Math.max(0, (pitchNow - 15) / 20));
    return up * up * (3 - 2 * up);
  };
  const expose = () => {
    // By day, none: a camera set for the sunlit ground does not catch them (as the captions say).
    const day = 1.6 - 1.6 * sunNow;
    const ground = day + (1.6 - day) * skyward();
    // From space the brighter stars show faintly round the sunlit Moon.
    starMat.uniforms.uGain.value = ground + (SPACE_STARS - ground) * spaceNow;
  };
  // How much the regolith in the middle of the view sends back towards the eye, as the ground shader lights
  // it (phase and opposition surge), for the angle between the ways to the eye and to the Sun.
  const regolithBack = (alpha: number) => Math.exp(-0.82 * alpha) * (1 + 0.45 / (1 + Math.tan(alpha / 2) / 0.055));
  /**
   * The camera's exposure against its setting (1): looking down-Sun at sunlit ground, which shines back
   * towards the Sun several times as brightly as it does across the light, it stops down, as a camera on
   * automatic would, to about a third at most; not towards the Sun, not while the sky fills the view, and not
   * at night. From space it exposes for the sunlit Moon instead, a fixed gain, as it climbs away.
   */
  function exposure(): number {
    const stand = standExposure();
    return stand + (SPACE_GAIN - stand) * spaceNow;
  }
  function standExposure(): number {
    if (sunNow <= 0) return 1;
    const alpha = Math.acos(Math.min(1, Math.max(-1, -viewDir.dot(sunDir))));
    const g = Math.min(1, Math.max(0.35, Math.pow(regolithBack((120 * Math.PI) / 180) / regolithBack(alpha), 0.6)));
    const ground = 1 + (g - 1) * (1 - skyward()) * Math.min(1, sunNow);
    // With the Sun itself in the frame the camera stops down for it, so the ground before it is backlit.
    const at = tmp.copy(sunDir).multiplyScalar(1000).add(camera.position).project(camera);
    const inFrame = at.z < 1 && Math.abs(at.x) <= 1 && Math.abs(at.y) <= 1;
    // The more so the nearer the middle it stands: near an edge the glare is in a corner.
    const off = Math.min(1, Math.hypot(at.x, at.y));
    return Math.min(ground, inFrame ? 1 - 0.4 * Math.min(1, sunNow) * (1 - off) : 1);
  }
  const sunDir = new THREE.Vector3(), earthPos = new THREE.Vector3();
  // Earth from wherever the camera is: its direction from the site at the hour and its distance say where it is.
  const eyeW = new THREE.Vector3(0, eye, 0), earthDir = new THREE.Vector3(), earthLocal = new THREE.Vector3();
  let earthDistM = 384400e3;
  let axes: { x: Vec3; y: Vec3; z: Vec3 } = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  function placeEarth() {
    earthLocal.copy(eyeW).addScaledVector(earthDir, earthDistM).sub(camera.position).normalize().multiplyScalar(RS);
    earth.matrix.makeBasis(new THREE.Vector3(...axes.x), new THREE.Vector3(...axes.y), new THREE.Vector3(...axes.z)).setPosition(earthLocal);
    earth.matrixWorldNeedsUpdate = true;
    earthPos.copy(earthLocal).multiplyScalar(skyGroup.scale.x).add(skyGroup.position);
  }
  /** A place in the sky group (round the camera) in the world frame. */
  const skyWorld = (local: THREE.Vector3) => local.clone().multiplyScalar(skyGroup.scale.x).add(skyGroup.position);
  // The hour's light, kept so a change of height can set it again; and how far the camera has risen from the
  // eye (0 standing, 1 from 5 km up).
  let lightNow = { sunFraction: 1, full: 0, earthUp: false }, aloftNow = 0;
  /**
   * Earthlight on the ground, and at night the light that stands for eyes adapting to the dark: when the Sun
   * is hidden the view is exposed like a long photograph, so Earthlight shows and the shapes do. That is the
   * eye's way of seeing: from above, the ground gets only the light that is there.
   */
  // The light the sunlit dust round the eye scatters into the shadows: none once aloft, where the ground below is
  // not all round the eye and the night side far off would glow with it.
  let bounceNow = 0;
  function applyLight() {
    const { sunFraction, full, earthUp } = lightNow, eyeOnly = 1 - aloftNow;
    // Standing, Earth lights the ground only while it is up at the site (brightened at night like a long
    // exposure); from the air each slope takes its light as it faces Earth, Earth up over it or not, so the
    // night side reads faintly as ground. The globe gets the same, by the same rule.
    const earthshine = earthUp ? 0.25 * full * (1 + 3 * (1 - sunFraction) * eyeOnly) : 0.25 * full * aloftNow;
    const night = nightFloor(sunFraction, earthshine) * eyeOnly;
    if (globe) globe.material.uniforms.uEarthshine.value = 0.25 * full;
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uEarthshine.value = earthshine;
      u.uNight.value = night;
      u.uBounce.value = bounceNow * eyeOnly;
    }
    // Earth's blue light only while Earth is up; the neutral fill, faint by day, and at night enough for the
    // shapes to show when neither the Sun nor Earth lights them (the ground gets the same).
    earthLight.intensity = 0.5 * earthshine;
    // NIGHT.SKY times as strong as the flat fill was: a top faces all of the sky, an upright side half of it.
    fillLight.intensity = 0.03 + NIGHT.SKY * night;
    keyLight.intensity = NIGHT.KEY * night;
  }
  function update(t: number) {
    const v = sampleSeries(scene.series, t);
    const sd = dirAzEl(v.sunAz, v.sunEl), ed = dirAzEl(v.earthAz, v.earthEl);
    sunDir.set(...sd);
    // The night's key light stands 90° round from the Sun's azimuth, 50° up, aimed at the site (18.4).
    const kd = dirAzEl(v.sunAz + 90, 50);
    keyLight.position.set(kd[0] * 100, kd[1] * 100, kd[2] * 100);
    sun.position.set(sd[0] * RS, sd[1] * RS, sd[2] * RS);
    glare.position.copy(sun.position);
    // The month of each path round the hour; a ring where a hidden Sun or Earth sits, on the hill that hides it.
    pathWindow(t);
    const hi = Math.min(scene.series.hours - 1, Math.max(0, Math.round(t)));
    markers.sun.visible = v.sunFraction === 0;
    markers.sun.position.set(sd[0] * RG, sd[1] * RG, sd[2] * RG);
    markers.earth.visible = Number(scene.series.earthVisible[hi]) === 0;
    markers.earth.position.set(ed[0] * RG, ed[1] * RG, ed[2] * RG);
    // The glare comes from the part of the disc the hills leave in view.
    (glare.material as THREE.SpriteMaterial).opacity = v.sunFraction;
    const when = startMs + t * 3600e3;
    const m = moonMatrixAt(scene.sky.moon, when);
    placeStars(st, m, basis, RS, starPos);
    starGeo.getAttribute('position').needsUpdate = true;
    if (cross && crossIdx) {
      crossIdx.forEach((k, j) => crossPos.set(starPos.subarray(k * 3, k * 3 + 3), j * 3));
      cross.geometry.getAttribute('position').needsUpdate = true;
    }
    axes = earthAxes(m, basis, when);
    earthDir.set(...ed);
    earthDistM = 1000 * Number(scene.earthKm?.[Math.min(scene.series.hours - 1, Math.max(0, Math.round(t)))] ?? 384400);
    placeEarth();
    earthMat.uniforms.uSun.value.set(...sd);
    const full = earthLitFraction(sd as Vec3, ed as Vec3);
    globe?.setLight(sd, ed, full);
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uSun.value.set(...sd);
      u.uEarth.value.set(...ed);
      u.uSunUp.value = v.sunFraction;
    }
    bounceNow = bounceShare(v.sunEl);
    lightNow = { sunFraction: v.sunFraction, full, earthUp: v.earthEl > -0.5 };
    applyLight();
    // The lights for the lander and the boulders.
    sunLight.position.copy(sunLight.target.position).addScaledVector(sunDir, 50);
    sunLight.intensity = 3.2 * v.sunFraction;
    // The dust lights the shaded sides only faintly at a Sun this low: they stand nearly in silhouette.
    skyLight.intensity = 0.08 * v.sunFraction;
    if (lander) {
      const h = Math.min(scene.series.hours - 1, Math.max(0, Math.round(t)));
      // Lit green with power; off, a dark bead that still shows where the light is.
      if (Number(scene.lander!.powered[h]) === 1) lander.lamp.color.setHex(0x46c98b).multiplyScalar(LAMP_GLOW);
      else lander.lamp.color.setHex(0x2b2e2c);
      // The sunlit dust below fills its shaded sides by day (LANDER_LIGHT.DUST); at night the dust is not lit.
      lander.dust.value = landerDust(v.sunFraction);
    }
    sunNow = v.sunFraction;
    sunElNow = v.sunEl;
    expose();
    // What the lander's foil and metal mirror (the sunlit dust below) dims with the Sun.
    // Little: at a Sun this low the dust round is dim, and the foil's shaded side must stay dark.
    root.environmentIntensity = 0.06 + 0.12 * v.sunFraction;
  }

  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), ray = new THREE.Ray(), hit = new THREE.Vector3();
  /** Whether the lander stands between the eye and a world point. */
  const behindLander = (world: THREE.Vector3) => {
    if (!lander) return false;
    ray.set(camera.position, tmp.copy(world).sub(camera.position).normalize());
    return ray.intersectBox(landerBox, hit) !== null && hit.distanceTo(camera.position) < world.distanceTo(camera.position);
  };
  /** The stand view: the camera at the eye, turned to a yaw and pitch, the sky round it at its own size. */
  function setView(yawDeg: number, pitchDeg: number, fovDeg: number, aspect: number) {
    camera.position.set(0, eye, 0);
    camera.clearViewOffset();
    camera.far = flight ? 1e10 : 700000;
    skyGroup.position.set(0, eye, 0);
    skyScale(1);
    placeEarth();
    standing(true);
    measured(true);
    ringShadows(true);
    spaceNow = 0;
    if (aloftNow !== 0) {
      aloftNow = 0;
      applyLight();
    }
    pitchNow = pitchDeg;
    expose();
    camera.fov = fovDeg;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const d = dirAzEl(yawDeg, pitchDeg);
    viewDir.set(d[0], d[1], d[2]).normalize();
    camera.lookAt(d[0], eye + d[1], d[2]);
    camera.updateMatrixWorld();
  }
  /** A view from anywhere (the home page's arrival): the camera at the pose, the sky round it, the far skyline only when standing. */
  function setPose(pose: Pose, aspect: number) {
    camera.position.set(...pose.position);
    camera.quaternion.set(...pose.quaternion);
    camera.fov = pose.fov;
    camera.aspect = aspect;
    camera.far = flight ? 1e10 : 700000;
    const [sx, sy] = pose.shift;
    if (sx || sy) camera.setViewOffset(1000 * aspect, 1000, -sx * 1000 * aspect, sy * 1000, 1000 * aspect, 1000);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.getWorldDirection(viewDir);
    pitchNow = Math.asin(Math.max(-1, Math.min(1, viewDir.y))) / DEG;
    const alt = camera.position.distanceTo(moonC) - (R_MOON_M + siteH);
    // In space the sky stands beyond the far side of the Moon, at its own angular sizes.
    skyGroup.position.copy(camera.position);
    skyScale(flight ? Math.max(1, (camera.position.distanceTo(moonC) + 2 * R_MOON_M) / RS) : 1);
    placeEarth();
    standing(alt < STANDING_M);
    measured(!flight || alt < MEASURED_M);
    ringShadows(alt < 5000);
    spaceNow = flight ? Math.min(1, Math.max(0, (alt - 30e3) / (600e3 - 30e3))) : 0;
    const aloft = Math.min(1, Math.max(0, (alt - ALOFT_M) / (5000 - ALOFT_M)));
    if (aloft !== aloftNow) {
      aloftNow = aloft;
      applyLight();
    }
    expose();
  }
  let standingNow = true, measuredNow = true, ringNow = true;
  /**
   * Within 5 km of the ground only: the rings' second shadow march, the next level's (from the air the rings cover much
   * of the view), and the full setting's steps; higher, the fast setting's (the same reach), where a cell is a pixel
   * or less (18.4). The renderer draws its moving frames there without MSAA (aloft).
   */
  function ringShadows(on: boolean) {
    if (on === ringNow) return;
    ringNow = on;
    const full = on && !fast;
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uRingShadows.value = on ? 1 : 0;
      u.uSteps.value = full ? SHADOW.STEPS : SHADOW_FAST.STEPS;
      u.uGrowth.value = full ? SHADOW.GROWTH : SHADOW_FAST.GROWTH;
    }
  }
  /**
   * The measured ground draws below 1600 km over the site; higher, the globe shows the whole Moon, the pole too,
   * with no seam round the measured patch.
   */
  function measured(on: boolean) {
    measuredNow = on;
    for (const g of ground) g.visible = on && !(g === capRing && standingNow);
    globe?.setCut(on && hasGround);
  }
  /** Standing: the stand view's far skyline and the cap's mesh to 125 km; above, the cap and its ring to 455 km and the globe beyond. */
  function standing(on: boolean) {
    standingNow = on;
    if (skyline) skyline.visible = on || !flight;
    if (cap && flight) (cap.material as THREE.ShaderMaterial).uniforms.uFarCut.value = on ? STAND_REACH_M : capRing ? 1e9 : GLOBE.CUT_M;
    if (capRing) {
      (capRing.material as THREE.ShaderMaterial).uniforms.uFarCut.value = GLOBE.CUT_M;
      capRing.visible = !on && measuredNow;
    }
  }
  standing(true);
  const probe = new THREE.Sphere(moonC, R_MOON_M - 12000), ray3 = new THREE.Ray(), hit3 = new THREE.Vector3();
  /** A world point on the screen; with `moon`, hidden where the Moon stands between it and the camera. */
  function project(world: Vec3, moon = false): Spot {
    const w = new THREE.Vector3(...world), s = spot(w, 0, false);
    if (!moon || !s.visible) return s;
    ray3.set(camera.position, w.clone().sub(camera.position).normalize());
    const at = ray3.intersectSphere(probe, hit3);
    return at && at.distanceTo(camera.position) < w.distanceTo(camera.position) - 1 ? { ...s, visible: false } : s;
  }
  /** A world point on the screen; `radius` lifts the spot above a body's disc (metres at the body); `occlude` false for a point on the lander itself. */
  function spot(world: THREE.Vector3, radius = 0, occlude = true): Spot {
    camera.getWorldDirection(fwd);
    const ahead = tmp.copy(world).sub(camera.position).dot(fwd) > 0;
    const p = tmp.copy(world).project(camera);
    const x = (p.x + 1) / 2, y = (1 - p.y) / 2;
    const visible = ahead && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 && !(occlude && behindLander(world));
    const lift = radius > 0 ? radius / world.distanceTo(camera.position) / Math.tan((camera.fov * DEG) / 2) / 2 : 0;
    return { x, y: y - lift, visible };
  }
  /** Where the lander's name goes: over its top, high enough that the ray to it clears the lander itself. */
  const landerTop = () => (lander ? new THREE.Vector3(lander.group.position.x, lander.group.position.y + 3.9, lander.group.position.z) : null);
  /**
   * A body's label: over the body, or resting on the skyline where the body is hidden below it. Where the
   * lander stands in front of that spot, the label goes over the lander's top, still at the body's azimuth:
   * a Sun gone down behind the hill behind the lander is named there, not left out.
   */
  function bodySpot(world: THREE.Vector3, radius: number): Spot {
    const d = tmp.copy(world).sub(camera.position).normalize();
    const az = ((Math.atan2(d.x, -d.z) / DEG) % 360 + 360) % 360, el = Math.asin(d.y) / DEG, sky = maskAt(az);
    const sk = dirAzEl(az, sky + 0.4);
    const at = el >= sky ? world : new THREE.Vector3(sk[0] * 30000, eye + sk[1] * 30000, sk[2] * 30000);
    const r = el >= sky ? radius : 0;
    const seen = spot(at, r);
    const top = landerTop();
    if (seen.visible || !top) return seen;
    const free = spot(at, r, false);
    if (!free.visible) return seen;
    return { x: free.x, y: Math.min(free.y, spot(top, 0, false).y), visible: true };
  }
  function labels(o: LabelOptions = {}): SkyLabels {
    // The brightest stars by name, where they stand above the skyline.
    const stars = (scene.sky.names ?? []).map(({ index, name }) => {
      const local = new THREE.Vector3(starPos[index * 3], starPos[index * 3 + 1], starPos[index * 3 + 2]), w = skyWorld(local);
      const d = local.clone().normalize();
      const az = ((Math.atan2(d.x, -d.z) / DEG) % 360 + 360) % 360, el = Math.asin(d.y) / DEG;
      const s = spot(w);
      return { name, ...s, visible: s.visible && el > maskAt(az) };
    });
    if (crossIdx) {
      // Its name a little below the cross's middle.
      const mid = new THREE.Vector3();
      for (const k of crossIdx) mid.add(new THREE.Vector3(starPos[k * 3], starPos[k * 3 + 1], starPos[k * 3 + 2]));
      mid.multiplyScalar(0.25);
      const d = mid.clone().normalize();
      const az = ((Math.atan2(d.x, -d.z) / DEG) % 360 + 360) % 360, el = Math.asin(d.y) / DEG;
      const s = spot(skyWorld(mid));
      stars.push({ name: 'Southern Cross', ...s, y: s.y + 0.03, visible: s.visible && el > maskAt(az) });
    }
    // The lander's name over its top, and its parts. Its own name is never hidden by the lander: standing up a slope
    // from you, the ray to its top passes through the box round it (16.2 names it wherever it shows).
    const top = landerTop();
    const landerSpot = top ? spot(top, 0, false) : null;
    const on = (local: THREE.Vector3) => spot(local.clone().applyMatrix4(lander!.group.matrixWorld), 0, false);
    const parts = lander
      ? {
          panel: on(new THREE.Vector3(LANDER.panel.c[0], LANDER.panel.c[1] + LANDER.panel.size[1] / 2, LANDER.panel.c[2])),
          dish: on(new THREE.Vector3(LANDER.antenna.x, LANDER.antenna.y1 + 0.1, LANDER.antenna.z)),
          lamp: on(lander.lampPos),
        }
      : null;
    // Your own shadow, while any of the Sun is up: 15 m out along it, on the ground.
    let shadow: SkyLabels['shadow'] = null;
    if (sunNow > 0) {
      const dir = new THREE.Vector3(-sunDir.x, 0, -sunDir.z).normalize();
      const at = spot(new THREE.Vector3(dir.x * 15, heightAt(scene.field, dir.x * 15, dir.z * 15) + 0.05, dir.z * 15), 0, false);
      // Along the real ground, worked out again only when the Sun has moved.
      const key = `${sunElNow.toFixed(2)},${dir.x.toFixed(3)},${dir.z.toFixed(3)}`;
      if (key !== shadowKey) {
        const feet = heightAt(scene.field, 0, 0);
        shadowLen = shadowOnGround((d) => heightAt(scene.field, dir.x * d, dir.z * d) - feet, sunElNow);
        shadowKey = key;
      }
      // The level length from the Sun's height as its label shows it (tenths below 10 degrees), so the sum
      // 1.8 m / tan(height) can be checked from the numbers on the screen.
      const shownEl = Math.abs(sunElNow) < 9.95 ? Math.round(sunElNow * 10) / 10 : Math.round(sunElNow);
      shadow = { ...at, lengthM: shadowLen, levelM: Math.min(500, 1.8 / Math.tan(Math.max(0.2, shownEl) * DEG)) };
    }
    // The key moments' days on the paths, where the guides show.
    const marks = (scene.marks ?? []).map((m) => {
      const h = Math.min(scene.series.hours - 1, Math.max(0, Math.round(m.hour)));
      const d = m.body === 'sun' ? dirAzEl(scene.series.sunAz[h], scene.series.sunEl[h]) : dirAzEl(scene.series.earthAz[h], scene.series.earthEl[h]);
      const at = spot(skyWorld(new THREE.Vector3(d[0] * RG, d[1] * RG, d[2] * RG)), 0, false);
      return { text: m.text, ...at, visible: at.visible && guides.visible && h >= drawnFrom && h <= drawnTo };
    });
    const k = skyGroup.scale.x;
    const onScreen = landerOnScreen();
    const pathNames = [
      pathName('sun', "Sun's path this month", sunDirs, scene.series.sunEl, sunFloor, sunDir, onScreen, o.above ? { dirs: earthDirs, el: scene.series.earthEl, floor: earthFloor } : null, o.middle),
      pathName('earth', "Earth's path this month", earthDirs, scene.series.earthEl, earthFloor, earthDir, onScreen, o.above ? { dirs: sunDirs, el: scene.series.sunEl, floor: sunFloor } : null, o.middle),
    ];
    // The top of the resident's shell (20.2): the one projection a frame it costs.
    const residentSpot = resident ? spot(resident.top, 0, false) : null;
    return { sun: bodySpot(skyWorld(sun.position), SUN_D * 3 * k), earth: bodySpot(earthPos, EARTH_R * 1.25 * k), stars, lander: landerSpot, parts, shadow, marks, pathNames, landerBox: onScreen, level: levelSpot(), resident: residentSpot };
  }
  /** The box round the lander on the screen: the corners of its box in the world, projected; null while it is out of view. */
  function landerOnScreen(): ScreenBox | null {
    if (!lander) return null;
    camera.getWorldDirection(fwd);
    const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }, c = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? landerBox.max.x : landerBox.min.x, i & 2 ? landerBox.max.y : landerBox.min.y, i & 4 ? landerBox.max.z : landerBox.min.z);
      // A corner behind the camera has no place on the screen: the lander is well out of view.
      if (tmp.copy(c).sub(camera.position).dot(fwd) <= camera.near) return null;
      c.project(camera);
      b.left = Math.min(b.left, (c.x + 1) / 2);
      b.right = Math.max(b.right, (c.x + 1) / 2);
      b.top = Math.min(b.top, (1 - c.y) / 2);
      b.bottom = Math.max(b.bottom, (1 - c.y) / 2);
    }
    return b.right < 0 || b.left > 1 || b.bottom < 0 || b.top > 1 ? null : b;
  }
  /**
   * Where the level horizon's name goes (16.3): scanning the view from its left edge, in half degrees, the left end of
   * the first stretch of the line 3° or more long where the skyline lies below level, so the name always points at a
   * line in the open; null where no such stretch is in view, or while the guides or the line are hidden.
   */
  function levelSpot(): Spot | null {
    if (!guides.visible || !levelBand.visible) return null;
    camera.getWorldDirection(fwd);
    const yaw = Math.atan2(fwd.x, -fwd.z) / DEG, half = Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect) / DEG;
    let start: number | null = null;
    for (let a = -half + 1; a <= half - 1; a += 0.5) {
      const az = (((yaw + a) % 360) + 360) % 360;
      if (maskAt(az) >= 0) {
        start = null;
        continue;
      }
      if (start === null) start = a;
      if (a - start >= 3) {
        const d = dirAzEl((((yaw + start) % 360) + 360) % 360, 0);
        const s = spot(skyWorld(new THREE.Vector3(d[0] * RG, d[1] * RG, d[2] * RG)), 0, false);
        return s.visible ? s : null;
      }
    }
    return null;
  }
  /**
   * A path's name, at an hour of it that shows: drawn (not under the ground) and clear of the day that fades at
   * either end, in view, not behind the lander, and above the level horizon where it can be; as near the middle of
   * the view (or `middle` across it) as it can be while 10° or more from the body itself (whose own label names it),
   * else as far from the body as it can be. None while the guides are hidden. With `other` (the arrival, which hangs each name over its
   * line) it keeps 12° or more round from the other path where that shows, so no name is read as the other's,
   * and a loop (Earth's) is named at its highest point, so none of it runs through the name over it.
   */
  function pathName(body: PathName['body'], text: string, dirs: Vec3[], el: ArrayLike<number>, floor: number[], now: THREE.Vector3, box: ScreenBox | null, other: { dirs: Vec3[]; el: ArrayLike<number>; floor: number[] } | null = null, middle = 0.5): PathName {
    let best = { x: 0, y: 0, visible: false }, score = Infinity;
    if (!guides.visible) return { body, text, ...best };
    camera.getWorldDirection(fwd);
    const ends = drawnTo - drawnFrom > 4 * FADE_H ? FADE_H : 0, d = new THREE.Vector3();
    const bearing = (x: number, z: number) => Math.atan2(x, -z) / DEG;
    // Where the other path shows, every third hour of the stretch drawn.
    const otherAz: number[] = [];
    if (other) for (let h = drawnFrom; h <= drawnTo; h += 3) if (Number(other.el[h]) >= other.floor[h]) otherAz.push(bearing(other.dirs[h][0], other.dirs[h][2]));
    for (let h = drawnFrom + ends; h <= drawnTo - ends; h++) {
      if (Number(el[h]) < floor[h]) continue;
      d.set(...dirs[h]);
      if (d.dot(fwd) <= 0) continue;
      const p = tmp.copy(d).multiplyScalar(RG * skyGroup.scale.x).add(skyGroup.position).project(camera);
      const x = (p.x + 1) / 2, y = (1 - p.y) / 2;
      // Room round it for the name, and not where the lander stands in front of the path.
      if (x < 0.1 || x > 0.9 || y < 0.1 || y > 0.85) continue;
      if (box && x > box.left && x < box.right && y > box.top && y < box.bottom) continue;
      const away = d.angleTo(now) / DEG, near = away < 10 ? 5 + (10 - away) / 10 : 0;
      let s = (Number(el[h]) < 0 ? 10 : 0) + (near || Math.abs(x - middle));
      if (other) {
        const az = bearing(d.x, d.z), gap = otherAz.reduce((g, a) => Math.min(g, Math.abs(((a - az + 540) % 360) - 180)), 180);
        if (gap < 12) s += 4;
        if (body === 'earth') s = (Number(el[h]) < 0 ? 10 : 0) + near + y;
      }
      if (s < score) {
        score = s;
        best = { x, y, visible: true };
      }
    }
    return { body, text, ...best };
  }

  // Textures kept for the page's life (the globe's maps, Earth's) stay: a scene rebuilt as data arrives takes them.
  const release = (t: unknown) => {
    if (t instanceof THREE.Texture && !t.userData.shared) t.dispose();
  };
  const dispose = () => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats) {
        for (const value of Object.values(mat as unknown as Record<string, unknown>)) release(value);
        if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) release(u.value);
        mat.dispose();
      }
    });
  };

  /**
   * Shows or hides the guides (the month's paths and the level horizon), the level horizon alone (the arrival tells
   * its story without it), and the rings on hidden bodies, which go with the guides unless told apart: the stand view
   * shows them with its labels (16.2), the arrival with its guides.
   */
  const setGuides = (on: boolean, level = true, ringsOn = on) => {
    guides.visible = on;
    levelBand.visible = level;
    rings.visible = ringsOn;
  };

  /** More than 5 km over the ground (the arrival's flight): the ground's cells come to a pixel or less (18.4). */
  const aloft = () => !ringNow;
  return { root, camera, update, setView, setPose, setGuides, project, labels, exposure, dispose, aloft, starMaterial: starMat, parts: { guides, rings, markers, ground, stars, earth, sun, glare, cross, lander: lander?.group ?? null, landerLight: lander?.lamp ?? null, landerFill: lander ? fillLight : null, landerDust: lander?.dust ?? null, keyLight, boulders: rocks.group, pebbles, resident: resident?.group ?? null, globe: globe?.mesh ?? null, sky: skyGroup, ring: skyline } };
}

/**
 * The order the guides draw in, after the ground (all of them with the solid things, by this order): the faint bands,
 * then the solid ones, then the rings on hidden bodies; and after them all the lander, so that it covers them where it
 * stands in front of them.
 */
const ORDER = { FAINT: 1, SOLID: 2, RINGS: 3, LANDER: 4 } as const;
/**
 * The guides' blending: as three.js's normal blending, but set as a custom one, so three.js draws them with the solid
 * things (in ORDER, after the ground and before the lander) rather than in its transparent pass after everything
 * solid. A lander drawn in that pass, after the guides, went missing from the arrival's view once the flight had passed
 * over the cap (the finest ground's depth came out in front of it there, though not for a solid lander drawn last).
 */
const BLENDED = { transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor } as const;

export { movingRatio };

/** The camera's exposure setting, before it stops down for bright ground (see the scene's exposure). */
const EXPOSURE = 1.05;
/**
 * "Brighter picture" (18.3): for projectors and bright rooms. One stop (×2) read as slight to both readers of D3,
 * the night term's tone mapping compressing it, so 19.4 makes it a stop and a half (×3); the day frame keeps its
 * own stopping down under it (sceneExposure as low as 0.35 looking down-Sun), which holds the clipping.
 */
const BRIGHT_GAIN = 3;

/** The tone mapping's exposure for a frame: the camera's setting, tripled for a brighter picture, times the scene's own stopping down. */
export function toneExposure(bright: boolean, sceneExposure: number): number {
  return EXPOSURE * (bright ? BRIGHT_GAIN : 1) * sceneExposure;
}

/**
 * The WebGL side: the renderer, bloom for the Sun, and its pacing. No frame is queued while the graphics
 * chip is still drawing the last one (a fence after each frame says when it is done), so a slow chip never
 * falls behind; one that keeps the view waiting draws fewer pixels while the view moves; and whenever the
 * view comes to rest one frame is drawn at full sharpness (nothing is drawn while it rests). Throws without
 * WebGL 2.
 */
export class StandRenderer {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  /** The light all round that the foil mirrors: a render target, which only its own dispose gives back. */
  private around: THREE.WebGLRenderTarget;
  private built: ReturnType<typeof buildScene>;
  private size = { w: 1, h: 1 };
  private view = { yaw: 0, pitch: 0, fov: 60 };
  private hour = 0;
  /**
   * The pixel ratio while the view moves (stepped down on a slow chip), and the one for a still view: full,
   * unless a still frame took the chip so long (over 0.9 s) that the next one draws fewer pixels, well clear
   * of the two seconds after which Windows resets a graphics chip that seems stuck.
   */
  private pixelRatio: number;
  private sharpRatio: number;
  private sharpSince: number | null = null;
  /** The ratio the canvas is drawn at now. */
  private drawnRatio: number;
  private readonly pacer = new FramePacer();
  /** The moving frames' pixel ratio over the visit: lowered after three slow frames in a row, raised again after thirty fast ones. */
  private ratios: RatioPacer;
  /** The fence after the last frame. */
  private fence: WebGLSync | null = null;
  /** When the last moving frame was drawn, while the view goes on moving; null once it rests. */
  private movedAt: number | null = null;
  /**
   * Resolves once the shaders are built. They are built off the page's thread where the browser can
   * (KHR_parallel_shader_compile), so the page never freezes while the ground's long shader compiles;
   * nothing is drawn before.
   */
  readonly ready: Promise<void>;
  private compiled = false;
  /** Told when the view can no longer draw: a shader failed to compile or link on its first use. */
  onLost?: (why: string) => void;
  /** Told once a frame drawn at full sharpness is on the screen: stills and the recorded walk wait for it. */
  onSharp?: () => void;
  /** A view from anywhere (the home page's arrival), in place of the stand view's yaw and pitch. */
  private pose: Pose | null = null;
  private renderPass: RenderPass;
  private half: boolean;
  /** A scene built beside the one on the screen (the ground arriving), which replaces it once compiled. */
  private next: { built: ReturnType<typeof buildScene>; compiled: boolean } | null = null;
  /** Counts the scenes put on the screen: whatever the labels read changes with each. */
  generation = 0;
  /** Whether the guides show (hidden with the words, and in flight). */
  private guides = true;
  private level = true;
  private rings = true;
  /** "Brighter picture" (18.3): the exposure doubled for projectors and bright rooms. */
  private bright = false;

  /** A brighter picture for projectors and bright rooms: twice the exposure (18.3), or back to the camera's setting. */
  setBright(on: boolean) {
    this.bright = on;
    this.renderer.toneMappingExposure = toneExposure(on, 1);
    // A resting view draws its frame again: the pacer's key carries the generation (read D3: the toggle showed no change).
    this.generation++;
  }

  constructor(canvas: HTMLCanvasElement, scene: StandScene) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, logarithmicDepthBuffer: true });
    this.pixelRatio = this.sharpRatio = this.drawnRatio = scene.quality === 'fast' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.ratios = new RatioPacer(this.pixelRatio, this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = toneExposure(this.bright, 1);
    // Heights go to the GPU as float32 where it can filter them, else as half floats.
    this.half = !this.renderer.extensions.has('OES_texture_float_linear');
    this.built = buildScene(scene, { halfFloat: this.half });
    // The lander's foil and metal mirror what is round them: the black sky above, the grey dust below.
    const around = new THREE.SphereGeometry(1, 32, 16), pos = around.getAttribute('position'), tint = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = pos.getY(i) < 0 ? 0.34 * Math.min(1, -pos.getY(i) * 4) : 0;
      tint.set([c, c * 0.97, c * 0.93], i * 3);
    }
    around.setAttribute('color', new THREE.BufferAttribute(tint, 3));
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(around, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.around = pmrem.fromScene(envScene, 0);
    this.built.root.environment = this.around.texture;
    pmrem.dispose();
    around.dispose();
    // A shader that fails shows only on its first use; then the view gives way to the fallback.
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      // The driver's own words on what failed, for whoever looks at the console.
      console.error('A shader of the view did not compile.', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
      this.onLost?.('A shader of the view did not compile');
    };
    this.built.starMaterial.uniforms.uPx.value = this.pixelRatio;
    // Four samples per pixel in the composer's own target: smooth edges on Earth and the skyline.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    // Shaders that fail to build reject `ready`, so the view gives way to the fallback rather than draw black.
    this.ready = this.compile(this.built).then(() => {
      this.compiled = true;
    });
    this.renderPass = new RenderPass(this.built.root, this.built.camera);
    this.composer.addPass(this.renderPass);
    // A tight bloom: the Sun's disc glows a little, the sky round it stays black.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.15, 0.985);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
  }

  setTime(hour: number) {
    this.hour = hour;
    this.built.update(hour);
  }

  setView(yawDeg: number, pitchDeg: number, fovDeg: number) {
    this.pose = null;
    this.view = { yaw: yawDeg, pitch: pitchDeg, fov: fovDeg };
    this.built.setView(yawDeg, pitchDeg, fovDeg, this.size.w / this.size.h);
  }

  /** A view from anywhere: the camera at the pose (the home page's arrival). */
  setPose(pose: Pose) {
    this.pose = pose;
    this.built.setPose(pose, this.size.w / this.size.h);
  }

  /**
   * A new scene for the view (the measured ground arriving): built and compiled beside the one on the screen,
   * which it replaces at the first frame after, so the view never waits on a compiling shader.
   */
  setScene(scene: StandScene) {
    const built = buildScene(scene, { halfFloat: this.half });
    const next = { built, compiled: false };
    this.next?.built.dispose();
    this.next = next;
    // The light all round that the foil mirrors, as the scene will draw with it (swap keeps it): the lander's programs are keyed by it.
    built.root.environment = this.built.root.environment;
    this.compile(built).then(
      () => {
        next.compiled = true;
      },
      () => this.onLost?.('A shader of the view did not compile'),
    );
  }

  /**
   * Builds a scene's shaders as the composer draws them: into a target of its own kind, so without tone mapping and in
   * linear colour, which three keys its programs by. Built for the screen, every program was built again on its first
   * draw, the ground's long shader with the page frozen (15 s on the laptop's first visit, as the ground came into view).
   */
  private compile(b: ReturnType<typeof buildScene>): Promise<unknown> {
    const was = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.composer.readBuffer);
    const done = this.renderer.compileAsync(b.root, b.camera);
    this.renderer.setRenderTarget(was);
    return done;
  }

  /** Puts a compiled new scene on the screen, at the same hour and view, keeping the environment the foil mirrors. */
  private swap() {
    const next = this.next;
    if (!next?.compiled) return;
    const old = this.built;
    this.built = next.built;
    this.next = null;
    this.built.root.environment = old.root.environment;
    old.root.environment = null;
    old.dispose();
    this.renderPass.scene = this.built.root;
    this.renderPass.camera = this.built.camera;
    this.built.starMaterial.uniforms.uPx.value = this.drawnRatio;
    this.built.setGuides(this.guides, this.level, this.rings);
    this.built.update(this.hour);
    this.apply();
    this.generation++;
  }

  /** The pose, or else the stand view's yaw and pitch, for the canvas's shape. */
  private apply() {
    if (this.pose) this.built.setPose(this.pose, this.size.w / this.size.h);
    else this.built.setView(this.view.yaw, this.view.pitch, this.view.fov, this.size.w / this.size.h);
  }

  resize(w: number, h: number) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.drawAt(this.drawnRatio);
  }

  /** Sizes the canvas and the passes for a pixel ratio. */
  private drawAt(ratio: number) {
    this.drawnRatio = ratio;
    this.built.starMaterial.uniforms.uPx.value = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(this.size.w, this.size.h);
    this.bloom.setSize(this.size.w, this.size.h);
    this.apply();
  }

  /** Whether the chip is still drawing the last frame; once a still frame is done, how long it took sets the next one's pixels. */
  private busy(now: number): boolean {
    if (!this.fence) return false;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
    gl.deleteSync(this.fence);
    this.fence = null;
    if (this.sharpSince !== null) {
      // The time grows with the pixels, so with the square of the ratio: aim for 0.6 s.
      const took = now - this.sharpSince;
      if (took > 900) this.sharpRatio = Math.max(this.pixelRatio, this.sharpRatio * Math.sqrt(600 / took));
      this.sharpSince = null;
      this.onSharp?.();
    }
    return false;
  }

  /**
   * Samples a pixel in the composer's target: four for a still frame, none for a moving one aloft, where the ground's
   * triangles are smaller than a pixel and each sample would run the ground's long shader again (18.4).
   */
  private samples(n: number) {
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples === n) continue;
      rt.samples = n;
      rt.dispose();
    }
  }

  /** Draws the frame and sets a fence after it. */
  private draw() {
    // The camera stops down looking down-Sun at the sunlit ground (the output pass reads this exposure); a brighter
    // picture doubles it.
    this.renderer.toneMappingExposure = toneExposure(this.bright, this.built.exposure());
    this.composer.render();
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  render() {
    if (!this.compiled) return;
    this.swap();
    const now = performance.now();
    // A map arriving (Earth's, the globe's larger ones) draws the view again, as a turn does.
    const earthMaps = (this.built.parts.earth.material as THREE.ShaderMaterial).uniforms.uMaps.value;
    const g = (this.built.parts.globe?.material as THREE.ShaderMaterial | undefined)?.uniforms;
    const maps = `${earthMaps} ${g ? `${g.uColor.value?.uuid ?? ''} ${g.uNormal.value?.uuid ?? ''}` : ''}`;
    const v = this.view, p = this.pose;
    const where = p ? `${p.position.map((x) => x.toFixed(2)).join(',')} ${p.quaternion.map((x) => x.toFixed(6)).join(',')} ${p.fov.toFixed(3)} ${p.shift.join(',')}` : `${v.yaw.toFixed(3)} ${v.pitch.toFixed(3)} ${v.fov.toFixed(3)}`;
    const key = `${where} ${this.hour.toFixed(4)} ${this.size.w}x${this.size.h} ${maps} ${this.generation} ${this.guides} ${this.level} ${this.rings}`;
    const busy = this.busy(now);
    // Moving frames aloft have no MSAA: the view at rest there gets its sharp frame, with it.
    const mode = this.pacer.next(key, now, { fullWhileMoving: this.pixelRatio >= this.sharpRatio && !this.built.aloft(), busy });
    if (mode === 'idle') {
      if (!busy) this.movedAt = null;
      return;
    }
    if (mode !== 'move') this.movedAt = null;
    if (mode === 'rest') {
      // The view has come to rest and the frame on the screen, drawn at full sharpness while it moved, is done.
      this.onSharp?.();
      return;
    }
    if (mode === 'sharp') {
      // The view has come to rest: one frame at full sharpness, which stays on the screen.
      this.samples(4);
      this.drawAt(this.sharpRatio);
      this.draw();
      this.sharpSince = now;
      return;
    }
    this.samples(this.built.aloft() ? 0 : 4);
    // A chip that keeps the view waiting draws fewer pixels while the view moves (RatioPacer: after three slow frames in
    // a row, and back up after thirty fast ones); the words and the numbers never change.
    if (this.movedAt !== null) this.pixelRatio = this.ratios.frame(now - this.movedAt);
    this.movedAt = now;
    if (this.drawnRatio !== this.pixelRatio) this.drawAt(this.pixelRatio);
    this.draw();
  }

  labels(o?: LabelOptions): SkyLabels {
    return this.built.labels(o);
  }

  /** Whether the frame on the screen is the sharp one for what it shows: the view has rested and that frame is done. */
  get resting(): boolean {
    return this.pacer.atRest && this.sharpSince === null;
  }

  /** A world point on the screen; with `moon`, hidden where the Moon stands between it and the camera. */
  project(world: Vec3, moon = false) {
    return this.built.project(world, moon);
  }

  /** Shows or hides the month's paths and the level horizon (or the line alone), and the rings on hidden bodies. */
  setGuides(on: boolean, level = true, rings = on) {
    this.guides = on;
    this.level = level;
    this.rings = rings;
    this.built.setGuides(on, level, rings);
  }

  /**
   * Gives everything back: the scenes, the light all round, the passes, the renderer, and the GPU copies of the
   * textures kept for the page's life (the cached maps, three's own table), which would otherwise hold this renderer
   * and its context after it has gone.
   */
  dispose() {
    if (this.fence) (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.fence);
    const threes = threesOwnTextures(this.built.root, this.renderer.properties);
    this.around.dispose();
    this.built.dispose();
    this.next?.built.dispose();
    this.bloom.dispose();
    this.output.dispose();
    this.composer.dispose();
    releaseCachedTextures();
    for (const t of threes) t.dispose();
    this.renderer.dispose();
  }
}
