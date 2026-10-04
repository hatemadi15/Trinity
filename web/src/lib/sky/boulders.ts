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
 * blended with a power from POWER to POWER + 1.5 (the higher, the sharper the edges), and the whole made uneven by
 * up to ROUGH of its size.
 */
const ROCK = { DETAIL: 20, TURN: 0.25, BREAKS: 3, BREAK: 0.8, POWER: 5, ROUGH: 0.015 } as const;

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
  for (let i = 0; i < pos.count; i++) {
    u.fromBufferAttribute(pos, i).normalize();
    // Where the planes, blended, meet this direction: the faces turned towards it count, the nearest the most.
    let sum = 0;
    for (const { n, d } of planes) sum += Math.max(0, u.dot(n) / d) ** power;
    let bump = 0;
    for (const w of waves) bump += Math.sin(w.f * u.dot(w.u) + w.p);
    const r = sum ** (-1 / power) * (1 + (ROCK.ROUGH * bump) / waves.length);
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
 * The boulders' meshes: blocky stones with rounded edges (rockShape), lit with smooth normals, in the dust's grey a
 * shade lighter or darker rock by rock; as wide as their radius (about one in three long, as big but up to 1.75
 * times as long as it is wide), a little flattened and tilted, each sunk a quarter to a third of its height
 * into the ground at `groundY(x, z)` so it never floats; and for each a sphere (centre and radius, in a Vector4)
 * that stands for it in the ground shader's shadows: over its middle, its top at the rock's highest point as it lies,
 * three quarters of its radius wide, so no wider than the rock's narrower side.
 */
export function boulderMeshes(list: Boulder[], groundY: (x: number, z: number) => number, seed: number): { group: THREE.Group; spheres: THREE.Vector4[] } {
  const next = seeded(seed ^ 0x9e3779b9);
  const group = new THREE.Group();
  const spheres: THREE.Vector4[] = [];
  const v = new THREE.Vector3();
  for (const b of list) {
    const geo = rockShape(next);
    const pos = geo.getAttribute('position');
    const shade = 0.9 + 0.2 * next();
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b8781).multiplyScalar(shade), roughness: 1, metalness: 0 });
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
