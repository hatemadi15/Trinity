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
 * The boulders' meshes, lumpy and faceted, of the dust's grey, each sunk into the ground at `groundY(x, z)`
 * so it never floats; and for each a sphere (centre and radius, in a Vector4) that stands for it in the
 * ground shader's shadows, reaching about as high as the rock.
 */
export function boulderMeshes(list: Boulder[], groundY: (x: number, z: number) => number, seed: number): { group: THREE.Group; spheres: THREE.Vector4[] } {
  const next = seeded(seed ^ 0x9e3779b9);
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x8b8781, roughness: 1, metalness: 0, flatShading: true });
  const spheres: THREE.Vector4[] = [];
  for (const b of list) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.getAttribute('position');
    // Lumps: a few waves over the unit sphere, with this rock's own phases.
    const ph = [next(), next(), next(), next()].map((u) => u * 2 * Math.PI);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const k = 1 + 0.16 * Math.sin(2.3 * x + ph[0]) * Math.sin(2.9 * z + ph[1]) + 0.1 * Math.sin(4.7 * y + ph[2]) + 0.06 * Math.sin(6.1 * (x + z) + ph[3]);
      pos.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    const hh = FLAT * b.r, g = groundY(b.x, b.z);
    mesh.scale.set(b.r, hh, b.r);
    mesh.rotation.y = next() * 2 * Math.PI;
    mesh.position.set(b.x, g + LIFT * hh, b.z);
    group.add(mesh);
    // A sphere whose top meets the rock's: its centre where the rock's is, a little narrower than the rock.
    const top = LIFT * hh + hh;
    const w = 0.75 * b.r;
    spheres.push(new THREE.Vector4(b.x, g + top - w, b.z, w));
  }
  return { group, spheres };
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
