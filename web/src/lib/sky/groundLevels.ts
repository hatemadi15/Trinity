import * as THREE from 'three';
import { R_MOON_M } from '../engine/constants';
import { BOULDERS } from './boulders';
import { GROUND_FRAG, GROUND_VERT } from './shaders';
import { SHADOW, SHADOW_FAST } from './shadowRule';
import { worldOf, type FieldLevel, type TerrainField } from './terrainField';

/*
 * The measured ground as the stand view and the arrival draw it: up to three levels as height textures (for the
 * shadows) and meshes (to see), each level's mesh a ring round the finer one, and in flight the cap's coarser ring
 * beyond them.
 */

const DEG = Math.PI / 180;
/**
 * The measured ground's reach standing (125 km, the far skyline beyond it) and in flight (205 km in the cap's own
 * cells, then a ring of cells twice as wide out to 460 km, cut round at 455 km where the globe takes over).
 */
export const STAND_REACH_M = 125000;
const FLIGHT_REACH_M = 205000, RING_REACH_M = 460000;
/** How far a level's mesh reaches from the site, by its cell size; the coarsest to 125 km, or 205 km in flight. The shadows read the whole level. */
const meshReachM = (cellM: number, coarsest: boolean, flight = false) => (coarsest ? (flight ? FLIGHT_REACH_M : STAND_REACH_M) : cellM <= 30 ? 5000 : cellM <= 200 ? 20500 : 125000);
/** The value stored for a cell outside the measured ground when heights go to the GPU as half floats. */
const HALF_OUTSIDE = -65000;

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

/** What the ground is built for: the drawing quality, whether the camera flies (the home page's arrival), half-float textures, and the drawn ground's height under the eye. */
export interface GroundOptions {
  fast: boolean;
  flight: boolean;
  halfFloat: boolean;
  viewerY: number;
}

/**
 * The measured ground's meshes, finest first, the cap last (with its coarser ring after it in flight), or flat ground on
 * the curved Moon for a field without levels. Every mesh shares the three height textures and reads its shadows from
 * its own level and the coarser ones.
 */
export function buildGround(field: TerrainField, o: GroundOptions): { meshes: THREE.Mesh[]; cap: THREE.Mesh | null; capRing: THREE.Mesh | null } {
  const { fast, flight, halfFloat } = o;
  const levels = field.levels;
  // The measured ground: up to three levels as height textures (for the shadows) and meshes (to see).
  const tex = [0, 1, 2].map((i) => heightTexture(levels[i], halfFloat));
  const lv = (i: number) => new THREE.Vector3(levels[i]?.siteCol ?? 0, levels[i]?.siteRow ?? 0, levels[i]?.cell ?? 1);
  const sz = (i: number) => new THREE.Vector2(levels[i]?.cols ?? 1, levels[i]?.rows ?? 1);
  const c = Math.cos(field.lonDeg * DEG), s = Math.sin(field.lonDeg * DEG);
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
        uViewer: { value: new THREE.Vector3(0, o.viewerY, 0) },
        uGrowth: { value: fast ? SHADOW_FAST.GROWTH : SHADOW.GROWTH },
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uEarth: { value: new THREE.Vector3(0, 1, 0) },
        uEarthshine: { value: 0 },
        uDetail: { value: detail && !fast ? 1 : 0 },
        uFarDetail: { value: fast ? 0 : 1 },
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
  // The cap's own mesh, and in flight the coarser ring round it.
  let cap: THREE.Mesh | null = null, capRing: THREE.Mesh | null = null;
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
      const { mesh, reachM } = groundMesh(l, field.lonDeg, meshReachM(l.cell, i === drawn.length - 1, flight), material(i === 0, hole, i));
      ground.push(mesh);
      // The next, coarser level starts two of this level's cells inside its edge: an overlap, never a gap.
      hole = Math.max(0, reachM - 2 * l.cell);
    });
    cap = ground[ground.length - 1];
    if (flight) {
      // From 900 km over the pole the view spans some 330 km each way: the cap goes on to 460 km in cells twice as
      // wide (a quarter of the vertices), so the month's sweep is all measured ground, sharper than the globe's
      // maps, whose rows bunch up at the pole.
      const l = drawn[drawn.length - 1], cols = Math.floor((l.cols - 1) / 2) + 1, rows = Math.floor((l.rows - 1) / 2) + 1;
      const heights = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = l.heights[2 * r * l.cols + 2 * c];
      const m = material(false, hole, drawn.length - 1);
      m.polygonOffset = true;
      m.polygonOffsetFactor += 1;
      m.polygonOffsetUnits += 4;
      capRing = groundMesh({ cols, rows, cell: 2 * l.cell, siteCol: l.siteCol / 2, siteRow: l.siteRow / 2, heights }, field.lonDeg, RING_REACH_M, m).mesh;
      ground.push(capRing);
    }
  }
  return { meshes: ground, cap, capRing };
}
