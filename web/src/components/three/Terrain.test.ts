import { describe, expect, it } from 'vitest';
import type { Heightmap, HeightmapMeta } from '@/lib/data/terrain';
import { latLonToPixel } from '@/lib/data/terrain';
import { contextHoleFor, gridToEnuRotationY } from './Terrain';

function meta(over: Partial<HeightmapMeta>): HeightmapMeta {
  return {
    site_id: 's', lat: -89.78, lon: -156.26, kind: 'window', source: 'synthetic', level: 'L0', cell_m: 20,
    width: 1024, height: 1024, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1,
    site_height_m: 0, line_offset_px: 511.5, sample_offset_px: 511.5, site_row_px: 511.5, site_col_px: 511.5, fill_source: null,
    ...over,
  };
}

describe('contextHoleFor', () => {
  it('is the detailed window half-extent expressed in cap pixels', () => {
    const window: Heightmap = { meta: meta({}), heightsM: new Float32Array(0) };
    const cap: Heightmap = { meta: meta({ kind: 'cap', cell_m: 960, width: 1940, height: 1940 }), heightsM: new Float32Array(0) };
    const hole = contextHoleFor(window, cap);
    // (1024 - 1) / 2 * 20 m = 10 230 m; / 960 m = 10.656 cap px on each side.
    expect(hole.halfCols).toBeCloseTo(10.656, 3);
    expect(hole.halfRows).toBeCloseTo(10.656, 3);
  });
});

describe('gridToEnuRotationY', () => {
  it('turns the polar-stereographic mesh so true north maps to -z and true east to +x at any longitude', () => {
    const KM_PER_DEG = (Math.PI * 1737.4) / 180;
    const D2R = Math.PI / 180;
    // 1 km cells with the pole at pixel (100, 100): the mesh axes are the grid axes (+x = cols, +z = rows).
    const geo = { cell_m: 1000, row0: 0, col0: 0, line_offset_px: 100, sample_offset_px: 100 };
    for (const site of [{ lat: -89.66, lon: 129.2 }, { lat: -88.5, lon: -87.1 }, { lat: -85, lon: 0 }, { lat: -89.78, lon: -156.26 }]) {
      const p0 = latLonToPixel(geo, site.lat, site.lon);
      const north = latLonToPixel(geo, site.lat + 1 / KM_PER_DEG, site.lon);
      // East is a finite difference along the parallel: keep the step tiny (20 m) so the chord matches the tangent
      // even at 89.8°S, where 1 km along the parallel spans several degrees of longitude.
      const dE = 0.02;
      const east = latLonToPixel(geo, site.lat, site.lon + dE / (KM_PER_DEG * Math.cos(site.lat * D2R)));
      const theta = gridToEnuRotationY(site.lon);
      // three.js rotation about +y: x' = x cos t + z sin t, z' = -x sin t + z cos t.
      const rot = (x: number, z: number) => [x * Math.cos(theta) + z * Math.sin(theta), -x * Math.sin(theta) + z * Math.cos(theta)];
      const n = rot(north.col - p0.col, north.row - p0.row);
      const e = rot((east.col - p0.col) / dE, (east.row - p0.row) / dE);
      expect(n[0]).toBeCloseTo(0, 2);
      expect(n[1]).toBeCloseTo(-1, 2);
      expect(e[0]).toBeCloseTo(1, 2);
      expect(e[1]).toBeCloseTo(0, 2);
    }
  });
});
