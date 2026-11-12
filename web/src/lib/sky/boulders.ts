import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A few boulders near the eye, drawn (not measured, like the small craters underfoot): real shapes the view
 * can see round and that cast real shadows, so the ground near you is not bare. Placed from the site's own
 * seed, so they stay where they are from visit to visit.
 */

/** A boulder: where it stands on the ground (world metres, x east, z south) and its radius in metres. */
export interface Boulder {
  x: number;
  z: number;
  r: number;
}

/** How many, how far out (metres), how big (radius, metres), and the most the ground shader takes. */
export const BOULDERS = { COUNT: 14, NEAR_M: 6, FAR_M: 45, R_MIN: 0.15, R_MAX: 0.6, MAX: 16 } as const;

/** The share of the boulders that are long, and how long: their length over their width. */
const LONG = { SHARE: 0.3, MIN: 1.35, MAX: 1.75 } as const;
/** A boulder's kind: an angular block, a rounded lump or a low slab. */
export type RockKind = 'block' | 'lump' | 'slab';
/**
 * Each kind of boulder: its share of them; how many fracture planes cut it (`planes`, from the fewest to the most) and
 * how far out from its middle they lie (`dist`, in its own size); how far its edges and corners are rounded off (`edge`:
 * where two or three faces meet, the surface turns over about that much of its size, while each face stays flat away
 * from its edges); how much its whole surface swells and dents (`noise`, a share of its size, in slow swells about one
 * across it), so no edge runs straight and no face is a true plane; its height over its radius (`flat`); and how far its
 * middle sits above the ground (`lift`, in its half-heights, from the least to the most), so a third (0.33) to a half
 * (0) of its height is bedded in the dust.
 */
export const KINDS: Record<RockKind, { share: number; planes: [number, number]; dist: [number, number]; edge: number; noise: number; flat: number; lift: [number, number] }> = {
  block: { share: 0.65, planes: [11, 14], dist: [0.62, 1], edge: 0.035, noise: 0.035, flat: 0.75, lift: [0.15, 0.33] },
  // Few and only a little rounded: read D2 took the rounder lumps of the prototype (share 0.3, edge 0.12) for pillows.
  lump: { share: 0.15, planes: [9, 11], dist: [0.8, 1], edge: 0.07, noise: 0.06, flat: 0.7, lift: [0.05, 0.25] },
  slab: { share: 0.2, planes: [9, 12], dist: [0.7, 1], edge: 0.05, noise: 0.03, flat: 0.42, lift: [0.2, 0.33] },
};
/** The kind for a random number from 0 to 1, by the kinds' shares. */
function kindOf(u: number): RockKind {
  const names = Object.keys(KINDS) as RockKind[];
  for (const name of names) {
    if (u < KINDS[name].share) return name;
    u -= KINDS[name].share;
  }
  return names[names.length - 1];
}
/**
 * How a rock's planes are drawn (rockPlanes): each the best of CANDIDATES directions at random, the one farthest from
 * the planes so far, so they spread all round it; none within APART radians of another's direction (no two faces meet
 * nearly flat) nor within ANTI radians of another's opposite (no two faces parallel, as a box's are); and every direction
 * within acos(COVER) of some plane's, else a plane is added facing it, so the rock is closed all round and has no long
 * spike (a plane added so lies far from every other's direction, but may lie near one's opposite). Each face is cut
 * into small triangles, DIVIDE along each side of the triangles it fans into from its middle: enough corners for the
 * rounding, the swells, the patches and the bumps. NOISE_F is how fine the swells are, per radius: about one swell
 * across the rock.
 */
export const ROCK = { CANDIDATES: 2, APART: 0.42, ANTI: 0.36, COVER: 0.5, DIVIDE: 10, NOISE_F: 1.3 } as const;
/** A rock's grey over the dust's, from the least to the most: fresh rock, a shade lighter than the dust round it. */
const SHADE = [1.0, 1.15] as const;
/** How near, in a rock's own size, two of its corners are taken to be one, or a corner to lie on a plane. */
const EPS = 1e-6;
/**
 * A boulder's surface, so that it reads as rock: its grey lighter and darker in patches, most of it within about a
 * sixth either way (PATCH, in three octaves from patches about a third of the rock across), with a finer grain
 * (GRAIN, about a sixth across); and small bumps (BUMP, its corners pushed out or in by up to that share of its
 * size, about a sixth of it across), which tilt the normals it is lit with by about 5 degrees this way and that.
 */
const SURFACE = { PATCH: 0.5, PATCH_F: 1.4, GRAIN: 0.12, GRAIN_F: 6, BUMP: 0.035, BUMP_F: 3 } as const;

/** A small seeded random number generator (mulberry32): the same seed gives the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth noise in space, from -1 to 1 and the same for a seed: a random value at each corner of a grid one unit
 * apart, blended smoothly in between.
 */
function noise(seed: number): (x: number, y: number, z: number) => number {
  const at = (i: number, j: number, k: number) => {
    let h = (Math.imul(i, 0x8da6b343) ^ Math.imul(j, 0xd8163841) ^ Math.imul(k, 0xcb1ab31f) ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const ease = (t: number) => t * t * (3 - 2 * t), mix = (a: number, b: number, t: number) => a + (b - a) * t;
  // A side of the cell, at the height k: its four corners blended across (u) and along (v).
  const side = (i: number, j: number, k: number, u: number, v: number) => mix(mix(at(i, j, k), at(i + 1, j, k), u), mix(at(i, j + 1, k), at(i + 1, j + 1, k), u), v);
  return (x, y, z) => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = ease(x - i), v = ease(y - j);
    return mix(side(i, j, k, u, v), side(i, j, k + 1, u, v), ease(z - k));
  };
}

/** Octaves of noise, each twice as fine and half as strong as the last, from -1 to 1. */
function octaves(n: (x: number, y: number, z: number) => number, x: number, y: number, z: number, count: number): number {
  let sum = 0, weight = 1, total = 0;
  for (let o = 0; o < count; o++) {
    sum += weight * n(x, y, z);
    total += weight;
    weight /= 2;
    // Each octave off the last one's grid, so their corners do not line up.
    x = 2 * x + 17.3;
    y = 2 * y + 5.1;
    z = 2 * z + 11.7;
  }
  return sum / total;
}

/** A site's seed for placeBoulders, from where it is. */
export function siteSeed(lat: number, lon: number): number {
  return (Math.imul(Math.round((lat + 90) * 1e4), 73856093) ^ Math.imul(Math.round((lon + 180) * 1e4), 19349663)) >>> 0;
}

/**
 * The boulders, from a seed: spread evenly over the ground 6 to 45 m out, 0.3 to 1.2 m across with few of
 * them large (the radius grows with the cube of a random number, as small rocks far outnumber big ones),
 * at least 0.5 m apart, and, when there is a lander, none within 4 m of it or in the way between the eye
 * and it.
 */
export function placeBoulders(seed: number, lander: { x: number; z: number } | null): Boulder[] {
  const next = seeded(seed);
  const out: Boulder[] = [];
  const ld = lander ? Math.hypot(lander.x, lander.z) : 0;
  for (let tries = 0; out.length < BOULDERS.COUNT && tries < 400; tries++) {
    const d = Math.sqrt(BOULDERS.NEAR_M ** 2 + next() * (BOULDERS.FAR_M ** 2 - BOULDERS.NEAR_M ** 2));
    const a = next() * 2 * Math.PI;
    const r = BOULDERS.R_MIN + (BOULDERS.R_MAX - BOULDERS.R_MIN) * next() ** 3;
    const x = d * Math.sin(a), z = -d * Math.cos(a);
    if (lander && ld > 0) {
      if (Math.hypot(x - lander.x, z - lander.z) < 4 + r) continue;
      const t = (x * lander.x + z * lander.z) / (ld * ld);
      if (t > 0 && t < 1 && Math.abs(x * lander.z - z * lander.x) / ld < r + 1.5) continue;
    }
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r + 0.5)) continue;
    out.push({ x, z, r });
  }
  return out;
}

/** A plane that bounds a rock: its normal, pointing out, and how far out from the rock's middle it lies. */
type Plane = { n: THREE.Vector3; d: number };
/** A rock as a solid: its corners, and each face as the corners round it, anticlockwise seen from outside. */
type Solid = { corners: THREE.Vector3[]; faces: number[][] };

/**
 * The solid all the planes keep, each cutting away what lies beyond it: its corners are where three planes meet and no
 * other cuts them away, and each plane's face is the corners on it, in order round it. A plane that only touches the
 * solid, at a corner or along an edge, makes no face.
 */
function solidOf(planes: Plane[]): Solid {
  const corners: THREE.Vector3[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      for (let k = j + 1; k < planes.length; k++) {
        const [p, q, s] = [planes[i], planes[j], planes[k]];
        a.crossVectors(q.n, s.n);
        const det = p.n.dot(a);
        if (Math.abs(det) < 1e-9) continue;
        b.crossVectors(s.n, p.n);
        c.crossVectors(p.n, q.n);
        const x = a.clone().multiplyScalar(p.d).addScaledVector(b, q.d).addScaledVector(c, s.d).divideScalar(det);
        // Once only where more than three planes meet.
        if (planes.every((m) => m.n.dot(x) <= m.d + EPS) && !corners.some((y) => y.distanceToSquared(x) < EPS * EPS)) corners.push(x);
      }
    }
  }
  const faces: number[][] = [];
  for (const plane of planes) {
    const at = corners.flatMap((x, i) => (Math.abs(plane.n.dot(x) - plane.d) < EPS ? [i] : []));
    if (at.length < 3) continue;
    const mid = at.reduce((sum, i) => sum.add(corners[i]), new THREE.Vector3()).divideScalar(at.length);
    const u = corners[at[0]].clone().sub(mid).normalize(), v = plane.n.clone().cross(u);
    const turn = (i: number) => {
      const e = corners[i].clone().sub(mid);
      return Math.atan2(e.dot(v), e.dot(u));
    };
    faces.push(at.sort((i, j) => turn(i) - turn(j)));
  }
  return { corners, faces };
}

/**
 * A solid's faces as one mesh: each face with corners of its own, so the light changes at once across an edge, and cut
 * into small triangles, `n` along each side of the triangles it fans into from its middle. The points along an edge are
 * placed alike for the two faces that meet there, worked out from the same end, so no crack opens between them.
 */
function facets({ corners, faces }: Solid, n: number): THREE.BufferGeometry {
  const pos: number[] = [], index: number[] = [];
  // The point s steps of n along the edge from corner i to corner j, from its lower-numbered end.
  const along = (i: number, j: number, s: number) => (i < j ? corners[i].clone().lerp(corners[j], s / n) : corners[j].clone().lerp(corners[i], (n - s) / n));
  for (const at of faces) {
    const m = at.length, mid = at.reduce((sum, i) => sum.add(corners[i]), new THREE.Vector3()).divideScalar(m);
    const made = new Map<string, number>();
    const vertex = (key: string, place: () => THREE.Vector3) => {
      let k = made.get(key);
      if (k === undefined) {
        const p = place();
        k = pos.length / 3;
        pos.push(p.x, p.y, p.z);
        made.set(key, k);
      }
      return k;
    };
    // Row r of n out from the middle, on the way to the face's corner c: the corner itself at the end.
    const spoke = (c: number, r: number) => (r === n ? corners[at[c]].clone() : mid.clone().lerp(corners[at[c]], r / n));
    // The point s along row r (0 to r) of the fan from corner c to the next.
    const point = (c: number, r: number, s: number): number => {
      const c1 = (c + 1) % m;
      if (r === 0) return vertex('mid', () => mid);
      if (s === 0) return vertex(`${c} ${r}`, () => spoke(c, r));
      if (s === r) return vertex(`${c1} ${r}`, () => spoke(c1, r));
      if (r === n) return vertex(`edge ${c} ${s}`, () => along(at[c], at[c1], s));
      return vertex(`${c} ${r} ${s}`, () => spoke(c, r).lerp(spoke(c1, r), s / r));
    };
    for (let c = 0; c < m; c++) {
      for (let r = 0; r < n; r++) {
        for (let s = 0; s <= r; s++) {
          index.push(point(c, r, s), point(c, r + 1, s), point(c, r + 1, s + 1));
          if (s < r) index.push(point(c, r, s), point(c, r + 1, s + 1), point(c, r, s + 1));
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  return geo;
}

/**
 * 48 directions spread evenly over the sphere (a Fibonacci lattice): a rock is closed all round when each of them lies
 * within acos(COVER) of one of its planes' directions.
 */
const ALL_ROUND = Array.from({ length: 48 }, (_, i) => {
  const z = 1 - (2 * i + 1) / 48, s = Math.sqrt(1 - z * z), t = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(s * Math.cos(t), z, s * Math.sin(t));
});

/**
 * The planes a rock is cut by, before its solid is made (ROCK): its kind's number of them, each facing a direction at
 * random (the best of a few, so they spread all round it, none near another's direction or its opposite) and lying its
 * kind's distance out; then one facing each direction of ALL_ROUND that no plane yet faces within acos(COVER), marked
 * `closing`, so the rock is closed all round.
 */
export function rockPlanes(next: () => number, kind: RockKind): { n: THREE.Vector3; d: number; closing: boolean }[] {
  const { planes: range, dist } = KINDS[kind];
  // A direction at random, evenly over the sphere.
  const anyWay = () => {
    const z = 2 * next() - 1, t = 2 * Math.PI * next(), s = Math.sqrt(1 - z * z);
    return new THREE.Vector3(s * Math.cos(t), z, s * Math.sin(t));
  };
  const planes: { n: THREE.Vector3; d: number; closing: boolean }[] = [];
  const count = range[0] + Math.floor((range[1] - range[0] + 1) * next());
  const cosApart = Math.cos(ROCK.APART), cosAnti = Math.cos(ROCK.ANTI);
  const distance = () => dist[0] + (dist[1] - dist[0]) * next();
  // At most 30 tries: the more planes there are, the rarer a direction clear of them all.
  for (let tries = 0; planes.length < count && tries < 30; tries++) {
    // The best of a few directions: the farthest from the planes so far, not nearly as one nor opposite to one.
    let best: THREE.Vector3 | null = null, gap = -2;
    for (let c = 0; c < ROCK.CANDIDATES; c++) {
      const n = anyWay();
      let nearest = -1, ok = true;
      for (const p of planes) {
        const dot = p.n.dot(n);
        if (dot > cosApart || dot < -cosAnti) ok = false;
        nearest = Math.max(nearest, dot);
      }
      if (ok && -nearest > gap) {
        best = n;
        gap = -nearest;
      }
    }
    if (best) planes.push({ n: best, d: distance(), closing: false });
  }
  // Closed all round: a direction no plane faces within acos(COVER) gets a plane of its own.
  for (const u of ALL_ROUND) if (planes.every((p) => p.n.dot(u) < ROCK.COVER)) planes.push({ n: u.clone(), d: distance(), closing: true });
  return planes;
}

/**
 * A rock's shape, fitted to the box from -1 to 1 on each axis: a stone, not a box. Its kind's planes cut it (rockPlanes),
 * so its outline is irregular from every side; its edges and corners are rounded off (the kind's `edge`: each corner of
 * the cut solid moved in along its own direction from the middle onto the surface where the planes' smooth maximum,
 * k ln sum exp((n.x - d) / k), is nought, which is the solid itself in a face's middle and rounded where faces meet);
 * then its whole surface swells and dents in slow noise (by up to the kind's `noise`, about one swell across it:
 * NOISE_F), so no edge runs straight. Both move each corner along its own direction by its place alone, so a corner two
 * faces share stays shared and no crack opens. Its numbers come from `next`: its planes first, then its swells.
 */
export function rockShape(next: () => number, kind: RockKind): THREE.BufferGeometry {
  const planes = rockPlanes(next, kind), { edge: k, noise: swells } = KINDS[kind];
  const geo = facets(solidOf(planes), ROCK.DIVIDE);
  const swell = noise(Math.floor(next() * 4294967296)), pos = geo.getAttribute('position'), v = new THREE.Vector3(), f = ROCK.NOISE_F;
  const along = planes.map(() => 0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let t = v.length();
    v.divideScalar(t);
    // Newton's way in, six steps, from the cut solid's corner (where the smooth maximum is nought or more) to where it
    // is nought.
    planes.forEach((p, j) => (along[j] = p.n.dot(v)));
    for (let it = 0; it < 6; it++) {
      let top = -Infinity;
      for (let j = 0; j < planes.length; j++) top = Math.max(top, (t * along[j] - planes[j].d) / k);
      let sum = 0, slope = 0;
      for (let j = 0; j < planes.length; j++) {
        const w = Math.exp((t * along[j] - planes[j].d) / k - top);
        sum += w;
        slope += w * along[j];
      }
      t -= (k * (top + Math.log(sum))) / (slope / sum);
    }
    // The swells: two octaves of the noise over its direction, the noise's grid set off from the rock's middle.
    t *= 1 + swells * octaves(swell, f * v.x + 3.1, f * v.y + 7.7, f * v.z + 1.3, 2);
    pos.setXYZ(i, v.x * t, v.y * t, v.z * t);
  }
  // Fitted to its box: its size, its proportions and how deep it lies are set where it is placed. The box it was fitted
  // from is kept with the shape (userData.fittedFrom), so a corner can be taken back to where its planes cut it.
  geo.computeBoundingBox();
  const box = geo.boundingBox!.clone(), mid = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, (pos.getX(i) - mid.x) / half.x, (pos.getY(i) - mid.y) / half.y, (pos.getZ(i) - mid.z) / half.z);
  geo.computeBoundingBox();
  geo.computeVertexNormals();
  geo.userData.fittedFrom = box;
  return geo;
}

/**
 * Gives a rock's shape its surface (SURFACE), from a seed of its own: a colour at each corner, by which the
 * material's grey is multiplied, lighter and darker in patches; and normals with small bumps on them, taken from a
 * copy of the shape with each corner pushed out or in along its normal, so the light catches the bumps while the
 * shape itself, its outline and its shadow's sphere, stays as it is.
 */
function rockSurface(geo: THREE.BufferGeometry, seed: number) {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const patches = noise(seed), grain = noise(seed ^ 0x5bd1e995), relief = noise(seed ^ 0x27d4eb2f);
  const { PATCH, PATCH_F, GRAIN, GRAIN_F, BUMP, BUMP_F } = SURFACE;
  const colour = new Float32Array(pos.count * 3);
  const bumped = geo.clone(), moved = bumped.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    colour.fill(1 + PATCH * octaves(patches, PATCH_F * x, PATCH_F * y, PATCH_F * z, 3) + GRAIN * grain(GRAIN_F * x, GRAIN_F * y, GRAIN_F * z), 3 * i, 3 * i + 3);
    const h = BUMP * relief(BUMP_F * x, BUMP_F * y, BUMP_F * z);
    moved.setXYZ(i, x + nor.getX(i) * h, y + nor.getY(i) * h, z + nor.getZ(i) * h);
  }
  // Its grey as before on the whole, the patches lighter and darker about it: each corner counted by its share of the
  // surface (a third of each triangle round it), as a small face has as many corners as a large one.
  const index = geo.getIndex()!, share = new Float32Array(pos.count), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k < index.count; k += 3) {
    const i = index.getX(k), j = index.getX(k + 1), l = index.getX(k + 2);
    a.fromBufferAttribute(pos, i);
    const area = b.fromBufferAttribute(pos, j).sub(a).cross(c.fromBufferAttribute(pos, l).sub(a)).length();
    share[i] += area;
    share[j] += area;
    share[l] += area;
  }
  let sum = 0, total = 0;
  for (let i = 0; i < pos.count; i++) {
    sum += share[i] * colour[3 * i];
    total += share[i];
  }
  for (let i = 0; i < colour.length; i++) colour[i] /= sum / total;
  bumped.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.setAttribute('normal', bumped.getAttribute('normal'));
}

/**
 * The resident's shell (spec 21.2): a dome made as the rocks are, so it reads as one of them, and as a shell. A round top
 * over a flatter belly (UNDER: how deep the belly is, in the top's height), swelling and denting a little all over
 * (SWELL, slow, about one swell across it: NOISE_F) so it is a stone, not a ball; fitted to the box from -1 to 1 on each
 * axis, as a boulder's shape is, with its corners welded (no seam down its back) and a rock's surface (rockSurface:
 * patches lighter and darker, small bumps), all from `seed`. SEGMENTS: how finely round and up.
 */
export const DOME = { UNDER: 0.25, SWELL: 0.06, SEGMENTS: [24, 14] } as const;
export function rockDome(seed: number): THREE.BufferGeometry {
  const ball = new THREE.SphereGeometry(1, DOME.SEGMENTS[0], DOME.SEGMENTS[1]);
  ball.deleteAttribute('uv');
  ball.deleteAttribute('normal');
  const geo = mergeVertices(ball, 1e-6);
  ball.dispose();
  const pos = geo.getAttribute('position'), swell = noise(seed), v = new THREE.Vector3(), f = ROCK.NOISE_F;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + DOME.SWELL * octaves(swell, f * v.x + 3.1, f * v.y + 7.7, f * v.z + 1.3, 2);
    pos.setXYZ(i, v.x * k, (v.y < 0 ? DOME.UNDER * v.y : v.y) * k, v.z * k);
  }
  geo.computeBoundingBox();
  const box = geo.boundingBox!.clone(), mid = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, (pos.getX(i) - mid.x) / half.x, (pos.getY(i) - mid.y) / half.y, (pos.getZ(i) - mid.z) / half.z);
  geo.computeBoundingBox();
  geo.computeVertexNormals();
  rockSurface(geo, (seed ^ 0x2545f491) >>> 0);
  return geo;
}

/**
 * The boulders' meshes: stones of three kinds (KINDS: angular blocks, rounded lumps and low slabs, each rock's kind
 * drawn by their shares), irregular from every side, their edges rounded a little and never running straight
 * (rockShape), with a rock's surface (rockSurface: patches lighter and darker, small bumps), fresh rock a shade lighter
 * than the dust (SHADE), each mesh named `rock-<kind>`; as wide as their radius (about one in three long, as big but up
 * to 1.75 times as long as it is wide), flattened by their kind and tilted, each bedded a third to a half of its height
 * into the ground at `groundY(x, z)` so it never floats; and for each a sphere (centre and radius, in a Vector4) that
 * stands for it in the ground shader's shadows: over its middle, its top at the rock's highest point as it lies, three
 * quarters of its radius wide, so no wider than the rock's narrower side.
 */
export function boulderMeshes(list: Boulder[], groundY: (x: number, z: number) => number, seed: number): { group: THREE.Group; spheres: THREE.Vector4[] } {
  const next = seeded(seed ^ 0x9e3779b9);
  // Each rock's surface from a stream of its own, so the shapes, sizes and places drawn from `next` stay as they were.
  const surfaces = seeded(seed ^ 0x51633e2d);
  const group = new THREE.Group();
  const spheres: THREE.Vector4[] = [];
  const v = new THREE.Vector3();
  for (const b of list) {
    // Its kind first, then its shape.
    const kind = kindOf(next()), { flat, lift } = KINDS[kind];
    const geo = rockShape(next, kind);
    rockSurface(geo, Math.floor(surfaces() * 4294967296));
    const pos = geo.getAttribute('position');
    const shade = SHADE[0] + (SHADE[1] - SHADE[0]) * next();
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b8781).multiplyScalar(shade), roughness: 1, metalness: 0, vertexColors: true });
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `rock-${kind}`;
    // Its length over its width, its area kept.
    const long = next() < LONG.SHARE ? LONG.MIN + (LONG.MAX - LONG.MIN) * next() : 0.9 + 0.2 * next();
    const hh = flat * b.r * (0.85 + 0.3 * next()), g = groundY(b.x, b.z);
    mesh.scale.set(b.r * Math.sqrt(long), hh, b.r / Math.sqrt(long));
    mesh.rotation.set((next() - 0.5) * 0.25, next() * 2 * Math.PI, (next() - 0.5) * 0.25);
    mesh.position.set(b.x, g + (lift[0] + (lift[1] - lift[0]) * next()) * hh, b.z);
    group.add(mesh);
    // A sphere whose top meets the rock's highest point, turned and tilted as it lies; its centre over the rock's.
    mesh.updateMatrix();
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix).y);
    const w = 0.75 * b.r;
    spheres.push(new THREE.Vector4(b.x, top - w, b.z, w));
  }
  return { group, spheres };
}

/** A pebble: where it lies (world metres) and its radius. */
export interface Pebble {
  x: number;
  z: number;
  r: number;
}

/** How many pebbles, and how far out (metres): strewn round the eye, the near ground's grit. */
export const PEBBLES = { COUNT: 360, NEAR_M: 2, FAR_M: 30 } as const;

/**
 * The pebbles, from a seed: spread evenly 2 to 30 m out, 3 to 20 cm across with few large ones (the radius
 * grows with the fourth power of a random number), none within 2.5 m of the lander.
 */
export function placePebbles(seed: number, lander: { x: number; z: number } | null): Pebble[] {
  const next = seeded(seed ^ 0x51ed270b);
  const out: Pebble[] = [];
  for (let tries = 0; out.length < PEBBLES.COUNT && tries < 4 * PEBBLES.COUNT; tries++) {
    const d = Math.sqrt(PEBBLES.NEAR_M ** 2 + next() * (PEBBLES.FAR_M ** 2 - PEBBLES.NEAR_M ** 2));
    const a = next() * 2 * Math.PI;
    const r = 0.015 + 0.085 * next() ** 4;
    const x = d * Math.sin(a), z = -d * Math.cos(a);
    if (lander && Math.hypot(x - lander.x, z - lander.z) < 2.5) continue;
    out.push({ x, z, r });
  }
  return out;
}

/**
 * The pebbles as one set of faceted shapes the light catches, each half sunk into the ground at
 * `groundY(x, z)`, turned and squashed its own way, a little lighter or darker than its neighbours.
 */
export function pebbleMesh(list: Pebble[], groundY: (x: number, z: number) => number, seed: number): THREE.InstancedMesh {
  const next = seeded(seed ^ 0x2545f491);
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true }), list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), at = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((p, i) => {
    const hy = p.r * (0.55 + 0.3 * next());
    sc.set(p.r * (0.8 + 0.4 * next()), hy, p.r * (0.8 + 0.4 * next()));
    q.setFromEuler(e.set((next() - 0.5) * 0.6, next() * 2 * Math.PI, (next() - 0.5) * 0.6));
    at.set(p.x, groundY(p.x, p.z) + 0.3 * hy, p.z);
    mesh.setMatrixAt(i, m.compose(at, q, sc));
    mesh.setColorAt(i, c.setHex(0x8b8781).multiplyScalar(0.85 + 0.3 * next()));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** The boulders' shadows in the ground shader: the least angle by which the ray towards the Sun clears one. */
export const BOULDER_GLSL = /* glsl */ `
uniform vec4 uRocks[${BOULDERS.MAX}]; uniform int uRockCount;
float rocksClearance(vec3 p, vec3 L) {
  float m = 1.0;
  for (int i = 0; i < ${BOULDERS.MAX} * uOne; i++) {
    if (i >= uRockCount) break;
    vec3 v = uRocks[i].xyz - p; float t = dot(v, L);
    if (t > 0.05) m = min(m, (length(v - L * t) - uRocks[i].w) / t);
  }
  return m;
}
`;
