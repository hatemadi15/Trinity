import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { GlobeAssets } from '../data/globe';
import type { SkyAssets } from '../data/sky';
import { R_MOON_M } from '../engine/constants';
import type { Series } from '../engine/metrics';
import type { Pose } from './arrivalPath';
import { earthAxes, earthLitFraction } from './earth';
import { dirAzEl, enuBasis, meToWorld, type Vec3 } from './frames';
import { buildGlobe, GLOBE } from './globe';
import { moonMatrixAt } from './moonOrientation';
import { EARTH_FRAG, EARTH_VERT, GROUND_FRAG, GROUND_VERT, STAR_FRAG, STAR_VERT } from './shaders';
import { FramePacer } from './framePacer';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { cachedTexture } from './textureCache';
import { placeStars, starColour, starGain, starSize } from './stars';
import { LANDER, LEG_ENDS } from './landerShape';
import { BOULDERS, boulderMeshes, pebbleMesh, placeBoulders, placePebbles, siteSeed } from './boulders';
import { heightAt, meshHeightAt, worldOf, type FieldLevel, type TerrainField } from './terrainField';

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
}

type Spot = { x: number; y: number; visible: boolean };
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
 * The measured ground's reach standing (125 km, the far skyline beyond it) and in flight (205 km, cut round at
 * 200 km where the globe takes over). Within 10 m of the ground at the site the view counts as standing: the
 * far skyline is the eye's own horizon, and from higher up the near crests drop below it and would bare it as a
 * band. From 500 m up the eye's night light fades out. From space the camera exposes for the sunlit Moon (a
 * fixed gain) and shows the brighter stars faintly.
 */
const STAND_REACH_M = 125000, FLIGHT_REACH_M = 205000, STANDING_M = 10, ALOFT_M = 500, MEASURED_M = 450000, SPACE_GAIN = 1.8, SPACE_STARS = 0.7;
/** How far a level's mesh reaches from the site, by its cell size; the coarsest to 125 km, or 205 km in flight. The shadows read the whole level. */
const meshReachM = (cellM: number, coarsest: boolean, flight = false) => (coarsest ? (flight ? FLIGHT_REACH_M : STAND_REACH_M) : cellM <= 30 ? 5000 : cellM <= 200 ? 20500 : 125000);
/** The value stored for a cell outside the measured ground when heights go to the GPU as half floats. */
const HALF_OUTSIDE = -65000;

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

/** Heights for a GPU texture: float32 as they are, or half floats with cells outside the ground kept finite. */
export function toTextureHeights(heights: Float32Array, half: boolean): Float32Array | Uint16Array {
  if (!half) return heights;
  const out = new Uint16Array(heights.length);
  for (let i = 0; i < heights.length; i++) out[i] = THREE.DataUtils.toHalfFloat(heights[i] < SHADOW.OUTSIDE_BELOW_M ? HALF_OUTSIDE : heights[i]);
  return out;
}

function heightTexture(l: FieldLevel | undefined, half: boolean): THREE.DataTexture {
  const t = l
    ? new THREE.DataTexture(toTextureHeights(l.heights, half), l.cols, l.rows, THREE.RedFormat, half ? THREE.HalfFloatType : THREE.FloatType)
    : new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** A level's mesh around the site, out to `halfM` (or the level's edge); returns the mesh and how far it reaches on its nearest side. */
function groundMesh(l: FieldLevel, lonDeg: number, halfM: number, material: THREE.ShaderMaterial): { mesh: THREE.Mesh; reachM: number } {
  const sc = Math.round(l.siteCol), sr = Math.round(l.siteRow), n = Math.floor(halfM / l.cell);
  const c0 = Math.max(3, sc - n), c1 = Math.min(l.cols - 4, sc + n), r0 = Math.max(3, sr - n), r1 = Math.min(l.rows - 4, sr + n);
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
  const pos = new Float32Array(cols * rows * 3), nor = new Float32Array(cols * rows * 3);
  const h = (r: number, c: number) => l.heights[r * l.cols + c];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = (r - r0) * cols + (c - c0), mx = (c - l.siteCol) * l.cell, my = -(r - l.siteRow) * l.cell, w = worldOf(lonDeg, mx, my);
      pos[k * 3] = w.x;
      pos[k * 3 + 1] = h(r, c);
      pos[k * 3 + 2] = w.z;
      // Slopes over three cells each way: the grids' single-row seams do not ripple or streak the light.
      const gx = (h(r, c + 3) + h(r, c + 2) + h(r, c + 1) - h(r, c - 1) - h(r, c - 2) - h(r, c - 3)) / (12 * l.cell);
      const gy = (h(r - 3, c) + h(r - 2, c) + h(r - 1, c) - h(r + 1, c) - h(r + 2, c) - h(r + 3, c)) / (12 * l.cell);
      const g = worldOf(lonDeg, -gx, -gy), len = Math.hypot(g.x, 1, g.z);
      nor[k * 3] = g.x / len;
      nor[k * 3 + 1] = 1 / len;
      nor[k * 3 + 2] = g.z / len;
    }
  }
  const idx = new Uint32Array((rows - 1) * (cols - 1) * 6);
  let m = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx[m++] = a; idx[m++] = d; idx[m++] = b; idx[m++] = b; idx[m++] = d; idx[m++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  const reachM = Math.min(l.siteCol - c0, c1 - l.siteCol, l.siteRow - r0, r1 - l.siteRow) * l.cell;
  return { mesh, reachM };
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

/** How high the eye stands over the drawn ground: the mast's height (2 m by default), never under a person's 1.5 m. */
export const eyeHeightM = (mastM: number) => Math.max(1.5, mastM);
/** Where the eye is: over the drawn ground at the site, so the mesh never stands above it. */
export const eyeAt = (scene: Pick<StandScene, 'field' | 'mastM'>) => meshHeightAt(scene.field, 0, 0) + eyeHeightM(scene.mastM);

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
  const levels = scene.field.levels;
  const eye = eyeAt(scene);
  // Views from above (the home page's arrival): the globe round the measured ground, the camera anywhere.
  const hasGround = scene.ground !== false, flight = !!scene.globe, siteH = scene.siteHeightM ?? 0;
  const moonC = new THREE.Vector3(0, -(R_MOON_M + siteH), 0);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, flight ? 1e10 : 700000);
  camera.position.set(0, eye, 0);

  // The measured ground: up to three levels as height textures (for the shadows) and meshes (to see).
  const tex = [0, 1, 2].map((i) => heightTexture(levels[i], opts.halfFloat ?? false));
  const lv = (i: number) => new THREE.Vector3(levels[i]?.siteCol ?? 0, levels[i]?.siteRow ?? 0, levels[i]?.cell ?? 1);
  const sz = (i: number) => new THREE.Vector2(levels[i]?.cols ?? 1, levels[i]?.rows ?? 1);
  const c = Math.cos(scene.field.lonDeg * DEG), s = Math.sin(scene.field.lonDeg * DEG);
  const material = (detail: boolean, hole: number, level: number) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uH0: { value: tex[0] }, uH1: { value: tex[1] }, uH2: { value: tex[2] },
        uL0: { value: lv(0) }, uL1: { value: lv(1) }, uL2: { value: lv(2) },
        uS0: { value: sz(0) }, uS1: { value: sz(1) }, uS2: { value: sz(2) },
        uCS: { value: new THREE.Vector2(c, s) },
        uLevels: { value: Math.min(3, levels.length) },
        uMinLevel: { value: level },
        uSteps: { value: fast ? SHADOW_FAST.STEPS : SHADOW.STEPS },
        uOne: { value: 1 },
        uViewer: { value: new THREE.Vector3(0, meshHeightAt(scene.field, 0, 0), 0) },
        uGrowth: { value: fast ? SHADOW_FAST.GROWTH : SHADOW.GROWTH },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uEarth: { value: new THREE.Vector3(0, 1, 0) },
        uEarthshine: { value: 0 },
        uDetail: { value: detail && !fast ? 1 : 0 },
        uSunPower: { value: 3.4 },
        uHole: { value: new THREE.Vector2(hole, hole) },
        uLanderOn: { value: 0 },
        uLanderCenter: { value: new THREE.Vector3() },
        uLanderCS: { value: new THREE.Vector2(1, 0) },
        uSunUp: { value: 0 },
        uRocks: { value: Array.from({ length: BOULDERS.MAX }, () => new THREE.Vector4()) },
        uRockCount: { value: 0 },
        uBounce: { value: 0.015 },
        uNight: { value: 0 },
        uFarCut: { value: 1e9 },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      polygonOffset: level > 0,
      polygonOffsetFactor: level,
      polygonOffsetUnits: level * 4,
    });
  const ground: THREE.Mesh[] = [];
  if (!hasGround) {
    // The sky and the globe alone, until the measured ground has loaded.
  } else if (levels.length === 0) {
    // No terrain: flat ground on the curved Moon.
    const geo = new THREE.RingGeometry(0.01, 150000, 256, 128).rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, -(p.getX(i) ** 2 + p.getZ(i) ** 2) / (2 * R_MOON_M));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material(true, 0, 0));
    mesh.frustumCulled = false;
    ground.push(mesh);
  } else {
    let hole = 0;
    const drawn = levels.slice(0, 3);
    drawn.forEach((l, i) => {
      const { mesh, reachM } = groundMesh(l, scene.field.lonDeg, meshReachM(l.cell, i === drawn.length - 1, flight), material(i === 0, hole, i));
      ground.push(mesh);
      // The next, coarser level starts two of this level's cells inside its edge: an overlap, never a gap.
      hole = Math.max(0, reachM - 2 * l.cell);
    });
  }
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
  // skyline and faint where the hills hide them; the level horizon all round, faint; and a ring where a hidden
  // Sun or Earth sits, on the hill that hides it.
  const guides = new THREE.Group();
  skyGroup.add(guides);
  const RG = RS * 0.98;
  /** A band 0.15 degrees tall along directions on the sky, as a mesh: WebGL draws lines a pixel thin. */
  const band = (dirs: Vec3[], colour: number, faint: boolean, opacity: number) => {
    const n = dirs.length, pos = new Float32Array(n * 6), idx: number[] = [], half = RG * Math.tan(0.075 * DEG);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(...dirs[i]).normalize(), up = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize(), c = d.clone().multiplyScalar(RG);
      pos.set([c.x + up.x * half, c.y + up.y * half, c.z + up.z * half, c.x - up.x * half, c.y - up.y * half, c.z - up.z * half], i * 6);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, depthTest: !faint, side: THREE.DoubleSide, toneMapped: false }));
    mesh.frustumCulled = false;
    mesh.renderOrder = faint ? 1 : 2;
    return mesh;
  };
  const along = (az: ArrayLike<number>, el: ArrayLike<number>) => Array.from({ length: scene.series.hours }, (_, h) => dirAzEl(az[h], el[h]));
  const sunDirs = along(scene.series.sunAz, scene.series.sunEl), earthDirs = along(scene.series.earthAz, scene.series.earthEl);
  guides.add(
    band(sunDirs, 0xf6b646, false, 0.9),
    band(sunDirs, 0xf6b646, true, 0.3),
    band(earthDirs, 0x74adff, false, 0.9),
    band(earthDirs, 0x74adff, true, 0.3),
    band(Array.from({ length: 361 }, (_, k) => dirAzEl(k, 0)), 0xffffff, true, 0.18),
  );
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
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        opacity: 0.85,
      }),
    );
    s.scale.setScalar(2 * RG * Math.tan((degrees * DEG) / 2));
    s.visible = false;
    s.renderOrder = 3;
    guides.add(s);
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
  const landerBox = new THREE.Box3();
  // The Sun; the sunlit dust's light from below, which fills the lander's shaded sides (as in the Apollo
  // photographs); and Earth's faint blue light.
  const sunLight = new THREE.DirectionalLight(0xffffff, 0), skyLight = new THREE.HemisphereLight(0x0a0a0c, 0x8a857c, 0), earthLight = new THREE.AmbientLight(0x8aa7ff, 0);
  // A neutral fill: faint by day, and at night the light that stands for eyes adapting to the dark (grey,
  // not Earth's blue, which comes only with Earth).
  const fillLight = new THREE.AmbientLight(0xc4c6ca, 0);
  root.add(sunLight, sunLight.target, skyLight, earthLight, fillLight);
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
  const rocks = hasGround
    ? boulderMeshes(placeBoulders(seed, lander ? { x: lander.group.position.x, z: lander.group.position.z } : null), (x, z) => meshHeightAt(scene.field, x, z), seed)
    : { group: new THREE.Group(), spheres: [] as THREE.Vector4[] };
  root.add(rocks.group);
  // Pebbles: the near ground's grit, shapes the low Sun catches.
  const pebbles = hasGround ? pebbleMesh(placePebbles(seed, lander ? { x: lander.group.position.x, z: lander.group.position.z } : null), (x, z) => meshHeightAt(scene.field, x, z), seed) : null;
  if (pebbles) root.add(pebbles);
  for (const g of ground) {
    const u = (g.material as THREE.ShaderMaterial).uniforms;
    rocks.spheres.forEach((v, i) => (u.uRocks.value as THREE.Vector4[])[i].copy(v));
    u.uRockCount.value = rocks.spheres.length;
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
  function applyLight() {
    const { sunFraction, full, earthUp } = lightNow, eyeOnly = 1 - aloftNow;
    const earthshine = earthUp ? 0.25 * full * (1 + 3 * (1 - sunFraction) * eyeOnly) : 0;
    const night = nightFloor(sunFraction, earthshine) * eyeOnly;
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uEarthshine.value = earthshine;
      u.uNight.value = night;
    }
    // Earth's blue light only while Earth is up; the neutral fill, faint by day, and at night enough for the
    // shapes to show when neither the Sun nor Earth lights them (the ground gets the same).
    earthLight.intensity = 0.5 * earthshine;
    fillLight.intensity = 0.03 + night;
  }
  function update(t: number) {
    const v = sampleSeries(scene.series, t);
    const sd = dirAzEl(v.sunAz, v.sunEl), ed = dirAzEl(v.earthAz, v.earthEl);
    sunDir.set(...sd);
    sun.position.set(sd[0] * RS, sd[1] * RS, sd[2] * RS);
    glare.position.copy(sun.position);
    // A ring where a hidden Sun or Earth sits, on the hill that hides it.
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
      u.uBounce.value = bounceShare(v.sunEl);
    }
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
    skyGroup.scale.setScalar(1);
    placeEarth();
    standing(true);
    measured(true);
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
    skyGroup.scale.setScalar(flight ? Math.max(1, (camera.position.distanceTo(moonC) + 2 * R_MOON_M) / RS) : 1);
    placeEarth();
    standing(alt < STANDING_M);
    measured(!flight || alt < MEASURED_M);
    spaceNow = flight ? Math.min(1, Math.max(0, (alt - 30e3) / (600e3 - 30e3))) : 0;
    const aloft = Math.min(1, Math.max(0, (alt - ALOFT_M) / (5000 - ALOFT_M)));
    if (aloft !== aloftNow) {
      aloftNow = aloft;
      applyLight();
    }
    expose();
  }
  /**
   * The measured ground draws below 450 km over the site; higher, its 200 km look the same as the globe's at a
   * pixel or two, and the globe shows the whole Moon, the pole too, with no seam round the measured patch.
   */
  function measured(on: boolean) {
    for (const g of ground) g.visible = on;
    globe?.setCut(on && hasGround);
  }
  /** Standing: the stand view's far skyline and the cap's mesh to 125 km; above, the mesh to 200 km and the globe beyond. */
  function standing(on: boolean) {
    if (skyline) skyline.visible = on || !flight;
    const coarse = ground[ground.length - 1];
    if (coarse && flight) (coarse.material as THREE.ShaderMaterial).uniforms.uFarCut.value = on ? STAND_REACH_M : GLOBE.CUT_M;
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
  function labels(): SkyLabels {
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
    // The lander's name over its top (high enough that the ray to it clears the lander itself), and its parts.
    const top = landerTop();
    const landerSpot = top ? spot(top) : null;
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
      return { text: m.text, ...at, visible: at.visible && guides.visible };
    });
    const k = skyGroup.scale.x;
    return { sun: bodySpot(skyWorld(sun.position), SUN_D * 3 * k), earth: bodySpot(earthPos, EARTH_R * 1.25 * k), stars, lander: landerSpot, parts, shadow, marks };
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

  /** Shows or hides the guides: hidden with the words, and in flight (the faint bands would cross the Moon). */
  const setGuides = (on: boolean) => {
    guides.visible = on;
  };

  return { root, camera, update, setView, setPose, setGuides, project, labels, exposure, dispose, starMaterial: starMat, parts: { guides, markers, ground, stars, earth, sun, glare, cross, lander: lander?.group ?? null, landerLight: lander?.lamp ?? null, landerFill: lander ? fillLight : null, boulders: rocks.group, pebbles, globe: globe?.mesh ?? null, sky: skyGroup, ring: skyline } };
}

/** A texture drawn on a canvas of the given size (repeating), or none outside a browser. */
function surface(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, colour = true): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (!g) return null;
  draw(g);
  const t = new THREE.CanvasTexture(cv);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Crinkled gold foil: a bright amber base with light and dark creases. */
const foilTexture = () =>
  surface(256, 256, (g) => {
    g.fillStyle = '#d9ab4a';
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 140; k++) {
      g.strokeStyle = rnd() > 0.5 ? `rgba(255,226,150,${0.25 + 0.3 * rnd()})` : `rgba(90,60,10,${0.2 + 0.3 * rnd()})`;
      g.lineWidth = 1 + 3 * rnd();
      g.beginPath();
      const x = rnd() * 256, y = rnd() * 256;
      g.moveTo(x, y);
      g.lineTo(x + (rnd() - 0.5) * 90, y + (rnd() - 0.5) * 90);
      g.stroke();
    }
  });

/** The back of the solar panel: a plain pale sheet in a thin frame with one spar, so it never reads as cells. */
const panelBackTexture = () =>
  surface(256, 192, (g) => {
    g.fillStyle = '#9fa1a6';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#6c6e73';
    g.fillRect(0, 0, 256, 5);
    g.fillRect(0, 187, 256, 5);
    g.fillRect(0, 0, 5, 192);
    g.fillRect(251, 0, 5, 192);
    g.fillRect(126, 0, 4, 192);
  });

/** Solar cells: dark blue squares between thin silver lines; the back of the panel is a grey frame. */
const cellsTexture = () =>
  surface(256, 192, (g) => {
    g.fillStyle = '#c9ccd2';
    g.fillRect(0, 0, 256, 192);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
      g.fillStyle = (r + c) % 3 === 0 ? '#16264a' : '#1b2d57';
      g.fillRect(4 + c * 31.5, 4 + r * 31, 28.5, 28);
      g.fillStyle = 'rgba(200,210,230,0.25)';
      g.fillRect(4 + c * 31.5, 4 + r * 31 + 13.5, 28.5, 1);
    }
  });

/**
 * A small solar lander, drawn for scale (not measured), from the numbers its shadow is cast from (LANDER):
 * an eight-sided gold foil body with the engine's bell beneath, four splayed legs on the diagonals with pads
 * and struts, a deck with instrument boxes, a camera and a white radiator, an upright solar panel facing the
 * Sun the view opens on, an antenna dish pointing at Earth, and a lamp whose colour shows its power. It
 * stands `distM` from the eye towards `azDeg`, turned so that its +x face looks towards `faceAzDeg`; its
 * local origin is the ground under its centre.
 */
function buildLander(azDeg: number, distM: number, faceAzDeg: number, earthAzDeg: number, earthElDeg: number) {
  const group = new THREE.Group();
  const a = azDeg * DEG;
  group.position.set(distM * Math.sin(a), 0, -distM * Math.cos(a));
  // Its +x face towards faceAzDeg: three's turn about y by θ points local +x at azimuth 90° − θ.
  group.rotation.y = (90 - faceAzDeg) * DEG;
  const foilMap = foilTexture();
  if (foilMap) {
    // Each of the eight faces shows half the crinkled sheet, not an eighth of it stretched.
    foilMap.wrapS = foilMap.wrapT = THREE.RepeatWrapping;
    foilMap.repeat.set(4, 1);
  }
  // Foil is shiny: it mirrors the black sky and the grey dust, and catches the Sun in bright creases.
  // Rough enough that a facet catching a low Sun shows a soft sheen rather than a bright line, which two
  // readers took for the power light.
  const foil = new THREE.MeshStandardMaterial({ name: 'foil', color: foilMap ? 0xffffff : 0xd4a640, map: foilMap, metalness: 0.75, roughness: 0.55 });
  // The pads are matte, so the feet do not sparkle.
  const pad = new THREE.MeshStandardMaterial({ name: 'pad', color: 0x8d8d88, metalness: 0.15, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa3a39e, metalness: 0.6, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xc9c7c2, metalness: 0.05, roughness: 0.8 });
  const cellMap = cellsTexture(), backMap = panelBackTexture();
  const cells = new THREE.MeshStandardMaterial({ color: cellMap ? 0xffffff : 0x1d2b4f, map: cellMap, metalness: 0.35, roughness: 0.28 });
  const panelBack = new THREE.MeshStandardMaterial({ color: backMap ? 0xffffff : 0xb9bcc2, map: backMap, metalness: 0.2, roughness: 0.6 });
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  /** A round rod from p to q. */
  const rod = (p: Vec3, q: Vec3, r: number, mat: THREE.Material) => {
    const P = new THREE.Vector3(...p), Q = new THREE.Vector3(...q);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, P.distanceTo(Q), 8), mat);
    m.position.copy(P).add(Q).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), P.clone().sub(Q).normalize());
    group.add(m);
    return m;
  };
  const L = LANDER;
  // The body: eight-sided (its flat faces towards ±x, ±z and the diagonals), gold foil, a dark base.
  const bodyH = L.body.y1 - L.body.y0;
  add(new THREE.Mesh(new THREE.CylinderGeometry(L.body.r, L.body.r, bodyH, 8, 1, false, Math.PI / 8), [foil, metal, dark]), 0, L.body.y0 + bodyH / 2, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(L.deck.r, L.deck.r, L.deck.y1 - L.deck.y0, 8, 1, false, Math.PI / 8), metal), 0, (L.deck.y0 + L.deck.y1) / 2, 0);
  const apothem = L.body.r * Math.cos(Math.PI / 8);
  // A white radiator on the -z face, and a dark band of thrusters round the top of the body.
  add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.03), white), 0, L.body.y0 + bodyH * 0.48, -apothem - 0.016);
  for (let k = 0; k < 4; k++) {
    const t = (k * 90 + 45) * DEG;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), dark), Math.sin(t) * (apothem + 0.05), L.body.y1 - 0.12, Math.cos(t) * (apothem + 0.05));
  }
  // The engine's bell under the body.
  const bell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, L.bell.r, L.bell.y1 - L.bell.y0, 20, 1, true), dark), 0, (L.bell.y0 + L.bell.y1) / 2, 0);
  bell.name = 'bell';
  // Legs on the diagonals with round pads, and a strut from each leg back to the body.
  for (const { top, foot } of LEG_ENDS) {
    rod(top, foot, L.legs.r, metal);
    const knee: Vec3 = [top[0] + (foot[0] - top[0]) * 0.5, top[1] + (foot[1] - top[1]) * 0.5, top[2] + (foot[2] - top[2]) * 0.5];
    rod(knee, [top[0] * 0.55, L.body.y0 + 0.05, top[2] * 0.55], 0.022, metal);
    add(new THREE.Mesh(new THREE.CylinderGeometry(L.legs.padR * 0.85, L.legs.padR, L.legs.padH, 18), pad), foot[0], L.legs.padH / 2, foot[2]);
  }
  // Instruments on the deck: a white box and a dark one, and a camera on a short mast.
  L.boxes.forEach((b, i) => add(new THREE.Mesh(new THREE.BoxGeometry(...b.size), i === 0 ? white : dark), ...b.c));
  rod([L.camera.x, L.deck.y1, L.camera.z], [L.camera.x, L.camera.y1, L.camera.z], L.camera.r, metal);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.13), dark), L.camera.x, L.camera.y1 + 0.05, L.camera.z);
  // The solar panel faces the opening Sun: local +z looks 90° right of local +x (faceAzDeg + 90), the Sun is
  // 70° left of local +x, so the panel turns 20° towards +x; its cells are on that +z side.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(...L.panel.size), [metal, metal, metal, metal, cells, panelBack]);
  panel.position.set(...L.panel.c);
  panel.rotation.y = L.panel.yawDeg * DEG;
  group.add(panel);
  rod([0, L.deck.y1, 0], [0, L.panel.c[1], 0], L.panel.mastR, metal);
  // The antenna: a mast, and a shallow dish with its feed, pointing at Earth.
  rod([L.antenna.x, L.deck.y1, L.antenna.z], [L.antenna.x, L.antenna.y1, L.antenna.z], L.antenna.r, metal);
  const bowl = Array.from({ length: 9 }, (_, k) => new THREE.Vector2(0.01 + (k / 8) * L.antenna.dishR, 0.11 * (k / 8) ** 2));
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xe9e8e4, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide });
  const dish = new THREE.Group();
  dish.add(new THREE.Mesh(new THREE.LatheGeometry(bowl, 28), dishMat));
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), metal);
  feed.position.y = 0.11;
  dish.add(feed);
  dish.position.set(L.antenna.x, L.antenna.y1 + 0.08, L.antenna.z);
  const e = dirAzEl(earthAzDeg, Math.max(0, earthElDeg));
  const toEarth = new THREE.Vector3(e[0], e[1], e[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), -group.rotation.y);
  dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toEarth);
  group.add(dish);
  // The power light, on the face that looks most nearly at the eye (the faces are 45 degrees apart; a
  // direction phi from +x towards +z looks at azimuth faceAzDeg + phi), so its name never points through the body.
  const phi = Math.round((((azDeg + 180 - faceAzDeg) % 360) + 360) % 360 / 45) * 45 * DEG;
  const lampPos = new THREE.Vector3(Math.cos(phi) * (apothem + 0.06), L.body.y0 + bodyH * 0.72, Math.sin(phi) * (apothem + 0.06));
  const lamp = new THREE.MeshBasicMaterial({ color: 0x46c98b });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), lamp), lampPos.x, lampPos.y, lampPos.z);
  return { group, lamp, panel, dish, lampPos };
}

/** The camera's exposure setting, before it stops down for bright ground (see the scene's exposure). */
const EXPOSURE = 1.05;

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
  /** The fence after the last frame, and how many times the view waited for it since the last frame. */
  private fence: WebGLSync | null = null;
  private waits = 0;
  private slow = 0;
  private frames = 0;
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
  private generation = 0;
  /** Whether the guides show (hidden with the words, and in flight). */
  private guides = true;

  constructor(canvas: HTMLCanvasElement, scene: StandScene) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, logarithmicDepthBuffer: true });
    this.pixelRatio = this.sharpRatio = this.drawnRatio = scene.quality === 'fast' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
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
    this.built.root.environment = pmrem.fromScene(envScene, 0).texture;
    pmrem.dispose();
    around.dispose();
    // A shader that fails shows only on its first use; then the view gives way to the fallback.
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      // The driver's own words on what failed, for whoever looks at the console.
      console.error('A shader of the view did not compile.', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs));
      this.onLost?.('A shader of the view did not compile');
    };
    // Shaders that fail to build reject `ready`, so the view gives way to the fallback rather than draw black.
    this.ready = this.renderer.compileAsync(this.built.root, this.built.camera).then(() => {
      this.compiled = true;
    });
    this.built.starMaterial.uniforms.uPx.value = this.pixelRatio;
    // Four samples per pixel in the composer's own target: smooth edges on Earth and the skyline.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.renderPass = new RenderPass(this.built.root, this.built.camera);
    this.composer.addPass(this.renderPass);
    // A tight bloom: the Sun's disc glows a little, the sky round it stays black.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.15, 0.985);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
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
    this.renderer.compileAsync(built.root, built.camera).then(
      () => {
        next.compiled = true;
      },
      () => this.onLost?.('A shader of the view did not compile'),
    );
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
    this.built.setGuides(this.guides);
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

  /** Draws the frame and sets a fence after it. */
  private draw() {
    // The camera stops down looking down-Sun at the sunlit ground (the output pass reads this exposure).
    this.renderer.toneMappingExposure = EXPOSURE * this.built.exposure();
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
    const key = `${where} ${this.hour.toFixed(4)} ${this.size.w}x${this.size.h} ${maps} ${this.generation} ${this.guides}`;
    const busy = this.busy(now);
    const mode = this.pacer.next(key, now, { fullWhileMoving: this.pixelRatio >= this.sharpRatio, busy });
    if (mode === 'idle') {
      if (busy) this.waits++;
      return;
    }
    if (mode === 'rest') {
      // The view has come to rest and the frame on the screen, drawn at full sharpness while it moved, is done.
      this.onSharp?.();
      return;
    }
    if (mode === 'sharp') {
      // The view has come to rest: one frame at full sharpness, which stays on the screen.
      this.drawAt(this.sharpRatio);
      this.draw();
      this.sharpSince = now;
      this.waits = 0;
      return;
    }
    if (this.drawnRatio !== this.pixelRatio) this.drawAt(this.pixelRatio);
    // A chip that keeps the view waiting (three looks or more a frame, about 50 ms) draws fewer pixels while
    // the view moves; the words and the numbers never change.
    this.frames++;
    if (this.waits >= 3 && this.frames > 10) this.slow++;
    else this.slow = Math.max(0, this.slow - 1);
    this.waits = 0;
    if (this.slow > 8 && this.pixelRatio > 0.45) {
      this.pixelRatio = Math.max(0.45, this.pixelRatio - 0.15);
      this.slow = 0;
      this.drawAt(this.pixelRatio);
    }
    this.draw();
  }

  labels(): SkyLabels {
    return this.built.labels();
  }

  /** Whether the frame on the screen is the sharp one for what it shows: the view has rested and that frame is done. */
  get resting(): boolean {
    return this.pacer.atRest && this.sharpSince === null;
  }

  /** A world point on the screen; with `moon`, hidden where the Moon stands between it and the camera. */
  project(world: Vec3, moon = false) {
    return this.built.project(world, moon);
  }

  /** Shows or hides the month's paths, the level horizon and the rings on hidden bodies. */
  setGuides(on: boolean) {
    this.guides = on;
    this.built.setGuides(on);
  }

  dispose() {
    if (this.fence) (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.fence);
    this.built.root.environment?.dispose();
    this.built.dispose();
    this.next?.built.dispose();
    this.bloom.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
