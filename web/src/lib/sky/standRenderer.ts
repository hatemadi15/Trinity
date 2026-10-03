import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SkyAssets } from '../data/sky';
import { R_MOON_M } from '../engine/constants';
import type { Series } from '../engine/metrics';
import { earthAxes, earthLitFraction } from './earth';
import { dirAzEl, enuBasis, meToWorld, type Vec3 } from './frames';
import { moonMatrixAt } from './moonOrientation';
import { EARTH_FRAG, EARTH_VERT, GROUND_FRAG, GROUND_VERT, STAR_FRAG, STAR_VERT } from './shaders';
import { FramePacer } from './framePacer';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { placeStars, starColour, starGain, starSize } from './stars';
import { LANDER, LEG_ENDS } from './landerShape';
import { heightAt, worldOf, type FieldLevel, type TerrainField } from './terrainField';

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
}

type Spot = { x: number; y: number; visible: boolean };
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
  /** Your own shadow while any of the Sun is up: a spot 15 m along it, and its length in metres. */
  shadow?: (Spot & { lengthM: number }) | null;
}

const DEG = Math.PI / 180;
/** The sky sphere and the far skyline ring, metres from the eye. */
const RS = 300000, RING = 200000;
const SUN_D = 2 * RS * Math.tan(0.2665 * DEG), EARTH_R = RS * Math.tan(0.95 * DEG);
/** How far a level's mesh reaches from the site, by its cell size; the coarsest always to 125 km. The shadows read the whole level. */
const meshReachM = (cellM: number, coarsest: boolean) => (coarsest ? 125000 : cellM <= 30 ? 5000 : cellM <= 200 ? 20500 : 125000);
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
  const eye = heightAt(scene.field, 0, 0) + scene.mastM;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 700000);
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
        uViewer: { value: new THREE.Vector3(0, eye - scene.mastM, 0) },
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
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      polygonOffset: level > 0,
      polygonOffsetFactor: level,
      polygonOffsetUnits: level * 4,
    });
  const ground: THREE.Mesh[] = [];
  if (levels.length === 0) {
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
      const { mesh, reachM } = groundMesh(l, scene.field.lonDeg, meshReachM(l.cell, i === drawn.length - 1), material(i === 0, hole, i));
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
  root.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));

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
  root.add(stars);
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
    root.add(cross);
  }

  // The Sun: white, small and hard, with only a small glow close round the disc: with no air there is no
  // halo across the sky and no starburst, only what a lens adds right at the disc.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, '#fff'], [0.46, '#fff'], [0.5, 'rgba(255,255,255,0)']]), color: new THREE.Color(14, 14, 13.5), transparent: true, depthWrite: false, toneMapped: false }));
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,255,255,0.5)'], [0.12, 'rgba(240,244,255,0.16)'], [0.45, 'rgba(220,230,255,0.025)'], [1, 'rgba(0,0,0,0)']]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sun.scale.setScalar(SUN_D * 2.05);
  glare.scale.setScalar(SUN_D * 6);
  root.add(sun, glare);

  // Earth: NASA's Blue Marble and clouds, 1.9° wide, lit by the Sun and turned for the hour.
  const earthMat = new THREE.ShaderMaterial({ uniforms: { uDay: { value: null }, uClouds: { value: null }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uMaps: { value: 0 } }, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  if (typeof document !== 'undefined') {
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const done = () => { if (++loaded === 2) earthMat.uniforms.uMaps.value = 1; };
    const day = loader.load(scene.sky.earthDayUrl, done);
    day.colorSpace = THREE.SRGBColorSpace;
    day.anisotropy = 4;
    const clouds = loader.load(scene.sky.earthCloudsUrl, done);
    clouds.anisotropy = 4;
    earthMat.uniforms.uDay.value = day;
    earthMat.uniforms.uClouds.value = clouds;
  }
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 96, 48), earthMat);
  earth.matrixAutoUpdate = false;
  root.add(earth);

  // A lander beside the site, for scale: gold foil body, solar panel, legs, an antenna and a light that shows its power.
  const ls = scene.lander;
  const lander = ls
    ? buildLander(ls.azDeg, ls.distM, ls.faceAzDeg ?? (scene.series.sunAz[0] - 70 + 360) % 360, ls.earthAzDeg ?? scene.series.earthAz[0], ls.earthElDeg ?? scene.series.earthEl[0])
    : null;
  const landerBox = new THREE.Box3();
  // The Sun; the sunlit dust's light from below, which fills the lander's shaded sides (as in the Apollo
  // photographs); and Earth's faint blue light.
  const sunLight = new THREE.DirectionalLight(0xffffff, 0), skyLight = new THREE.HemisphereLight(0x0a0a0c, 0x8a857c, 0), earthLight = new THREE.AmbientLight(0x8aa7ff, 0);
  if (lander) {
    const lx = lander.group.position.x, lz = lander.group.position.z, ly = heightAt(scene.field, lx, lz);
    lander.group.position.y = ly;
    root.add(lander.group, sunLight, sunLight.target, skyLight, earthLight);
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

  const startMs = Date.parse(scene.startUtc + 'Z');
  // A camera's exposure: faint stars fade while the Sun is in view, and come out again as the view looks up,
  // away from the dazzling ground.
  let sunNow = 0, sunElNow = 0, pitchNow = 0;
  const expose = () => {
    const day = 1.6 - 1.25 * sunNow, up = Math.min(1, Math.max(0, (pitchNow - 15) / 20));
    starMat.uniforms.uGain.value = day + (1.6 - day) * up * up * (3 - 2 * up);
  };
  const sunDir = new THREE.Vector3(), earthPos = new THREE.Vector3();
  function update(t: number) {
    const v = sampleSeries(scene.series, t);
    const sd = dirAzEl(v.sunAz, v.sunEl), ed = dirAzEl(v.earthAz, v.earthEl);
    sunDir.set(...sd);
    sun.position.set(sd[0] * RS, sd[1] * RS + eye, sd[2] * RS);
    glare.position.copy(sun.position);
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
    const ax = earthAxes(m, basis, when);
    earthPos.set(ed[0] * RS, ed[1] * RS + eye, ed[2] * RS);
    earth.matrix.makeBasis(new THREE.Vector3(...ax.x), new THREE.Vector3(...ax.y), new THREE.Vector3(...ax.z)).setPosition(earthPos);
    earth.matrixWorldNeedsUpdate = true;
    earthMat.uniforms.uSun.value.set(...sd);
    const full = earthLitFraction(sd as Vec3, ed as Vec3);
    // Earthlight on the ground; when the Sun is hidden the view is exposed like a long photograph, so it shows.
    const earthshine = v.earthEl > -0.5 ? 0.25 * full * (1 + 3 * (1 - v.sunFraction)) : 0;
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uSun.value.set(...sd);
      u.uEarth.value.set(...ed);
      u.uEarthshine.value = earthshine;
      u.uSunUp.value = v.sunFraction;
    }
    if (lander) {
      sunLight.position.copy(sunLight.target.position).addScaledVector(sunDir, 50);
      sunLight.intensity = 3.2 * v.sunFraction;
      // The dust lights the lander's shaded side only faintly at a Sun this low: it stands nearly in silhouette.
      skyLight.intensity = 0.4 * v.sunFraction;
      // A faint floor: with neither the Sun nor Earth up the lander's shape still shows.
      earthLight.intensity = 0.15 + 0.5 * earthshine;
      const h = Math.min(scene.series.hours - 1, Math.max(0, Math.round(t)));
      lander.lamp.color.setHex(Number(scene.lander!.powered[h]) === 1 ? 0x46c98b : 0x000000);
    }
    sunNow = v.sunFraction;
    sunElNow = v.sunEl;
    expose();
    // What the lander's foil and metal mirror (the sunlit dust below) dims with the Sun.
    root.environmentIntensity = 0.08 + 0.42 * v.sunFraction;
  }

  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), ray = new THREE.Ray(), hit = new THREE.Vector3();
  /** Whether the lander stands between the eye and a world point. */
  const behindLander = (world: THREE.Vector3) => {
    if (!lander) return false;
    ray.set(camera.position, tmp.copy(world).sub(camera.position).normalize());
    return ray.intersectBox(landerBox, hit) !== null && hit.distanceTo(camera.position) < world.distanceTo(camera.position);
  };
  function setView(yawDeg: number, pitchDeg: number, fovDeg: number, aspect: number) {
    pitchNow = pitchDeg;
    expose();
    camera.fov = fovDeg;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const d = dirAzEl(yawDeg, pitchDeg);
    camera.lookAt(d[0], eye + d[1], d[2]);
    camera.updateMatrixWorld();
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
  /** A body's label: over the body, or resting on the skyline where the body is hidden below it. */
  function bodySpot(world: THREE.Vector3, radius: number): Spot {
    const d = tmp.copy(world).sub(camera.position).normalize();
    const az = ((Math.atan2(d.x, -d.z) / DEG) % 360 + 360) % 360, el = Math.asin(d.y) / DEG, sky = maskAt(az);
    if (el >= sky) return spot(world, radius);
    const s = dirAzEl(az, sky + 0.4);
    return spot(new THREE.Vector3(s[0] * 30000, eye + s[1] * 30000, s[2] * 30000));
  }
  function labels(): SkyLabels {
    // The brightest stars by name, where they stand above the skyline.
    const stars = (scene.sky.names ?? []).map(({ index, name }) => {
      const w = new THREE.Vector3(starPos[index * 3], starPos[index * 3 + 1], starPos[index * 3 + 2]);
      const d = w.clone().normalize();
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
      const s = spot(mid);
      stars.push({ name: 'Southern Cross', ...s, y: s.y + 0.03, visible: s.visible && el > maskAt(az) });
    }
    // The lander's name over its top (high enough that the ray to it clears the lander itself), and its parts.
    const landerSpot = lander ? spot(new THREE.Vector3(lander.group.position.x, lander.group.position.y + 3.9, lander.group.position.z)) : null;
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
      const away = new THREE.Vector3(-sunDir.x, 0, -sunDir.z).normalize().multiplyScalar(15);
      const at = spot(new THREE.Vector3(away.x, heightAt(scene.field, away.x, away.z) + 0.05, away.z), 0, false);
      shadow = { ...at, lengthM: Math.min(500, 1.8 / Math.tan(Math.max(0.2, sunElNow) * DEG)) };
    }
    return { sun: bodySpot(sun.position, SUN_D * 3), earth: bodySpot(earthPos, EARTH_R * 1.25), stars, lander: landerSpot, parts, shadow };
  }

  const dispose = () => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const mat of mats) {
        for (const value of Object.values(mat as unknown as Record<string, unknown>)) if (value instanceof THREE.Texture) value.dispose();
        if (mat instanceof THREE.ShaderMaterial) for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture) u.value.dispose();
        mat.dispose();
      }
    });
  };

  return { root, camera, update, setView, labels, dispose, starMaterial: starMat, parts: { ground, stars, earth, sun, glare, cross, lander: lander?.group ?? null, landerLight: lander?.lamp ?? null, landerFill: lander ? earthLight : null } };
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

/** Crinkled gold foil: a warm base with light and dark creases. */
const foilTexture = () =>
  surface(256, 256, (g) => {
    g.fillStyle = '#c99a3c';
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

/** The back of the solar panel: a light grey sheet on a darker frame of struts. */
const panelBackTexture = () =>
  surface(256, 192, (g) => {
    g.fillStyle = '#b9bcc2';
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#6f737b';
    for (const x of [0, 84, 170, 248]) g.fillRect(x, 0, 8, 192);
    for (const y of [0, 92, 184]) g.fillRect(0, y, 256, 8);
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
  const foil = new THREE.MeshStandardMaterial({ color: foilMap ? 0xffffff : 0xd4a640, map: foilMap, metalness: 0.45, roughness: 0.38 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa3a39e, metalness: 0.6, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2c2e, metalness: 0.5, roughness: 0.55, side: THREE.DoubleSide });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e8e4, metalness: 0.05, roughness: 0.7 });
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
    add(new THREE.Mesh(new THREE.CylinderGeometry(L.legs.padR * 0.85, L.legs.padR, L.legs.padH, 18), metal), foot[0], L.legs.padH / 2, foot[2]);
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
  // The power light, on the +x face (towards the eye's side of the Sun).
  const lamp = new THREE.MeshBasicMaterial({ color: 0x46c98b });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), lamp), apothem + 0.04, L.body.y0 + bodyH * 0.72, 0.28);
  return { group, lamp, panel, dish, lampPos: new THREE.Vector3(apothem + 0.04, L.body.y0 + bodyH * 0.72, 0.28) };
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

  constructor(canvas: HTMLCanvasElement, scene: StandScene) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, logarithmicDepthBuffer: true });
    this.pixelRatio = this.sharpRatio = this.drawnRatio = scene.quality === 'fast' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Heights go to the GPU as float32 where it can filter them, else as half floats.
    this.built = buildScene(scene, { halfFloat: !this.renderer.extensions.has('OES_texture_float_linear') });
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
    const built = () => {
      this.compiled = true;
    };
    this.ready = this.renderer.compileAsync(this.built.root, this.built.camera).then(built, built);
    this.built.starMaterial.uniforms.uPx.value = this.pixelRatio;
    // Four samples per pixel in the composer's own target: smooth edges on Earth and the skyline.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.built.root, this.built.camera));
    // A tight bloom: the Sun's disc glows a little, the sky round it stays black.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.2, 0.985);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setTime(hour: number) {
    this.hour = hour;
    this.built.update(hour);
  }

  setView(yawDeg: number, pitchDeg: number, fovDeg: number) {
    this.view = { yaw: yawDeg, pitch: pitchDeg, fov: fovDeg };
    this.built.setView(yawDeg, pitchDeg, fovDeg, this.size.w / this.size.h);
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
    this.setView(this.view.yaw, this.view.pitch, this.view.fov);
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
    }
    return false;
  }

  /** Draws the frame and sets a fence after it. */
  private draw() {
    this.composer.render();
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  }

  render() {
    if (!this.compiled) return;
    const now = performance.now();
    const maps = (this.built.parts.earth.material as THREE.ShaderMaterial).uniforms.uMaps.value;
    const v = this.view;
    const key = `${v.yaw.toFixed(3)} ${v.pitch.toFixed(3)} ${v.fov.toFixed(3)} ${this.hour.toFixed(4)} ${this.size.w}x${this.size.h} ${maps}`;
    const busy = this.busy(now);
    const mode = this.pacer.next(key, now, { fullWhileMoving: this.pixelRatio >= this.sharpRatio, busy });
    if (mode === 'idle') {
      if (busy) this.waits++;
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

  dispose() {
    if (this.fence) (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.fence);
    this.built.root.environment?.dispose();
    this.built.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
