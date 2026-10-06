import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOULDER_GLSL, BOULDERS, boulderMeshes, KINDS, PEBBLES, pebbleMesh, placeBoulders, placePebbles, ROCK, type RockKind, rockPlanes, rockShape, siteSeed } from './boulders';

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

  it('are rocks bedded in the ground, each with a sphere for its shadow that reaches its top as it lies, tilted, and is no wider than it', () => {
    const list = placeBoulders(7, null);
    const { group, spheres } = boulderMeshes(list, () => 10, 7);
    expect(group.children.length).toBe(list.length);
    expect(spheres.length).toBe(list.length);
    list.forEach((b, i) => {
      const mesh = group.children[i] as THREE.Mesh;
      expect(mesh.position.x).toBeCloseTo(b.x, 6);
      expect(mesh.position.z).toBeCloseTo(b.z, 6);
      // Its foot below the ground, and a half to two thirds of its height above it as it is bedded (a slab's top lower
      // than a block's), give or take its tilt: as it lies, turned and tilted.
      mesh.updateMatrixWorld(true);
      const pos = mesh.geometry.getAttribute('position');
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < pos.count; k++) {
        const y = new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld).y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      expect(lo).toBeLessThan(10);
      expect((hi - 10) / (2 * mesh.scale.y)).toBeGreaterThan(0.45);
      expect((hi - 10) / (2 * mesh.scale.y)).toBeLessThan(0.85);
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

  it('keep their places and sizes, a few of them long, each a third to a half bedded in the dust', () => {
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
        // Bedded: between a third and a half of its height under the ground, along its own height (its tilt lifts one end
        // of a long low slab out of the dust as it sinks the other).
        const pos = mesh.geometry.getAttribute('position');
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < pos.count; k++) {
          const y = mesh.position.y + mesh.scale.y * pos.getY(k);
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
        expect((10 - lo) / (hi - lo)).toBeGreaterThanOrEqual(1 / 3 - 1e-6);
        expect((10 - lo) / (hi - lo)).toBeLessThanOrEqual(1 / 2 + 1e-6);
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

  it('are stones, as broken rock is: faces nearly flat but for low swells, meeting in edges rounded a little, closed with no crack, not smooth pillows', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      for (const mesh of group.children as THREE.Mesh[]) {
        const tris = triangles(mesh), face = faceOf(mesh), facing = faceDirections(tris, face), sides = edgeTriangles(mesh, tris);
        // Closed: each edge of every triangle is the edge of exactly one other, corner for corner, so no crack opens.
        expect(sides.filter((along) => along.length !== 2)).toEqual([]);
        const within: number[] = [], across: number[] = [];
        for (const [a, b] of sides) if (a.area > 0 && b.area > 0) (face[a.at[0]] === face[b.at[0]] ? within : across).push(degrees(a.normal.angleTo(b.normal)));
        // Faces that swell, in low ripples: from one triangle to the next across a face the light turns, most often by a
        // degree or two (a flat face's does not turn at all, a pillow's by several degrees) ...
        within.sort((x, y) => x - y);
        expect(within[Math.floor(within.length / 2)]).toBeGreaterThan(0.3);
        expect(within[Math.floor(within.length / 2)]).toBeLessThan(3);
        // ... so they stay nearly flat: more than half of the rock's surface faces within 15 degrees of its face's way.
        let flat = 0, total = 0;
        for (const t of tris) {
          total += t.area;
          if (t.area > 0 && degrees(t.normal.angleTo(facing.get(face[t.at[0]])!)) <= 15) flat += t.area;
        }
        expect(flat / total).toBeGreaterThan(0.5);
        // Edges rounded a little: each face bends over where it meets the next, more than its swells turn it (by 5 degrees
        // or more from one triangle to the next), and the edges still read as edges, the light turning across one of them
        // by 10 degrees or more at once.
        expect(Math.max(...within)).toBeGreaterThanOrEqual(5);
        expect(Math.max(...across)).toBeGreaterThanOrEqual(10);
        // A handful of faces: the planes it was cut by.
        expect(facing.size).toBeGreaterThanOrEqual(7);
        expect(facing.size).toBeLessThanOrEqual(20);
      }
    }
  });

  it('are irregular, each its own: faces meeting at many angles, not a box or a die, and not all alike', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      const meshes = group.children as THREE.Mesh[], faces: number[] = [];
      for (const mesh of meshes) {
        const tris = triangles(mesh), face = faceOf(mesh), facing = faceDirections(tris, face);
        // The angles between faces that meet spread over 25 degrees or more, where a box's are all 90: each face's way
        // taken over the whole of it, as its swells and rounded edges turn it from one triangle to the next.
        const angles: number[] = [];
        for (const [a, b] of edgeTriangles(mesh, tris)) {
          const f = facing.get(face[a.at[0]]), g = b && facing.get(face[b.at[0]]);
          if (f && g && f !== g) angles.push(degrees(f.angleTo(g)));
        }
        expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(25);
        faces.push(facing.size);
      }
      // Not one shape copied: the rocks of a site have different numbers of faces.
      expect(new Set(faces).size).toBeGreaterThan(2);
    }
  });

  it('keep each rock as it lies from build to build: its kind, how high its middle sits, its turn and tilt, its size and its shade', () => {
    // Each rock's kind, the height of its middle, its turn and tilt, its scale and its shade, as the stones were first
    // drawn (the D2 prototype's, to the last digit).
    const drawn: [RockKind, ...number[]][] = [
      ['block', 0.063975, -0.107809, 4.870569, -0.022508, 0.235359, 0.19525, 0.220149, 0.295134],
      ['slab', 0.014554, -0.074451, 4.086895, 0.109555, 0.148619, 0.063916, 0.151769, 0.271744],
      ['block', 0.067596, 0.096764, 0.217209, -0.080342, 0.271417, 0.230904, 0.297561, 0.277266],
      ['block', 0.026036, 0.009743, 3.245743, -0.006622, 0.229112, 0.155117, 0.147981, 0.278263],
      ['lump', 0.019716, -0.07353, 0.2289, -0.100565, 0.157813, 0.097675, 0.152179, 0.284873],
      ['lump', 0.030516, 0.110462, 1.39961, 0.092511, 0.429947, 0.310472, 0.434348, 0.284862],
      ['block', 0.036412, 0.094953, 1.633492, -0.064273, 0.160737, 0.131935, 0.149064, 0.274655],
      ['lump', 0.012724, 0.007025, 4.446232, -0.09431, 0.36144, 0.227677, 0.343154, 0.285004],
      ['lump', 0.016761, 0.08963, 0.89363, -0.080962, 0.154677, 0.09643, 0.14547, 0.28803],
      ['slab', 0.020929, -0.046551, 2.340554, 0.064392, 0.154776, 0.069245, 0.145394, 0.28693],
      ['block', 0.030205, -0.029564, 1.271361, 0.014666, 0.152038, 0.127763, 0.148602, 0.264735],
      ['lump', 0.022122, 0.089756, 3.061183, 0.110516, 0.170691, 0.127172, 0.162913, 0.264102],
      ['block', 0.071257, 0.068885, 5.588085, 0.027521, 0.527375, 0.296984, 0.315546, 0.274841],
      ['block', 0.080019, 0.104068, 2.446443, -0.110625, 0.486549, 0.387498, 0.473608, 0.289328],
    ];
    const seed = siteSeed(-88.28, -64.31);
    const { group } = boulderMeshes(placeBoulders(seed, lander), () => 0, seed);
    expect(group.children.length).toBe(drawn.length);
    (group.children as THREE.Mesh[]).forEach((m, i) => {
      const [kind, ...was] = drawn[i];
      expect(m.name).toBe(`rock-${kind}`);
      const now = [m.position.y, m.rotation.x, m.rotation.y, m.rotation.z, m.scale.x, m.scale.y, m.scale.z, (m.material as THREE.MeshStandardMaterial).color.r];
      now.forEach((v, k) => expect(v).toBeCloseTo(was[k], 5));
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
        // This way and that across the rock, so smaller than it: the tilts all but cancel out over the whole of it, to
        // under 0.15 of their size (on its swelling faces and rounded edges, corners pushed out or in along normals that
        // turn with the surface cancel a little less well than on flat faces) ...
        const size = off.reduce((a, v, k) => a + v.length() * share[k], 0);
        expect(off.reduce((a, v, k) => a.addScaledVector(v, share[k]), new THREE.Vector3()).length()).toBeLessThan(0.15 * size);
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

describe('stones, not boxes', () => {
  const seeded = (seed: number) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  it('cuts each rock by 9 to 14 planes in random directions, no two within 24° and no pair within 20.6° of opposite, then closes it', () => {
    for (const kind of ['block', 'lump', 'slab'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const planes = rockPlanes(seeded(seed * 7919), kind);
        const main = planes.filter((p) => !p.closing);
        expect(main.length).toBeGreaterThanOrEqual(KINDS[kind].planes[0]);
        expect(main.length).toBeLessThanOrEqual(KINDS[kind].planes[1]);
        for (let i = 0; i < main.length; i++)
          for (let j = i + 1; j < main.length; j++) {
            const a = main[i].n.angleTo(main[j].n);
            expect(a).toBeGreaterThanOrEqual(ROCK.APART - 1e-9);
            expect(Math.PI - a).toBeGreaterThanOrEqual(ROCK.ANTI - 1e-9);
          }
        // Closed all round: every direction lies within 60° of some plane's normal.
        for (let k = 0; k < 48; k++) {
          const y = 1 - (2 * k + 1) / 48, r = Math.sqrt(1 - y * y), t = k * 2.399963;
          const dir = new THREE.Vector3(r * Math.cos(t), y, r * Math.sin(t));
          expect(Math.max(...planes.map((p) => p.n.dot(dir)))).toBeGreaterThanOrEqual(ROCK.COVER - 1e-9);
        }
      }
    }
  });

  it('rounds the edges inward and swells the faces by no more than the kind’s noise, with every corner finite', () => {
    for (const kind of ['block', 'lump', 'slab'] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const next = seeded(seed * 104729);
        const planes = rockPlanes(seeded(seed * 104729), kind);
        const geo = rockShape(next, kind);
        const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
        // The box the shape was fitted from, to take each corner back to where its planes cut it.
        const box = geo.userData.fittedFrom as THREE.Box3, mid = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
          expect(Number.isFinite(nor.getX(i) + nor.getY(i) + nor.getZ(i))).toBe(true);
          // Within the planes, the box fit undone, but for the swell (noise, in the rock's size).
          v.multiply(half).add(mid);
          expect(Math.max(...planes.map((p) => p.n.dot(v) - p.d)) / Math.max(1e-6, v.length())).toBeLessThanOrEqual(KINDS[kind].noise * 1.5 + 0.02);
        }
      }
    }
  });

  it('beds each stone a third to a half of its height into the ground, a shade lighter than the dust, named by its kind', () => {
    const list = placeBoulders(12345, null);
    const { group } = boulderMeshes(list, () => 0, 12345);
    expect(group.children.length).toBe(list.length);
    for (const m of group.children as THREE.Mesh[]) {
      const kind = m.name.replace('rock-', '') as RockKind;
      expect(KINDS[kind]).toBeDefined();
      const hh = m.scale.y, bedded = (0 - (m.position.y - hh)) / (2 * hh);
      expect(bedded).toBeGreaterThanOrEqual((1 - KINDS[kind].lift[1]) / 2 - 1e-6);
      expect(bedded).toBeLessThanOrEqual((1 - KINDS[kind].lift[0]) / 2 + 1e-6);
      // A shade lighter than the dust's grey, 1 to 1.15 times it, in the linear light three keeps colours in (0x8b is
      // about 0.26 there, not 0x8b / 255).
      const c = (m.material as THREE.MeshStandardMaterial).color, dust = new THREE.Color(0x8b8781).r;
      expect(c.r).toBeGreaterThanOrEqual(dust - 1e-6);
      expect(c.r).toBeLessThanOrEqual(dust * 1.15 + 1e-6);
    }
  });

  it('mixes the kinds by their shares over many seeds', () => {
    const counts = { block: 0, lump: 0, slab: 0 };
    let total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const list = placeBoulders(seed, null);
      for (const m of boulderMeshes(list, () => 0, seed).group.children) {
        counts[m.name.replace('rock-', '') as RockKind]++;
        total++;
      }
    }
    for (const kind of ['block', 'lump', 'slab'] as const) expect(Math.abs(counts[kind] / total - KINDS[kind].share)).toBeLessThan(0.08);
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

/** Each edge of a rock's triangles, by the places of its two ends: the triangles along it (two, if no crack opens). */
function edgeTriangles(mesh: THREE.Mesh, tris: Triangle[]): Triangle[][] {
  const pos = mesh.geometry.getAttribute('position');
  const place = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(6)).join();
  const sides = new Map<string, Triangle[]>();
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const key = [place(t.at[e]), place(t.at[(e + 1) % 3])].sort().join('|');
      sides.set(key, [...(sides.get(key) ?? []), t]);
    }
  }
  return [...sides.values()];
}

/**
 * The face each corner of a rock's mesh lies on: a face has corners of its own, joined to each other by its triangles
 * and to no other face's, so the corners a triangle joins are one face.
 */
function faceOf(mesh: THREE.Mesh): number[] {
  const index = mesh.geometry.getIndex()!, face = Array.from({ length: mesh.geometry.getAttribute('position').count }, (_, i) => i);
  const root = (i: number) => {
    while (face[i] !== i) i = face[i] = face[face[i]];
    return i;
  };
  for (let k = 0; k < index.count; k += 3) {
    face[root(index.getX(k))] = root(index.getX(k + 1));
    face[root(index.getX(k + 1))] = root(index.getX(k + 2));
  }
  return face.map((_, i) => root(i));
}

/** Each face's way: the mean of its triangles' normals, each counted by its area (a face of slivers alone has none). */
function faceDirections(tris: Triangle[], face: number[]): Map<number, THREE.Vector3> {
  const out = new Map<number, THREE.Vector3>();
  for (const t of tris) if (t.area > 0) out.set(face[t.at[0]], (out.get(face[t.at[0]]) ?? new THREE.Vector3()).addScaledVector(t.normal, t.area));
  for (const n of out.values()) n.normalize();
  return out;
}
