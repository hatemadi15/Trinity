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
    const g = buildGround(terrainField(levels(), -64.31, 100), { fast: false, halfFloat: false, viewerY: 2 });
    expect(g).toHaveLength(3);
    expect(u(g[2]).uL0.value.z).toBe(960);
    expect(g.map((m) => u(m).uDetail.value)).toEqual([1, 0, 0]);
    expect(u(g[0]).uViewer.value.y).toBe(2);
  });

  it('draws flat ground on the curved Moon without levels', () => {
    const flat = buildGround(flatField(0), { fast: false, halfFloat: false, viewerY: 2 });
    expect(flat).toHaveLength(1);
  });

  /** The cell sizes in a mesh's three slots, by its uniforms, for as many slots as it has. */
  const slots = (m: THREE.Mesh) => [u(m).uL0.value.z, u(m).uL1.value.z, u(m).uL2.value.z].slice(0, u(m).uLevels.value);

  it('gives each mesh its own height slots: its level, the next, and the cap last, so far hills always shade it', () => {
    const g = buildGround(terrainField(levels(), 0, 100), { fast: false, halfFloat: false, viewerY: 2 });
    expect(g.map(slots)).toEqual([[20, 80, 960], [80, 960], [960]]);
    // One texture for each level, shared by every mesh that reads it.
    expect(u(g[0]).uH2.value).toBe(u(g[2]).uH0.value);
  });

  it('cuts every level round two cells inside its nearest side, fading over the ring inside the cut into the next level, whose round hole opens a cell inside the cut', () => {
    expect(edgeOf(5000, 20)).toEqual({ ringIn: 3720, ringOut: 4940, cut: 4960 });
    const g = buildGround(terrainField(levels(), 0, 100), { fast: false, halfFloat: false, viewerY: 2 });
    expect(u(g[0]).uHoleR.value).toBe(0);
    for (let k = 0; k < 2; k++) {
      const e = u(g[k]).uEdge.value as THREE.Vector3;
      expect(e.x).toBeLessThan(e.y);
      expect(e.y).toBeLessThan(e.z);
      expect(u(g[k + 1]).uHoleR.value).toBeCloseTo(e.y, 6);
    }
    // The cap has nothing beyond it to fade into.
    expect((u(g[2]).uEdge.value as THREE.Vector3).x).toBeGreaterThan(1e8);
  });
});
