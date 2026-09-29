import { describe, expect, it } from 'vitest';
import type { Heightmap, HeightmapMeta } from '../data/terrain';
import { cropHeightmap } from './terrain-crop';

function raster(w: number, h: number, cell: number): Heightmap {
  const heightsM = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) heightsM[r * w + c] = r * 1000 + c;
  const meta = {
    site_id: 't', lat: -90, lon: 0, kind: 'cap', source: 'x', level: 'L2', cell_m: cell, width: w, height: h,
    row0: 0, col0: 0, min_m: 0, max_m: 1e6, scale_m_per_unit: 1, site_height_m: 0, line_offset_px: (h - 1) / 2,
    sample_offset_px: (w - 1) / 2, site_row_px: (h - 1) / 2, site_col_px: (w - 1) / 2,
  } as HeightmapMeta;
  return { meta, heightsM };
}

describe('cropHeightmap', () => {
  it('cuts a square window around a pixel and keeps georeferencing', () => {
    const hm = raster(100, 80, 960);
    const out = cropHeightmap(hm, { col: 40, row: 30 }, 10);
    expect(out.meta.width).toBe(21);
    expect(out.meta.height).toBe(21);
    expect(out.meta.row0).toBe(20);
    expect(out.meta.col0).toBe(30);
    expect(out.meta.site_row_px).toBe(10);
    expect(out.meta.site_col_px).toBe(10);
    expect(out.heightsM[10 * 21 + 10]).toBe(30 * 1000 + 40);
    expect(out.meta.line_offset_px).toBe(hm.meta.line_offset_px - 20);
    expect(out.meta.sample_offset_px).toBe(hm.meta.sample_offset_px - 30);
  });
  it('clamps at the raster edges', () => {
    const hm = raster(50, 50, 960);
    const out = cropHeightmap(hm, { col: 2, row: 48 }, 10);
    expect(out.meta.col0).toBe(0);
    expect(out.meta.row0).toBe(29);
    expect(out.meta.width).toBe(21);
    expect(out.meta.site_col_px).toBe(2);
    expect(out.meta.site_row_px).toBe(19);
  });
});
