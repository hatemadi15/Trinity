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
/**
 * How far the middle of a boulder sits above the ground, in its half-heights, from the least to the most: the rest
 * is sunk, a third to a quarter of its height bedded in the dust.
 */
const LIFT = { MIN: 0.32, MAX: 0.5 } as const;
/** The share of the boulders that are long, and how long: their length over their width. */
const LONG = { SHARE: 0.3, MIN: 1.35, MAX: 1.75 } as const;
/**
 * A boulder's shape: a block broken from bedrock, bounded by flat fracture faces that meet in sharp edges. Its planes:
 * three pairs of faces, each turned up to TURN radians from square, 0.8 to 1 out from the middle; BREAKS to BREAKS + 2
 * planes across its corners and edges, BREAK to BREAK + 0.15 out, where pieces broke away; and FLAKES planes facing
 * anywhere, FLAKE to FLAKE + 0.12 out, where smaller flakes came off (three in four of them). A plane within APART
 * radians of one before it is left out, so no two faces meet nearly flat. Each face is cut into small triangles, DIVIDE
 * along each side of the triangles it fans into from its middle: enough corners for its patches and bumps (SURFACE).
 */
const ROCK = { TURN: 0.35, BREAKS: 3, BREAK: 0.8, FLAKES: 4, FLAKE: 0.84, APART: 0.26, DIVIDE: 10 } as const;
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
 * A rock's shape, fitted to the box from -1 to 1 on each axis: a block broken from bedrock, its faces flat fracture
 * planes meeting in sharp edges and corners (ROCK): three pairs of faces off square and at their own distances, a few
 * planes across its corners and edges where pieces broke away, and a few smaller flakes. Its numbers come from `next`
 * in the order they always have, so each rock's size, turn, tilt, bedding and shade, drawn after them, stay as they were.
 */
function rockShape(next: () => number): THREE.BufferGeometry {
  // A direction at random, evenly over the sphere.
  const anyWay = () => {
    const z = 2 * next() - 1, t = 2 * Math.PI * next(), s = Math.sqrt(1 - z * z);
    return new THREE.Vector3(s * Math.cos(t), z, s * Math.sin(t));
  };
  const planes: Plane[] = [];
  // A plane nearly as one before it (within APART) would meet it nearly flat: it is left out.
  const cut = (n: THREE.Vector3, d: number) => {
    if (planes.every((p) => p.n.dot(n) < Math.cos(ROCK.APART))) planes.push({ n, d });
  };
  for (const axis of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    // A face, turned from square towards a direction at random.
    const n = new THREE.Vector3(...axis), side = anyWay(), turn = ROCK.TURN * next();
    side.addScaledVector(n, -side.dot(n)).normalize();
    cut(n.multiplyScalar(Math.cos(turn)).addScaledVector(side, Math.sin(turn)), 0.8 + 0.2 * next());
  }
  // The breaks: across a corner (three faces) or an edge (two) at random, off square to it.
  const breaks = ROCK.BREAKS + Math.floor(3 * next());
  for (let k = 0; k < breaks; k++) {
    const across = new THREE.Vector3(next() < 0.5 ? -1 : 1, next() < 0.5 ? -1 : 1, next() < 0.5 ? -1 : 1);
    if (next() < 0.5) across.setComponent(Math.floor(3 * next()), 0);
    const n = across.normalize().addScaledVector(anyWay(), 0.3).normalize();
    cut(n, ROCK.BREAK + 0.15 * next());
  }
  // The flakes: how deep this rock's go, then each one's way, depth and whether it came off at all.
  const deep = next();
  for (let k = 0; k < ROCK.FLAKES; k++) {
    const n = anyWay(), d = ROCK.FLAKE + 0.06 * deep + 0.06 * next();
    if (next() < 0.75) cut(n, d);
  }
  const solid = solidOf(planes);
  // Fitted to its box: its size, its proportions and how deep it lies are set where it is placed.
  const box = new THREE.Box3().setFromPoints(solid.corners), mid = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (const x of solid.corners) x.sub(mid).divide(half);
  const geo = facets(solid, ROCK.DIVIDE);
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
 * The boulders' meshes: angular broken blocks, flat faces meeting in sharp edges (rockShape), with a rock's surface
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
