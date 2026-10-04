import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOULDER_GLSL, BOULDERS, boulderMeshes, PEBBLES, pebbleMesh, placeBoulders, placePebbles, siteSeed } from './boulders';

describe('the boulders near the eye', () => {
  const lander = { x: 16 * Math.sin(Math.PI / 4), z: -16 * Math.cos(Math.PI / 4) };

  it('stay where they are for a site, and differ from site to site', () => {
    const a = placeBoulders(siteSeed(-88.28, -64.31), lander);
    expect(placeBoulders(siteSeed(-88.28, -64.31), lander)).toEqual(a);
    expect(placeBoulders(siteSeed(-89.45, -136.9), lander)).not.toEqual(a);
  });

  it('lie 6 to 45 m out, 0.3 to 1.2 m across, few of them large', () => {
    const list = placeBoulders(siteSeed(-88.28, -64.31), null);
    expect(list.length).toBe(BOULDERS.COUNT);
    for (const b of list) {
      const d = Math.hypot(b.x, b.z);
      expect(d).toBeGreaterThanOrEqual(BOULDERS.NEAR_M);
      expect(d).toBeLessThanOrEqual(BOULDERS.FAR_M);
      expect(b.r).toBeGreaterThanOrEqual(BOULDERS.R_MIN);
      expect(b.r).toBeLessThanOrEqual(BOULDERS.R_MAX);
    }
    expect(list.filter((b) => b.r > 0.4).length).toBeLessThan(list.length / 3);
  });

  it('keep off the lander and out of the way between the eye and it, and apart from each other', () => {
    for (const seed of [1, 2, 3, 4, 5, siteSeed(-88.28, -64.31)]) {
      const list = placeBoulders(seed, lander);
      const ld = Math.hypot(lander.x, lander.z);
      for (const b of list) {
        expect(Math.hypot(b.x - lander.x, b.z - lander.z)).toBeGreaterThanOrEqual(4 + b.r);
        const t = (b.x * lander.x + b.z * lander.z) / (ld * ld);
        if (t > 0 && t < 1) expect(Math.abs(b.x * lander.z - b.z * lander.x) / ld).toBeGreaterThanOrEqual(b.r + 1.5);
        for (const o of list) if (o !== b) expect(Math.hypot(o.x - b.x, o.z - b.z)).toBeGreaterThanOrEqual(o.r + b.r + 0.5);
      }
    }
  });

  it('are rocks sunk a little into the ground, each with a sphere for its shadow that reaches its top as it lies, tilted, and is no wider than it', () => {
    const list = placeBoulders(7, null);
    const { group, spheres } = boulderMeshes(list, () => 10, 7);
    expect(group.children.length).toBe(list.length);
    expect(spheres.length).toBe(list.length);
    list.forEach((b, i) => {
      const mesh = group.children[i] as THREE.Mesh;
      expect(mesh.position.x).toBeCloseTo(b.x, 6);
      expect(mesh.position.z).toBeCloseTo(b.z, 6);
      // Its foot below the ground, its top about its radius above it, as it lies: turned and tilted.
      mesh.updateMatrixWorld(true);
      const pos = mesh.geometry.getAttribute('position');
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < pos.count; k++) {
        const y = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld).y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      expect(lo).toBeLessThan(10);
      expect(hi - 10).toBeGreaterThan(0.75 * b.r);
      expect(hi - 10).toBeLessThan(1.45 * b.r);
      // The shadow's sphere: where the rock is, its top at the rock's highest point.
      const s = spheres[i];
      expect(s.x).toBeCloseTo(b.x, 6);
      expect(s.z).toBeCloseTo(b.z, 6);
      expect(s.y + s.w - 10).toBeCloseTo(hi - 10, 6);
      // No wider than the rock's narrower side, and most of it: its shadow is the rock's, not a wider one or a thread.
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      const half = [((box.max.x - box.min.x) / 2) * mesh.scale.x, ((box.max.z - box.min.z) / 2) * mesh.scale.z];
      expect(s.w).toBeLessThanOrEqual(Math.min(...half) + 1e-9);
      expect(s.w).toBeGreaterThanOrEqual(0.6 * Math.sqrt(half[0] * half[1]));
    });
  });

  it('keep their places and sizes, a few of them long, each a quarter to a third bedded in the dust', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31), siteSeed(-89.45, -136.9)]) {
      const list = placeBoulders(seed, null);
      const { group } = boulderMeshes(list, () => 10, seed);
      let long = 0;
      list.forEach((b, i) => {
        const mesh = group.children[i] as THREE.Mesh;
        expect([mesh.position.x, mesh.position.z]).toEqual([b.x, b.z]);
        // As wide as its radius says, taking its length and width together: a long rock is as big, only longer.
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!;
        const lx = ((box.max.x - box.min.x) / 2) * mesh.scale.x, lz = ((box.max.z - box.min.z) / 2) * mesh.scale.z;
        expect(Math.sqrt(lx * lz) / b.r).toBeCloseTo(1, 2);
        if (Math.max(lx, lz) / Math.min(lx, lz) >= 1.3) long++;
        // Partly buried: between a fifth and two fifths of its height under the ground.
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.getAttribute('position');
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < pos.count; k++) {
          const y = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld).y;
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
        expect((10 - lo) / (hi - lo)).toBeGreaterThan(0.2);
        expect((10 - lo) / (hi - lo)).toBeLessThan(0.4);
      });
      // A few long ones, not most.
      expect(long).toBeGreaterThanOrEqual(1);
      expect(long).toBeLessThanOrEqual(list.length / 2);
    }
  });

  it('cast their shadows in the ground shader, every loop scaled so the compiler cannot unroll it', () => {
    expect(BOULDER_GLSL).toContain('float rocksClearance(vec3 p, vec3 L)');
    expect(BOULDER_GLSL).toContain(`uniform vec4 uRocks[${BOULDERS.MAX}]`);
    expect(BOULDER_GLSL).toMatch(/for \(int i = 0; i < \d+ \* uOne; i\+\+\)/);
  });

  it('are angular blocks, as broken rock is: flat fracture faces that meet in sharp edges, closed with no crack, not smooth pillows', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      for (const mesh of group.children as THREE.Mesh[]) {
        const tris = triangles(mesh), nor = shapeNormals(mesh);
        // Flat faces: the light does not bend across a face. At every corner of every triangle the shape's normal (without
        // the small bumps) is the triangle's own, where a pillow's turns from corner to corner.
        let bend = 0;
        for (const t of tris) if (t.area > 0) for (const k of t.at) bend = Math.max(bend, degrees(new THREE.Vector3().fromBufferAttribute(nor, k).angleTo(t.normal)));
        expect(bend).toBeLessThan(0.5);
        // Closed: each edge of every triangle is the edge of exactly one other, corner for corner, so no crack opens.
        const sides = edgeNormals(mesh, tris);
        expect([...sides.values()].filter((normals) => normals.length !== 2)).toEqual([]);
        // Sharp edges: across an edge the light either does not turn at all (within a face) or turns at once by 10
        // degrees or more (where two faces meet), never by the few degrees from one triangle to the next of a rounded edge.
        const turns = [...sides.values()].map(([a, b]) => degrees(a.angleTo(b)));
        const creases = turns.filter((t) => t > 0.5);
        expect(creases.length).toBeGreaterThan(0);
        expect(Math.min(...creases)).toBeGreaterThanOrEqual(10);
        // A handful of faces: the block's own and the planes where pieces broke away.
        expect(faceCount(tris)).toBeGreaterThanOrEqual(7);
        expect(faceCount(tris)).toBeLessThanOrEqual(20);
      }
    }
  });

  it('are irregular, each its own: faces meeting at many angles, not a box or a die, and not all alike', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      const meshes = group.children as THREE.Mesh[];
      for (const mesh of meshes) {
        const tris = triangles(mesh);
        // The angles at its edges spread over 25 degrees or more, where a box's are all 90.
        const creases = [...edgeNormals(mesh, tris).values()].map(([a, b]) => degrees(a.angleTo(b))).filter((t) => t > 0.5);
        expect(Math.max(...creases) - Math.min(...creases)).toBeGreaterThan(25);
      }
      // Not one shape copied: the rocks of a site have different numbers of faces.
      expect(new Set(meshes.map((m) => faceCount(triangles(m)))).size).toBeGreaterThan(2);
    }
  });

  it('keep each rock where it lies: as big and as long, turned, tilted and bedded as before, as light or dark; only its shape is new', () => {
    // Each rock's height of its middle, its turn and tilt, its scale and its shade, as they were before its edges were made sharp.
    const before = [
      [0.07526, 0.113354, 5.777775, -0.058873, 0.22971, 0.165779, 0.225563, 0.266943],
      [0.056052, -0.071714, 0.849908, -0.106653, 0.190575, 0.118951, 0.118356, 0.260469],
      [0.063543, -0.124987, 4.264582, 0.012831, 0.27915, 0.191618, 0.289318, 0.248074],
      [0.06664, -0.047244, 5.732535, 0.101368, 0.183984, 0.140356, 0.184278, 0.268702],
      [0.039947, 0.049648, 3.079195, -0.117199, 0.197815, 0.109622, 0.121405, 0.240885],
      [0.154211, -0.114488, 4.997079, -0.018358, 0.433059, 0.335129, 0.431225, 0.24274],
      [0.044899, 0.05191, 0.771323, -0.117642, 0.150794, 0.109267, 0.158892, 0.25156],
      [0.094141, -0.026669, 0.089281, -0.012273, 0.412036, 0.253085, 0.301017, 0.256455],
      [0.038093, 0.015261, 0.935795, 0.075957, 0.152204, 0.089955, 0.147834, 0.274473],
      [0.039891, -0.115108, 4.788767, -0.021157, 0.197634, 0.11105, 0.113865, 0.235328],
      [0.045918, -0.104076, 6.230247, 0.124574, 0.179576, 0.100502, 0.125814, 0.280516],
      [0.050249, 0.094453, 3.522184, -0.042936, 0.158566, 0.108753, 0.17537, 0.257221],
      [0.122569, -0.021997, 5.272562, 0.016645, 0.415315, 0.314354, 0.400686, 0.245775],
      [0.134405, -0.110625, 1.972306, 0.081889, 0.499618, 0.324872, 0.461219, 0.265238],
    ];
    const seed = siteSeed(-88.28, -64.31);
    const { group } = boulderMeshes(placeBoulders(seed, lander), () => 0, seed);
    expect(group.children.length).toBe(before.length);
    (group.children as THREE.Mesh[]).forEach((m, i) => {
      const now = [m.position.y, m.rotation.x, m.rotation.y, m.rotation.z, m.scale.x, m.scale.y, m.scale.z, (m.material as THREE.MeshStandardMaterial).color.r];
      now.forEach((v, k) => expect(v).toBeCloseTo(before[i][k], 5));
    });
  });

  it('are lighter and darker in patches across each rock, as rock is, not one flat grey', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      for (const mesh of group.children as THREE.Mesh[]) {
        // A colour at each corner, which the material's grey is multiplied by.
        expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
        const colour = mesh.geometry.getAttribute('color'), index = mesh.geometry.getIndex()!;
        expect(colour.count).toBe(mesh.geometry.getAttribute('position').count);
        const tone = Array.from({ length: colour.count }, (_, k) => 0.2126 * colour.getX(k) + 0.7152 * colour.getY(k) + 0.0722 * colour.getZ(k));
        // Each corner stands for its share of the surface, as a small face has as many corners as a large one: at(q) is
        // the tone that q of the rock's surface is darker than.
        const share = cornerShares(mesh), order = tone.map((_, k) => k).sort((a, b) => tone[a] - tone[b]);
        const at = (q: number) => {
          let sum = 0;
          for (const k of order) if ((sum += share[k]) >= q) return tone[k];
          return tone[order[order.length - 1]];
        };
        const mid = at(0.5), mean = tone.reduce((a, t, k) => a + t * share[k], 0);
        // Its grey as before on the whole, with a tenth of it or more a tenth darker or lighter than the middle, and no
        // spot nearly black or white.
        expect(mean).toBeCloseTo(1, 6);
        expect(at(0.1)).toBeLessThan(0.9 * mid);
        expect(at(0.9)).toBeGreaterThan(1.1 * mid);
        expect(tone[order[0]]).toBeGreaterThan(0.5 * mid);
        expect(tone[order[order.length - 1]]).toBeLessThan(1.6 * mid);
        // In patches, not a speckle: the two ends of an edge differ by a small part of that spread.
        let step = 0;
        for (let k = 0; k < index.count; k++) step += Math.abs(tone[index.getX(k)] - tone[index.getX(k - (k % 3) + ((k + 1) % 3))]);
        expect(step / index.count).toBeLessThan(0.25 * (at(0.9) - at(0.1)));
      }
    }
  });

  it('have small bumps the light catches, smaller than the rock, while their shape stays: the normals they are lit with tilt a few degrees off the shape’s, this way and that', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      for (const mesh of group.children as THREE.Mesh[]) {
        const drawn = mesh.geometry.getAttribute('normal'), shape = shapeNormals(mesh), index = mesh.geometry.getIndex()!;
        const off = Array.from({ length: drawn.count }, (_, k) => new THREE.Vector3().fromBufferAttribute(drawn, k).sub(new THREE.Vector3().fromBufferAttribute(shape, k)));
        const tilt = off.map((_, k) => THREE.MathUtils.radToDeg(new THREE.Vector3().fromBufferAttribute(drawn, k).angleTo(new THREE.Vector3().fromBufferAttribute(shape, k))));
        const sorted = [...tilt].sort((a, b) => a - b), share = cornerShares(mesh);
        // A few degrees on the whole (each corner counted by its share of the surface), and bumps, not a change of
        // shape: under 25 degrees at the most tilted corners.
        const mean = tilt.reduce((a, t, k) => a + t * share[k], 0);
        expect(mean).toBeGreaterThan(2);
        expect(mean).toBeLessThan(8);
        expect(sorted[Math.floor(0.99 * (sorted.length - 1))]).toBeLessThan(25);
        // This way and that across the rock, so smaller than it: the tilts all but cancel out over the whole of it ...
        const size = off.reduce((a, v, k) => a + v.length() * share[k], 0);
        expect(off.reduce((a, v, k) => a.addScaledVector(v, share[k]), new THREE.Vector3()).length()).toBeLessThan(0.1 * size);
        // ... and each spread over several corners, a bump the light can catch, not a speckle from corner to corner.
        let step = 0;
        for (let k = 0; k < index.count; k++) step += off[index.getX(k)].distanceTo(off[index.getX(k - (k % 3) + ((k + 1) % 3))]);
        expect(step / index.count).toBeLessThan(0.6 * (off.reduce((a, v) => a + v.length(), 0) / off.length));
      }
    }
  });

  it('come with hundreds of pebbles strewn round the eye, 3 to 20 cm across, few large, clear of the lander and of your feet', () => {
    const lander = { x: 16, z: 0 };
    const list = placePebbles(siteSeed(-88.28, -64.31), lander);
    expect(list.length).toBe(PEBBLES.COUNT);
    for (const p of list) {
      const d = Math.hypot(p.x, p.z);
      expect(d).toBeGreaterThanOrEqual(PEBBLES.NEAR_M);
      expect(d).toBeLessThanOrEqual(PEBBLES.FAR_M);
      expect(p.r).toBeGreaterThanOrEqual(0.015);
      expect(p.r).toBeLessThanOrEqual(0.1);
      expect(Math.hypot(p.x - lander.x, p.z - lander.z)).toBeGreaterThanOrEqual(2.5);
    }
    expect(list.filter((p) => p.r > 0.06).length).toBeLessThan(list.length / 5);
    const mesh = pebbleMesh(list, () => 0, 7);
    expect(mesh.count).toBe(list.length);
  });
});

/** A rock's shape as its corners give it, without the bumps it is lit with: the normals worked out again from them. */
function shapeNormals(mesh: THREE.Mesh): THREE.BufferAttribute {
  const shape = mesh.geometry.clone();
  shape.computeVertexNormals();
  return shape.getAttribute('normal') as THREE.BufferAttribute;
}

const degrees = (rad: number) => THREE.MathUtils.radToDeg(rad);

/** Each corner's share of a rock's surface: a third of each triangle round it, over the whole. */
function cornerShares(mesh: THREE.Mesh): number[] {
  const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex()!;
  const share = new Array<number>(pos.count).fill(0);
  let total = 0;
  for (let k = 0; k < index.count; k += 3) {
    const at = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
    const [a, b, c] = at.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    for (const i of at) share[i] += area / 3;
    total += area;
  }
  return share.map((s) => s / total);
}

/** A triangle of a rock: its corners' indices, its own normal from its corners' places, and its area. */
type Triangle = { at: number[]; normal: THREE.Vector3; area: number };
/** A triangle too small for its corners' places (kept to a float's precision) to give its normal truly. */
const SLIVER = 1e-7;

/** Each triangle of a rock's mesh. */
function triangles(mesh: THREE.Mesh): Triangle[] {
  const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex()!;
  const out: Triangle[] = [];
  for (let k = 0; k < index.count; k += 3) {
    const at = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
    const [a, b, c] = at.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i));
    const cross = b.sub(a).cross(c.sub(a));
    if (cross.length() / 2 > SLIVER) out.push({ at, normal: cross.clone().normalize(), area: cross.length() / 2 });
    else out.push({ at, normal: new THREE.Vector3(), area: 0 });
  }
  return out;
}

/**
 * Each edge of a rock's triangles, by the places of its two ends, with the normals of the triangles along it (a
 * sliver's left out of the normals, its edge still counted by a zero normal).
 */
function edgeNormals(mesh: THREE.Mesh, tris: Triangle[]): Map<string, THREE.Vector3[]> {
  const pos = mesh.geometry.getAttribute('position');
  const place = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(6)).join();
  const sides = new Map<string, THREE.Vector3[]>();
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const key = [place(t.at[e]), place(t.at[(e + 1) % 3])].sort().join('|');
      sides.set(key, [...(sides.get(key) ?? []), t.normal]);
    }
  }
  // Only the edges between two true triangles count for how the light turns; every edge counts for the crack.
  for (const [key, normals] of sides) {
    const real = normals.find((n) => n.lengthSq() > 0);
    if (normals.length === 2 && real && normals.some((n) => n.lengthSq() === 0)) sides.set(key, [real, real]);
  }
  return sides;
}

/** How many flat faces a rock has: its triangles' normals, those within a degree of each other counted as one. */
function faceCount(tris: Triangle[]): number {
  const faces: THREE.Vector3[] = [];
  for (const t of tris) if (t.area > 0 && !faces.some((n) => n.angleTo(t.normal) < Math.PI / 180)) faces.push(t.normal);
  return faces.length;
}
