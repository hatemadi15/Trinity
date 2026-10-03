import * as THREE from 'three';

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
/** How far the middle of a boulder sits above the ground, in its half-heights: the rest is sunk. */
const LIFT = 0.55;

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

/**
 * The boulders' meshes: broken rock, coarse facets of uneven radius (each corner pushed in or out by its own
 * amount, the same wherever faces meet, so no crack opens), in the dust's grey a shade lighter or darker
 * rock by rock, each sunk into the ground at `groundY(x, z)` so it never floats; and for each a sphere
 * (centre and radius, in a Vector4) that stands for it in the ground shader's shadows, its top at the rock's.
 */
export function boulderMeshes(list: Boulder[], groundY: (x: number, z: number) => number, seed: number): { group: THREE.Group; spheres: THREE.Vector4[] } {
  const next = seeded(seed ^ 0x9e3779b9);
  const group = new THREE.Group();
  const spheres: THREE.Vector4[] = [];
  for (const b of list) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.getAttribute('position');
    // Each corner of the rock in or out by its own amount; corners shared by several faces move together.
    const push = new Map<string, number>();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      if (!push.has(key)) push.set(key, 0.78 + 0.4 * next());
      const k = push.get(key)!;
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const shade = 0.9 + 0.2 * next();
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8b8781).multiplyScalar(shade), roughness: 1, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(geo, material);
    const hh = FLAT * b.r * (0.9 + 0.2 * next()), g = groundY(b.x, b.z);
    mesh.scale.set(b.r, hh, b.r * (0.85 + 0.3 * next()));
    mesh.rotation.set((next() - 0.5) * 0.25, next() * 2 * Math.PI, (next() - 0.5) * 0.25);
    mesh.position.set(b.x, g + LIFT * hh, b.z);
    group.add(mesh);
    // A sphere whose top meets the rock's highest corner: its centre where the rock's is, a little narrower.
    let high = 0;
    for (let i = 0; i < pos.count; i++) high = Math.max(high, pos.getY(i));
    const top = LIFT * hh + high * hh;
    const w = 0.75 * b.r;
    spheres.push(new THREE.Vector4(b.x, g + top - w, b.z, w));
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
