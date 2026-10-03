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
  /**
   * A lander drawn beside the site for scale: its direction and distance from the eye, its power hour by
   * hour, the direction its lit face looks (default 70° left of the first hour's Sun) and where its antenna
   * points (default the first hour's Earth).
   */
  lander?: { azDeg: number; distM: number; powered: ArrayLike<number>; faceAzDeg?: number; earthAzDeg?: number; earthElDeg?: number };
}

type Spot = { x: number; y: number; visible: boolean };
/** Where the labels go, as fractions of the view's width and height (y is the label's foot). */
export interface SkyLabels { sun: Spot; earth: Spot; stars: (Spot & { name: string })[]; lander: Spot | null }

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
        uLanderMin: { value: new THREE.Vector3() },
        uLanderMax: { value: new THREE.Vector3() },
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
      // The body, the deck and the panel; the light passes under the body, between the legs.
      u.uLanderMin.value.set(-0.95, 0.85, -0.95);
      u.uLanderMax.value.set(0.95, 3.35, 0.95);
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
      skyLight.intensity = 0.9 * v.sunFraction;
      earthLight.intensity = 0.03 + 0.5 * earthshine;
      const h = Math.min(scene.series.hours - 1, Math.max(0, Math.round(t)));
      lander.lamp.color.setHex(Number(scene.lander!.powered[h]) === 1 ? 0x46c98b : 0x000000);
    }
    // A camera's exposure: faint stars fade while the Sun is in view.
    starMat.uniforms.uGain.value = 1.6 - 1.25 * v.sunFraction;
  }

  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), ray = new THREE.Ray(), hit = new THREE.Vector3();
  /** Whether the lander stands between the eye and a world point. */
  const behindLander = (world: THREE.Vector3) => {
    if (!lander) return false;
    ray.set(camera.position, tmp.copy(world).sub(camera.position).normalize());
    return ray.intersectBox(landerBox, hit) !== null && hit.distanceTo(camera.position) < world.distanceTo(camera.position);
  };
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
    const x = (p.x + 1) / 2, y = (1 - p.y) / 2;
    const visible = ahead && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 && !behindLander(world);
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
    // The lander's name over its top (high enough that the ray to it clears the lander itself).
    const landerSpot = lander ? spot(new THREE.Vector3(lander.group.position.x, lander.group.position.y + 3.9, lander.group.position.z)) : null;
    return { sun: bodySpot(sun.position, SUN_D * 3), earth: bodySpot(earthPos, EARTH_R * 1.25), stars, lander: landerSpot };
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
 * A small solar lander, drawn for scale (not measured): a gold foil body on four splayed legs with
 * footpads and thrusters below, a deck with two payload boxes and a white radiator, a vertical solar
 * panel facing the Sun the view opens on, an antenna dish pointing at Earth, and a lamp whose colour shows
 * its power. It stands `distM` from the eye towards `azDeg`, turned so that its +x face looks towards
 * `faceAzDeg`; its local origin is the ground under its centre.
 */
function buildLander(azDeg: number, distM: number, faceAzDeg: number, earthAzDeg: number, earthElDeg: number) {
  const group = new THREE.Group();
  const a = azDeg * DEG;
  group.position.set(distM * Math.sin(a), 0, -distM * Math.cos(a));
  // Its +x face towards faceAzDeg: three's turn about y by θ points local +x at azimuth 90° − θ.
  group.rotation.y = (90 - faceAzDeg) * DEG;
  const foilMap = foilTexture();
  const foil = new THREE.MeshStandardMaterial({ color: foilMap ? 0xffffff : 0xd4a640, map: foilMap, metalness: 0.3, roughness: 0.42 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xa3a39e, metalness: 0.55, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, metalness: 0.4, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe9e8e4, metalness: 0.05, roughness: 0.7 });
  const cellMap = cellsTexture(), backMap = panelBackTexture();
  const cells = new THREE.MeshStandardMaterial({ color: cellMap ? 0xffffff : 0x1d2b4f, map: cellMap, metalness: 0.35, roughness: 0.28 });
  const panelBack = new THREE.MeshStandardMaterial({ color: backMap ? 0xffffff : 0xb9bcc2, map: backMap, metalness: 0.2, roughness: 0.6 });
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), foil), 0, 1.45, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.07, 1.72), metal), 0, 2.04, 0);
  // A white radiator on the -z side, two payload boxes and a camera on the deck.
  add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.03), white), 0, 1.45, -0.82);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.4), white), -0.45, 2.23, 0.45);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.35), dark), 0.5, 2.19, 0.5);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), metal), -0.6, 2.33, -0.55);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), dark), -0.6, 2.62, -0.55);
  // Legs with footpads, and a strut from each leg back to the body.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const top = new THREE.Vector3(0.72 * sx, 1.0, 0.72 * sz), foot = new THREE.Vector3(1.35 * sx, 0.06, 1.35 * sz);
    const knee = top.clone().lerp(foot, 0.55), base = new THREE.Vector3(0.78 * sx, 0.92, 0);
    for (const [p, q, r] of [[top, foot, 0.045], [knee, base, 0.025]] as [THREE.Vector3, THREE.Vector3, number][]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(r, r, p.distanceTo(q), 8), metal);
      rod.position.copy(p).add(q).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(q).normalize());
      group.add(rod);
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.06, 18), metal), foot.x, 0.04, foot.z);
  }
  // Thrusters under the body.
  for (const [x, z] of [[0, 0], [0.45, 0.45], [-0.45, -0.45]]) add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 14, 1, true), dark), x, 0.8, z).rotation.x = Math.PI;
  // The solar panel faces the opening Sun: local +z looks 90° right of local +x (faceAzDeg + 90), the Sun is
  // 70° left of local +x, so the panel turns 20° towards +x; its cells are on that +z side.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.25, 0.04), [metal, metal, metal, metal, cells, panelBack]);
  panel.position.y = 2.75;
  panel.rotation.y = 20 * DEG;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), metal), 0, 2.35, 0);
  group.add(panel);
  // The antenna: a mast, and a shallow dish with its feed, pointing at Earth.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), metal), 0.62, 2.55, -0.62);
  const bowl = Array.from({ length: 9 }, (_, k) => new THREE.Vector2(0.01 + (k / 8) * 0.34, 0.11 * (k / 8) ** 2));
  const dishMat = new THREE.MeshStandardMaterial({ color: 0xe9e8e4, metalness: 0.1, roughness: 0.55, side: THREE.DoubleSide });
  const dish = new THREE.Group();
  dish.add(new THREE.Mesh(new THREE.LatheGeometry(bowl, 28), dishMat));
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), metal);
  feed.position.y = 0.11;
  dish.add(feed);
  dish.position.set(0.62, 3.08, -0.62);
  const e = dirAzEl(earthAzDeg, Math.max(0, earthElDeg));
  const toEarth = new THREE.Vector3(e[0], e[1], e[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), -group.rotation.y);
  dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toEarth);
  group.add(dish);
  // The power light, on the side that looks towards the eye's side of the Sun.
  const lamp = new THREE.MeshBasicMaterial({ color: 0x46c98b });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), lamp), 0.82, 1.75, 0.3);
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
