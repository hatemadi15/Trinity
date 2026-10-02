import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SkyAssets } from '../data/sky';
import { R_MOON_M } from '../engine/constants';
import type { Series } from '../engine/metrics';
import { earthAxes, earthLitFraction } from './earth';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { moonMatrixAt } from './moonOrientation';
import { EARTH_FRAG, EARTH_VERT, GROUND_FRAG, GROUND_VERT, STAR_FRAG, STAR_VERT } from './shaders';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { placeStars, starColour, starGain, starSize } from './stars';
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
  /** A lander drawn beside the site for scale: its direction and distance from the eye, and its power hour by hour. */
  lander?: { azDeg: number; distM: number; powered: ArrayLike<number> };
}

type Spot = { x: number; y: number; visible: boolean };
/** Where the labels go, as fractions of the view's width and height (y is the label's foot). */
export interface SkyLabels { sun: Spot; earth: Spot; compass: (Spot & { letter: 'N' | 'E' | 'S' | 'W' })[]; stars: (Spot & { name: string })[] }

const DEG = Math.PI / 180;
/** The sky sphere and the far skyline ring, metres from the eye. */
const RS = 300000, RING = 200000;
const SUN_D = 2 * RS * Math.tan(0.2665 * DEG), EARTH_R = RS * Math.tan(0.95 * DEG);
/** How far a level's mesh reaches from the site, by its cell size; the coarsest always to 125 km. The shadows read the whole level. */
const meshReachM = (cellM: number, coarsest: boolean) => (coarsest ? 125000 : cellM <= 30 ? 5000 : cellM <= 200 ? 20500 : 125000);
/** The value stored for a cell outside the measured ground when heights go to the GPU as half floats. */
const HALF_OUTSIDE = -65000;

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
  const c0 = Math.max(2, sc - n), c1 = Math.min(l.cols - 3, sc + n), r0 = Math.max(2, sr - n), r1 = Math.min(l.rows - 3, sr + n);
  const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
  const pos = new Float32Array(cols * rows * 3), nor = new Float32Array(cols * rows * 3);
  const h = (r: number, c: number) => l.heights[r * l.cols + c];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = (r - r0) * cols + (c - c0), mx = (c - l.siteCol) * l.cell, my = -(r - l.siteRow) * l.cell, w = worldOf(lonDeg, mx, my);
      pos[k * 3] = w.x;
      pos[k * 3 + 1] = h(r, c);
      pos[k * 3 + 2] = w.z;
      // Slopes over two cells each way: the grids' single-row seams do not ripple the light.
      const gx = (h(r, c + 2) + h(r, c + 1) - h(r, c - 1) - h(r, c - 2)) / (6 * l.cell), gy = (h(r - 2, c) + h(r - 1, c) - h(r + 1, c) - h(r + 2, c)) / (6 * l.cell);
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
  const material = (detail: boolean, hole: number, offset: number) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uH0: { value: tex[0] }, uH1: { value: tex[1] }, uH2: { value: tex[2] },
        uL0: { value: lv(0) }, uL1: { value: lv(1) }, uL2: { value: lv(2) },
        uS0: { value: sz(0) }, uS1: { value: sz(1) }, uS2: { value: sz(2) },
        uCS: { value: new THREE.Vector2(c, s) },
        uLevels: { value: Math.min(3, levels.length) },
        uSteps: { value: fast ? SHADOW_FAST.STEPS : SHADOW.STEPS },
        uGrowth: { value: fast ? SHADOW_FAST.GROWTH : SHADOW.GROWTH },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uEarth: { value: new THREE.Vector3(0, 1, 0) },
        uEarthshine: { value: 0 },
        uDetail: { value: detail && !fast ? 1 : 0 },
        uSunPower: { value: 3.4 },
        uHole: { value: new THREE.Vector2(hole, hole) },
        uLanderOn: { value: 0 },
        uLanderMin: { value: new THREE.Vector3() },
        uLanderMax: { value: new THREE.Vector3() },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      polygonOffset: offset > 0,
      polygonOffsetFactor: offset,
      polygonOffsetUnits: offset * 4,
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

  // The Sun: white, small and hard, as a camera on the Moon sees it; glare and a faint six-spike flare.
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, '#fff'], [0.46, '#fff'], [0.5, 'rgba(255,255,255,0)']]), color: new THREE.Color(14, 14, 13.5), transparent: true, depthWrite: false, toneMapped: false }));
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, 'rgba(255,255,255,0.55)'], [0.06, 'rgba(240,244,255,0.2)'], [0.3, 'rgba(220,230,255,0.035)'], [1, 'rgba(0,0,0,0)']]), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const spikes = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: canvasTexture((g) => {
        g.translate(256, 256);
        for (let k = 0; k < 6; k++) {
          g.rotate(Math.PI / 3);
          const grd = g.createLinearGradient(0, 0, 250, 0);
          grd.addColorStop(0, 'rgba(255,255,255,0.5)');
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd;
          g.fillRect(0, -1.2, 250, 2.4);
        }
      }),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  sun.scale.setScalar(SUN_D * 2.05);
  glare.scale.setScalar(SUN_D * 34);
  spikes.scale.setScalar(SUN_D * 26);
  root.add(sun, glare, spikes);

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
  const lander = scene.lander ? buildLander(scene.lander.azDeg, scene.lander.distM, scene.series.sunAz[0]) : null;
  const sunLight = new THREE.DirectionalLight(0xffffff, 0), skyLight = new THREE.HemisphereLight(0x8aa7ff, 0x0b0b0b, 0);
  if (lander) {
    const lx = lander.group.position.x, lz = lander.group.position.z, ly = heightAt(scene.field, lx, lz);
    lander.group.position.y = ly;
    root.add(lander.group, sunLight, sunLight.target, skyLight);
    sunLight.target.position.set(lx, ly + 1.5, lz);
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uLanderOn.value = 1;
      u.uLanderMin.value.set(lx - 0.9, ly + 0.9, lz - 0.9);
      u.uLanderMax.value.set(lx + 0.9, ly + 3.2, lz + 0.9);
    }
  }

  const startMs = Date.parse(scene.startUtc + 'Z');
  const sunDir = new THREE.Vector3(), earthPos = new THREE.Vector3();
  function update(t: number) {
    const v = sampleSeries(scene.series, t);
    const sd = dirAzEl(v.sunAz, v.sunEl), ed = dirAzEl(v.earthAz, v.earthEl);
    sunDir.set(...sd);
    sun.position.set(sd[0] * RS, sd[1] * RS + eye, sd[2] * RS);
    glare.position.copy(sun.position);
    spikes.position.copy(sun.position);
    // The glare comes from the part of the disc the hills leave in view.
    (glare.material as THREE.SpriteMaterial).opacity = v.sunFraction;
    (spikes.material as THREE.SpriteMaterial).opacity = 0.55 * v.sunFraction;
    const when = startMs + t * 3600e3;
    const m = moonMatrixAt(scene.sky.moon, when);
    placeStars(st, m, basis, RS, starPos);
    starGeo.getAttribute('position').needsUpdate = true;
    const ax = earthAxes(m, basis, when);
    earthPos.set(ed[0] * RS, ed[1] * RS + eye, ed[2] * RS);
    earth.matrix.makeBasis(new THREE.Vector3(...ax.x), new THREE.Vector3(...ax.y), new THREE.Vector3(...ax.z)).setPosition(earthPos);
    earth.matrixWorldNeedsUpdate = true;
    earthMat.uniforms.uSun.value.set(...sd);
    const full = earthLitFraction(sd as Vec3, ed as Vec3);
    // Earthlight on the ground; when the Sun is hidden the view is exposed like a long photograph, so it shows.
    const earthshine = v.earthEl > -0.5 ? 0.25 * full * (1 + 4 * (1 - v.sunFraction)) : 0;
    for (const g of ground) {
      const u = (g.material as THREE.ShaderMaterial).uniforms;
      u.uSun.value.set(...sd);
      u.uEarth.value.set(...ed);
      u.uEarthshine.value = earthshine;
    }
    if (lander) {
      sunLight.position.copy(sunLight.target.position).addScaledVector(sunDir, 50);
      sunLight.intensity = 3.2 * v.sunFraction;
      skyLight.intensity = 0.02 + 0.6 * earthshine;
      const h = Math.min(scene.series.hours - 1, Math.max(0, Math.round(t)));
      lander.lamp.color.setHex(Number(scene.lander!.powered[h]) === 1 ? 0x46c98b : 0x000000);
    }
    // A camera's exposure: faint stars fade while the Sun is in view.
    starMat.uniforms.uGain.value = 1.6 - 1.25 * v.sunFraction;
  }

  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  function setView(yawDeg: number, pitchDeg: number, fovDeg: number, aspect: number) {
    camera.fov = fovDeg;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const d = dirAzEl(yawDeg, pitchDeg);
    camera.lookAt(d[0], eye + d[1], d[2]);
    camera.updateMatrixWorld();
  }
  /** A world point on the screen; `radius` lifts the spot above a body's disc (metres at the body). */
  function spot(world: THREE.Vector3, radius = 0): Spot {
    camera.getWorldDirection(fwd);
    const ahead = tmp.copy(world).sub(camera.position).dot(fwd) > 0;
    const p = tmp.copy(world).project(camera);
    const visible = ahead && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
    const lift = radius > 0 ? radius / world.distanceTo(camera.position) / Math.tan((camera.fov * DEG) / 2) / 2 : 0;
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 - lift, visible };
  }
  function labels(): SkyLabels {
    const compass = (['N', 'E', 'S', 'W'] as const).map((letter, k) => {
      const d = dirAzEl(k * 90, maskAt(k * 90) + 1);
      return { letter, ...spot(new THREE.Vector3(d[0] * 30000, eye + d[1] * 30000, d[2] * 30000)) };
    });
    // The brightest stars by name, where they stand above the skyline.
    const stars = (scene.sky.names ?? []).map(({ index, name }) => {
      const w = new THREE.Vector3(starPos[index * 3], starPos[index * 3 + 1], starPos[index * 3 + 2]);
      const d = w.clone().normalize();
      const az = ((Math.atan2(d.x, -d.z) / DEG) % 360 + 360) % 360, el = Math.asin(d.y) / DEG;
      const s = spot(w);
      return { name, ...s, visible: s.visible && el > maskAt(az) };
    });
    return { sun: spot(sun.position, SUN_D * 3), earth: spot(earthPos, EARTH_R * 1.25), compass, stars };
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

  return { root, camera, update, setView, labels, dispose, starMaterial: starMat, parts: { ground, stars, earth, sun, glare, lander: lander?.group ?? null, landerLight: lander?.lamp ?? null } };
}

/**
 * A small solar lander, drawn for scale (not measured): a gold foil body on four legs, a deck, a vertical
 * solar panel facing `panelAzDeg`, an antenna, and a lamp whose colour shows its power. It stands `distM`
 * from the eye towards `azDeg`; its local origin is the ground under its centre.
 */
function buildLander(azDeg: number, distM: number, panelAzDeg: number) {
  const group = new THREE.Group();
  const a = azDeg * DEG;
  group.position.set(distM * Math.sin(a), 0, -distM * Math.cos(a));
  const foil = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 0.35, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9a9a96, metalness: 0.5, roughness: 0.55 });
  const cells = new THREE.MeshStandardMaterial({ color: 0x1d2b4f, metalness: 0.4, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.5), foil);
  body.position.y = 1.4;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.6), metal);
  deck.position.y = 1.93;
  group.add(body, deck);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const top = new THREE.Vector3(0.7 * sx, 0.95, 0.7 * sz), foot = new THREE.Vector3(1.2 * sx, 0.05, 1.2 * sz);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, top.distanceTo(foot), 8), metal);
    leg.position.copy(top).add(foot).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), metal);
    pad.position.copy(foot);
    group.add(leg, pad);
  }
  const p = panelAzDeg * DEG;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.04), cells);
  panel.position.y = 2.6;
  panel.rotation.y = Math.atan2(Math.sin(p), -Math.cos(p));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), metal);
  mast.position.set(0.6, 2.5, -0.6);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.08, 0.06, 20), metal);
  dish.position.set(0.6, 3.07, -0.6);
  const lamp = new THREE.MeshBasicMaterial({ color: 0x46c98b });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lamp);
  light.position.set(0.76, 1.75, 0.76);
  group.add(panel, mast, dish, light);
  return { group, lamp };
}

/** The WebGL side: the renderer, bloom for the Sun, and a pixel-ratio step down when frames come slowly. Throws without WebGL 2. */
export class StandRenderer {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private built: ReturnType<typeof buildScene>;
  private size = { w: 1, h: 1 };
  private view = { yaw: 0, pitch: 0, fov: 60 };
  private pixelRatio: number;
  private last = 0;
  private slow = 0;
  private frames = 0;

  constructor(canvas: HTMLCanvasElement, scene: StandScene) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL 2 is not available');
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, logarithmicDepthBuffer: true });
    this.pixelRatio = scene.quality === 'fast' ? 0.75 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Heights go to the GPU as float32 where it can filter them, else as half floats.
    this.built = buildScene(scene, { halfFloat: !this.renderer.extensions.has('OES_texture_float_linear') });
    this.built.starMaterial.uniforms.uPx.value = this.pixelRatio;
    // Four samples per pixel in the composer's own target: smooth edges on Earth and the skyline.
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(this.built.root, this.built.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.45, 0.985);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setTime(hour: number) {
    this.built.update(hour);
  }

  setView(yawDeg: number, pitchDeg: number, fovDeg: number) {
    this.view = { yaw: yawDeg, pitch: pitchDeg, fov: fovDeg };
    this.built.setView(yawDeg, pitchDeg, fovDeg, this.size.w / this.size.h);
  }

  resize(w: number, h: number) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.size.w, this.size.h);
    this.bloom.setSize(this.size.w, this.size.h);
    this.setView(this.view.yaw, this.view.pitch, this.view.fov);
  }

  render() {
    const now = performance.now();
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    this.frames++;
    // If frames keep coming slowly, draw fewer pixels; the words and the numbers never change.
    if (dt > 0.045 && this.frames > 30) this.slow++;
    else this.slow = Math.max(0, this.slow - 1);
    if (this.slow > 20 && this.pixelRatio > 0.6) {
      this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.2);
      this.built.starMaterial.uniforms.uPx.value = this.pixelRatio;
      this.slow = 0;
      this.resize(this.size.w, this.size.h);
    }
    this.composer.render();
  }

  labels(): SkyLabels {
    return this.built.labels();
  }

  dispose() {
    this.built.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
