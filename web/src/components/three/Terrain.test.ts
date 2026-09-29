import { describe, expect, it } from 'vitest';
import type { Heightmap, HeightmapMeta } from '@/lib/data/terrain';
import { contextHoleFor } from './Terrain';

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
