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

/** Height over radius: the boulders are a little flattened, as rocks that have settled. */
const FLAT = 0.7;
/**
 * How far the middle of a boulder sits above the ground, in its half-heights, from the least to the most: the rest
 * is sunk, a third to a quarter of its height bedded in the dust.
 */
const LIFT = { MIN: 0.32, MAX: 0.5 } as const;
/** The share of the boulders that are long, and how long: their length over their width. */
const LONG = { SHARE: 0.3, MIN: 1.35, MAX: 1.75 } as const;
/**
 * A boulder's shape: a ball divided finely (detail 20, 4412 corners) so its worn edges shade smoothly, pushed out
 * to the surface of a broken block: three pairs of faces, each turned up to TURN radians from square, and BREAKS to
 * BREAKS + 2 planes across its corners and edges, BREAK to BREAK + 0.15 out, where pieces broke away; the planes
 * blended with a power from POWER to POWER + 1.5 (the higher, the sharper the edges), one face more sharply, at FRESH
 * times that, and the whole made uneven by up to ROUGH of its size.
 */
const ROCK = { DETAIL: 20, TURN: 0.25, BREAKS: 3, BREAK: 0.8, POWER: 5, FRESH: 1.5, ROUGH: 0.015 } as const;
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

/** The finely divided ball the rocks are shaped from, merged once and copied for each. */
let ball: THREE.BufferGeometry | null = null;
function divided(): THREE.BufferGeometry {
  if (!ball) {
    const raw = new THREE.IcosahedronGeometry(1, ROCK.DETAIL);
    // Without its normals and texture coordinates, which split the corners along seams, each corner merges into one vertex.
    raw.deleteAttribute('normal');
    raw.deleteAttribute('uv');
    ball = mergeVertices(raw);
    raw.dispose();
  }
  return ball.clone();
}

/**
 * A rock's shape, fitted to the box from -1 to 1 on each axis: a block broken from bedrock and worn, its faces flat
 * or nearly, its edges and corners rounded as ages of small impacts round the Moon's rocks. Each direction from the
 * middle meets the surface where the block's planes, blended, say: three pairs of faces off square and at their own
 * distances, and a few planes across its corners and edges where pieces broke away. The higher the power that blends
 * them, the sharper the edges. A finely divided ball gives the directions, one vertex for each corner, shared by the
 * faces round it, so the normals are smooth and no crack opens.
 */
function rockShape(next: () => number): THREE.BufferGeometry {
  const geo = divided();
  // A direction at random, evenly over the sphere.
  const anyWay = () => {
    const z = 2 * next() - 1, t = 2 * Math.PI * next(), s = Math.sqrt(1 - z * z);
    return new THREE.Vector3(s * Math.cos(t), z, s * Math.sin(t));
  };
  const planes: { n: THREE.Vector3; d: number }[] = [];
  for (const axis of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    // A face, turned from square towards a direction at random.
    const n = new THREE.Vector3(...axis), side = anyWay(), turn = ROCK.TURN * next();
    side.addScaledVector(n, -side.dot(n)).normalize();
    planes.push({ n: n.multiplyScalar(Math.cos(turn)).addScaledVector(side, Math.sin(turn)), d: 0.8 + 0.2 * next() });
  }
  // The breaks: across a corner (three faces) or an edge (two) at random, off square to it.
  const breaks = ROCK.BREAKS + Math.floor(3 * next());
  for (let k = 0; k < breaks; k++) {
    const across = new THREE.Vector3(next() < 0.5 ? -1 : 1, next() < 0.5 ? -1 : 1, next() < 0.5 ? -1 : 1);
    if (next() < 0.5) across.setComponent(Math.floor(3 * next()), 0);
    planes.push({ n: across.normalize().addScaledVector(anyWay(), 0.3).normalize(), d: ROCK.BREAK + 0.15 * next() });
  }
  const power = ROCK.POWER + 1.5 * next();
  // A little unevenness over it all: four gentle waves.
  const waves = Array.from({ length: 4 }, () => ({ u: anyWay(), f: 3 + 2 * next(), p: 2 * Math.PI * next() }));
  const pos = geo.getAttribute('position'), u = new THREE.Vector3();
  // A fresh face: of the faces above the ground (all but the bottom, the fourth), the one that is the nearest plane
  // in the most directions broke off last and is the least worn, so its edges are sharper where it meets the rest.
  const covers = planes.map(() => 0);
  for (let i = 0; i < pos.count; i++) {
    u.fromBufferAttribute(pos, i).normalize();
    let nearest = -1, most = 0;
    for (let k = 0; k < planes.length; k++) {
      const reach = u.dot(planes[k].n) / planes[k].d;
      if (reach > most) {
        nearest = k;
        most = reach;
      }
    }
    if (nearest >= 0) covers[nearest]++;
  }
  const fresh = [0, 1, 2, 4, 5].reduce((a, k) => (covers[k] > covers[a] ? k : a));
  const sharp = ROCK.FRESH * power;
  for (let i = 0; i < pos.count; i++) {
    u.fromBufferAttribute(pos, i).normalize();
    // Where the planes, blended, meet this direction: the faces turned towards it count, the nearest the most; the
    // fresh face blended with the rest at the higher power.
    let sum = 0;
    for (let k = 0; k < planes.length; k++) if (k !== fresh) sum += Math.max(0, u.dot(planes[k].n) / planes[k].d) ** power;
    const all = sum ** (sharp / power) + Math.max(0, u.dot(planes[fresh].n) / planes[fresh].d) ** sharp;
    let bump = 0;
    for (const w of waves) bump += Math.sin(w.f * u.dot(w.u) + w.p);
    const r = all ** (-1 / sharp) * (1 + (ROCK.ROUGH * bump) / waves.length);
    pos.setXYZ(i, u.x * r, u.y * r, u.z * r);
  }
  // Fitted to its box: its size, its proportions and how deep it lies are set where it is placed.
  geo.computeBoundingBox();
  const box = geo.boundingBox!, mid = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, (pos.getX(i) - mid.x) / half.x, (pos.getY(i) - mid.y) / half.y, (pos.getZ(i) - mid.z) / half.z);
  geo.computeBoundingBox();
  geo.computeVertexNormals();
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
  // Its grey as before on the whole, the patches lighter and darker about it.
  const mean = colour.reduce((a, c) => a + c, 0) / colour.length;
  for (let i = 0; i < colour.length; i++) colour[i] /= mean;
  bumped.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.setAttribute('normal', bumped.getAttribute('normal'));
}

/**
 * The boulders' meshes: blocky stones with rounded edges and one sharper face (rockShape), with a rock's surface
 * (rockSurface: patches lighter and darker, small bumps), in the dust's grey a shade lighter or darker rock by rock;
 * as wide as their radius (about one in three long, as big but up to 1.75 times as long as it is wide), a little
 * flattened and tilted, each sunk a quarter to a third of its height into the ground at `groundY(x, z)` so it never
 * floats; and for each a sphere (centre and radius, in a Vector4) that stands for it in the ground shader's shadows:
 * over its middle, its top at the rock's highest point as it lies, three quarters of its radius wide, so no wider
 * than the rock's narrower side.
 */
export function boulderMeshes(list: Boulder[], groundY: (x: number, z: number) => number, seed: number): { group: THREE.Group; spheres: THREE.Vector4[] } {
  const next = seeded(seed ^ 0x9e3779b9);
  // Each rock's surface from a stream of its own, so the shapes, sizes and places drawn from `next` stay as they were.
  const surfaces = seeded(seed ^ 0x51633e2d);
  const group = new THREE.Group();
  const spheres: THREE.Vector4[] = [];
  const v = new THREE.Vector3();
  for (const b of list) {
    const geo = rockShape(next);
    rockSurface(geo, Math.floor(surfaces() * 4294967296));
    const pos = geo.getAttribute('position');
    const shade = 0.9 + 0.2 * next();
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b8781).multiplyScalar(shade), roughness: 1, metalness: 0, vertexColors: true });
    const mesh = new THREE.Mesh(geo, material);
    // Its length over its width, its area kept.
    const long = next() < LONG.SHARE ? LONG.MIN + (LONG.MAX - LONG.MIN) * next() : 0.9 + 0.2 * next();
    const hh = FLAT * b.r * (0.85 + 0.3 * next()), g = groundY(b.x, b.z);
    mesh.scale.set(b.r * Math.sqrt(long), hh, b.r / Math.sqrt(long));
    mesh.rotation.set((next() - 0.5) * 0.25, next() * 2 * Math.PI, (next() - 0.5) * 0.25);
    mesh.position.set(b.x, g + (LIFT.MIN + (LIFT.MAX - LIFT.MIN) * next()) * hh, b.z);
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
