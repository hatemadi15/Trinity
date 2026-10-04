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

  it('are lumpy rocks sunk a little into the ground, each with a sphere for its shadow that reaches its top', () => {
    const list = placeBoulders(7, null);
    const { group, spheres } = boulderMeshes(list, () => 10, 7);
    expect(group.children.length).toBe(list.length);
    expect(spheres.length).toBe(list.length);
    list.forEach((b, i) => {
      const mesh = group.children[i];
      expect(mesh.position.x).toBeCloseTo(b.x, 6);
      expect(mesh.position.z).toBeCloseTo(b.z, 6);
      // Its foot below the ground, its top about its radius above it.
      mesh.updateMatrixWorld(true);
      const pos = (mesh as unknown as { geometry: { getAttribute: (n: string) => { count: number; getY: (i: number) => number } } }).geometry.getAttribute('position');
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k) * mesh.scale.y + mesh.position.y;
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      }
      expect(lo).toBeLessThan(10);
      expect(hi - 10).toBeGreaterThan(0.75 * b.r);
      expect(hi - 10).toBeLessThan(1.45 * b.r);
      // The shadow's sphere: where the rock is, reaching about as high.
      const s = spheres[i];
      expect(s.x).toBeCloseTo(b.x, 6);
      expect(s.z).toBeCloseTo(b.z, 6);
      // Its top at the rock's highest corner.
      expect(s.y + s.w - 10).toBeCloseTo(hi - 10, 6);
    });
  });

  it('cast their shadows in the ground shader, every loop scaled so the compiler cannot unroll it', () => {
    expect(BOULDER_GLSL).toContain('float rocksClearance(vec3 p, vec3 L)');
    expect(BOULDER_GLSL).toContain(`uniform vec4 uRocks[${BOULDERS.MAX}]`);
    expect(BOULDER_GLSL).toMatch(/for \(int i = 0; i < \d+ \* uOne; i\+\+\)/);
  });

  it('are rounded rocks of uneven radius, worn smooth, not faceted blocks, and stay close to the shape their shadows are cast from', () => {
    for (const seed of [7, siteSeed(-88.28, -64.31)]) {
      const { group } = boulderMeshes(placeBoulders(seed, null), () => 0, seed);
      for (const mesh of group.children as THREE.Mesh[]) {
        expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
        const pos = mesh.geometry.getAttribute('position'), nor = mesh.geometry.getAttribute('normal'), index = mesh.geometry.getIndex()!;
        // Enough corners to look round, each one shared by every face round it, so each has one normal and no seam opens.
        expect(pos.count).toBeGreaterThanOrEqual(250);
        expect(new Set(Array.from({ length: pos.count }, (_, k) => [pos.getX(k), pos.getY(k), pos.getZ(k)].map((v) => v.toFixed(4)).join())).size).toBe(pos.count);
        // Smooth: the normals at the two ends of every edge within 25 degrees of each other, so no crease shows.
        let worst = 0;
        for (let k = 0; k < index.count; k += 3) {
          for (let j = 0; j < 3; j++) {
            const a = new THREE.Vector3().fromBufferAttribute(nor, index.getX(k + j)), b = new THREE.Vector3().fromBufferAttribute(nor, index.getX(k + ((j + 1) % 3)));
            worst = Math.max(worst, a.angleTo(b));
          }
        }
        expect(worst).toBeLessThan((25 * Math.PI) / 180);
        // Uneven, not a smooth ellipsoid, yet within a fifth of its radius everywhere: the sphere its shadow is cast
        // from stands for it.
        let lo = Infinity, hi = 0;
        for (let k = 0; k < pos.count; k++) {
          const r = Math.hypot(pos.getX(k), pos.getY(k), pos.getZ(k));
          lo = Math.min(lo, r);
          hi = Math.max(hi, r);
        }
        expect(lo).toBeGreaterThanOrEqual(0.8);
        expect(hi).toBeLessThanOrEqual(1.2);
        expect(lo / hi).toBeLessThan(0.85);
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
