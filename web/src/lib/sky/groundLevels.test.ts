import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGround, edgeOf } from './groundLevels';
import { flatField, terrainField } from './terrainField';

/** Three square levels of constant height, coarse to fine, as `shadowLevels` returns them. */
function levels() {
  const level = (n: number, cell: number, h: number) => ({ heights: new Float32Array(n * n).fill(h), width: n, height: n, pxM: cell, siteCol: (n - 1) / 2, siteRow: (n - 1) / 2 });
  return [level(481, 960, 100), level(512, 80, 100), level(1024, 20, 100)];
}
const u = (m: THREE.Mesh) => (m.material as THREE.ShaderMaterial).uniforms;

describe('the measured ground', () => {
  it('builds one mesh a level, finest first, the cap last, with the near detail on the finest alone', () => {
    const g = buildGround(terrainField(levels(), -64.31, 100), { fast: false, flight: false, halfFloat: false, viewerY: 2 });
    expect(g.meshes).toHaveLength(3);
    expect(g.cap).toBe(g.meshes[2]);
    expect(g.capRing).toBeNull();
    expect(g.meshes.map((m) => u(m).uDetail.value)).toEqual([1, 0, 0]);
    expect(u(g.meshes[0]).uViewer.value.y).toBe(2);
  });

  it('adds the cap’s coarser ring in flight, and flat ground on the curved Moon without levels', () => {
    const fly = buildGround(terrainField(levels(), 0, 100), { fast: false, flight: true, halfFloat: false, viewerY: 2 });
    expect(fly.meshes).toHaveLength(4);
    expect(fly.capRing).toBe(fly.meshes[3]);
    const flat = buildGround(flatField(0), { fast: false, flight: false, halfFloat: false, viewerY: 2 });
    expect(flat.meshes).toHaveLength(1);
    expect(flat.cap).toBeNull();
  });

  /** The cell sizes in a mesh's three slots, by its uniforms, for as many slots as it has. */
  const slots = (m: THREE.Mesh) => [u(m).uL0.value.z, u(m).uL1.value.z, u(m).uL2.value.z].slice(0, u(m).uLevels.value);
  const flightLevel = () => ({ heights: new Float32Array(1024 * 1024).fill(100), width: 1024, height: 1024, pxM: 240, siteCol: 511.5, siteRow: 511.5 });

  it('gives each mesh its own height slots: its level, the next, and the cap last, so far hills always shade it', () => {
    const g = buildGround(terrainField(levels(), 0, 100), { fast: false, flight: false, halfFloat: false, viewerY: 2 });
    expect(g.meshes.map(slots)).toEqual([[20, 80, 960], [80, 960], [960]]);
    expect(g.meshes.map((m) => u(m).uPixel.value)).toEqual([0, 0, 0]);
    // One texture for each level, shared by every mesh that reads it.
    expect(u(g.meshes[0]).uH2.value).toBe(u(g.meshes[2]).uH0.value);
  });

  it('draws the flight level in flight between the context and the cap, at every other cell, its light from per-pixel slopes', () => {
    const field = terrainField(levels(), 0, 100, flightLevel());
    const g = buildGround(field, { fast: false, flight: true, halfFloat: false, viewerY: 2 });
    expect(g.meshes).toHaveLength(5);
    expect(g.meshes.slice(0, 4).map(slots)).toEqual([[20, 80, 960], [80, 240, 960], [240, 960], [960]]);
    expect(g.cap).toBe(g.meshes[3]);
    expect(g.capRing).toBe(g.meshes[4]);
    expect(g.meshes.map((m) => u(m).uPixel.value)).toEqual([0, 0, 1, 0, 0]);
    const p = g.meshes[2].geometry.getAttribute('position');
    let reach = 0;
    for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.abs(p.getX(i)), Math.abs(p.getZ(i)));
    expect(reach).toBeGreaterThan(115000);
    expect(Math.hypot(p.getX(1) - p.getX(0), p.getZ(1) - p.getZ(0))).toBeCloseTo(480, 3);
    // Standing (the stand view), the flight level is never drawn.
    expect(buildGround(field, { fast: false, flight: false, halfFloat: false, viewerY: 2 }).meshes).toHaveLength(3);
  });

  it('cuts every level round two cells inside its nearest side, fading over the ring inside the cut into the next level, whose round hole opens a cell inside the cut', () => {
    expect(edgeOf(5000, 20)).toEqual({ ringIn: 3720, ringOut: 4940, cut: 4960 });
    const field = terrainField(levels(), 0, 100, flightLevel());
    for (const flight of [false, true]) {
      const g = buildGround(field, { fast: false, flight, halfFloat: false, viewerY: 2 });
      const n = flight ? 4 : 3;
      expect(u(g.meshes[0]).uHoleR.value).toBe(0);
      for (let k = 0; k < n - 1; k++) {
        const e = u(g.meshes[k]).uEdge.value as THREE.Vector3;
        expect(e.x).toBeLessThan(e.y);
        expect(e.y).toBeLessThan(e.z);
        expect(u(g.meshes[k + 1]).uHoleR.value).toBeCloseTo(e.y, 6);
      }
      // The cap has nothing beyond it to fade into (its far edge is uFarCut's), nor has its ring.
      expect((u(g.meshes[n - 1]).uEdge.value as THREE.Vector3).x).toBeGreaterThan(1e8);
      if (flight) expect((u(g.meshes[4]).uEdge.value as THREE.Vector3).x).toBeGreaterThan(1e8);
      // The next level's slope: across 2 cells where its mesh softens it, across 1 for the flight level's per-pixel light.
      expect(g.meshes.slice(0, n - 1).map((m) => u(m).uNextStep.value)).toEqual(flight ? [2, 1, 2] : [2, 2]);
    }
  });
});
