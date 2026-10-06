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
/**
 * A mesh's round edge (17.2): its own ground to `ringIn`, the next level's light and shadows fully from `ringOut`, cut
 * round at `cut`, two cells inside its nearest side; the next level's round hole opens at `ringOut`, so the two overlap
 * by a cell. The ring inside the cut is a quarter of the reach.
 */
export function edgeOf(reachM: number, cellM: number): { ringIn: number; ringOut: number; cut: number } {
  const cut = reachM - 2 * cellM;
  return { ringIn: 0.75 * cut, ringOut: cut - cellM, cut };
}
/** A mesh with no edge to fade into: the last level and the cap's ring (their far edge is uFarCut's); never cut, never faded. */
const NO_EDGE = new THREE.Vector3(1e9, 2e9, 3e9);

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
 * the curved Moon for a field without levels. Each mesh reads its shadows and its light from its own three height
 * slots: its level, the next one, and the cap last (one texture a level, shared).
 */
export function buildGround(field: TerrainField, o: GroundOptions): { meshes: THREE.Mesh[]; cap: THREE.Mesh | null; capRing: THREE.Mesh | null } {
  const { fast, flight, halfFloat } = o;
  const levels = field.levels;
  // One height texture a level, shared by every mesh that reads it, and a 1-by-1 stand-in for an empty slot.
  const textures = new Map<FieldLevel, THREE.DataTexture>();
  const none = heightTexture(undefined, false);
  const texOf = (l: FieldLevel | undefined) => {
    if (!l) return none;
    let t = textures.get(l);
    if (!t) textures.set(l, (t = heightTexture(l, halfFloat)));
    return t;
  };
  const lv = (l: FieldLevel | undefined) => new THREE.Vector3(l?.siteCol ?? 0, l?.siteRow ?? 0, l?.cell ?? 1);
  const sz = (l: FieldLevel | undefined) => new THREE.Vector2(l?.cols ?? 1, l?.rows ?? 1);
  const c = Math.cos(field.lonDeg * DEG), s = Math.sin(field.lonDeg * DEG);
  /**
   * A mesh's material. `slots` are the levels its shadows and its light read: its own level first, then the next, then
   * the cap, so far hills always shade it and it never meets finer heights it does not show. `order` places it over
   * the coarser meshes under it. `pixel`: its light from per-pixel slopes of its own heights (the flight level, whose
   * mesh at every other cell would soften the relief).
   */
  const material = (detail: boolean, holeR: number, order: number, slots: FieldLevel[], pixel = false) =>
    new THREE.ShaderMaterial({
      uniforms: {
        uH0: { value: texOf(slots[0]) }, uH1: { value: texOf(slots[1]) }, uH2: { value: texOf(slots[2]) },
        uL0: { value: lv(slots[0]) }, uL1: { value: lv(slots[1]) }, uL2: { value: lv(slots[2]) },
        uS0: { value: sz(slots[0]) }, uS1: { value: sz(slots[1]) }, uS2: { value: sz(slots[2]) },
        uCS: { value: new THREE.Vector2(c, s) },
        uLevels: { value: slots.length },
        uPixel: { value: pixel ? 1 : 0 },
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
        uHoleR: { value: holeR },
        uEdge: { value: NO_EDGE.clone() },
        uNextStep: { value: 2 },
        uLanderOn: { value: 0 },
        uLanderCenter: { value: new THREE.Vector3() },
        uLanderCS: { value: new THREE.Vector2(1, 0) },
        uSunUp: { value: 0 },
        uRocks: { value: Array.from({ length: BOULDERS.MAX }, () => new THREE.Vector4()) },
        uRockCount: { value: 0 },
        uBounce: { value: 0.015 },
        uNight: { value: 0 },
        uFarCut: { value: 1e9 },
        uRingShadows: { value: 1 },
      },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      polygonOffset: order > 0,
      polygonOffsetFactor: order,
      polygonOffsetUnits: order * 4,
    });
  /** A level at every other cell (a quarter of the vertices): the cap's ring, and the flight level's mesh. */
  const half = (l: FieldLevel): FieldLevel => {
    const cols = Math.floor((l.cols - 1) / 2) + 1, rows = Math.floor((l.rows - 1) / 2) + 1;
    const heights = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) heights[r * cols + k] = l.heights[2 * r * l.cols + 2 * k];
    return { cols, rows, cell: 2 * l.cell, siteCol: l.siteCol / 2, siteRow: l.siteRow / 2, heights };
  };
  const ground: THREE.Mesh[] = [];
  // The cap's own mesh, and in flight the coarser ring round it.
  let cap: THREE.Mesh | null = null, capRing: THREE.Mesh | null = null;
  if (levels.length === 0) {
    // No terrain: flat ground on the curved Moon.
    const geo = new THREE.RingGeometry(0.01, 150000, 256, 128).rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setY(i, -(p.getX(i) ** 2 + p.getZ(i) ** 2) / (2 * R_MOON_M));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material(true, 0, 0, []));
    mesh.frustumCulled = false;
    ground.push(mesh);
  } else {
    const drawn = levels.slice(0, 3);
    // In flight the 240 m flight level draws between the context and the cap (17.2), at every other cell with its light
    // from per-pixel slopes; standing, it is never drawn. Each mesh's slots: its level, the next, and the cap last.
    const flightLevel = flight ? field.flight : undefined;
    const list = flightLevel ? [...drawn.slice(0, -1), flightLevel, drawn[drawn.length - 1]] : drawn;
    const slotsOf = (k: number) => [...new Set([list[k], list[k + 1], list[list.length - 1]].filter((l): l is FieldLevel => !!l))];
    let holeR = 0;
    list.forEach((l, k) => {
      const isFlight = l === flightLevel, last = k === list.length - 1, meshCell = isFlight ? 2 * l.cell : l.cell;
      const mat = isFlight ? material(false, holeR, k, slotsOf(k), true) : material(k === 0, holeR, k, slotsOf(k));
      const { mesh, reachM } = isFlight ? groundMesh(half(l), field.lonDeg, STAND_REACH_M, mat) : groundMesh(l, field.lonDeg, meshReachM(l.cell, last, flight), mat);
      ground.push(mesh);
      if (last) {
        // The cap's ring, in flight, starts two of the cap's cells inside its edge: an overlap, never a gap.
        holeR = Math.max(0, reachM - 2 * meshCell);
      } else {
        // Its edge: round, and faded into the next level over the ring inside it; the next level's hole opens a cell
        // inside the cut. The next level's slope is taken as its mesh softens it, per pixel for the flight level.
        const e = edgeOf(reachM, meshCell);
        (mat.uniforms.uEdge.value as THREE.Vector3).set(e.ringIn, e.ringOut, e.cut);
        mat.uniforms.uNextStep.value = list[k + 1] === flightLevel ? 1 : 2;
        holeR = e.ringOut;
      }
    });
    cap = ground[ground.length - 1];
    if (flight) {
      // From 900 km over the pole the view spans some 330 km each way: the cap goes on to 460 km in cells twice as
      // wide (a quarter of the vertices), so the month's sweep is all measured ground, sharper than the globe's
      // maps, whose rows bunch up at the pole.
      const l = drawn[drawn.length - 1];
      capRing = groundMesh(half(l), field.lonDeg, RING_REACH_M, material(false, holeR, list.length, [l])).mesh;
      ground.push(capRing);
    }
  }
  return { meshes: ground, cap, capRing };
}
