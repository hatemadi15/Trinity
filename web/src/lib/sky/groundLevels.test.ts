import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGround } from './groundLevels';
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
});
