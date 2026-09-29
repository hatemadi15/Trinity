import type { Heightmap } from '../data/terrain';

/**
 * Square sub-window of a heightmap around a pixel (half-size `halfPx` on each side, clamped to the
 * raster). Georeferencing stays valid: row0/col0 and the projection offsets shift with the crop.
 */
export function cropHeightmap(hm: Heightmap, center: { col: number; row: number }, halfPx: number): Heightmap {
  const { width, height } = hm.meta;
  const size = Math.min(2 * halfPx + 1, width, height);
  const col0 = Math.max(0, Math.min(width - size, Math.round(center.col) - halfPx));
  const row0 = Math.max(0, Math.min(height - size, Math.round(center.row) - halfPx));
  const heightsM = new Float32Array(size * size);
  for (let r = 0; r < size; r++) {
    heightsM.set(hm.heightsM.subarray((row0 + r) * width + col0, (row0 + r) * width + col0 + size), r * size);
  }
  return {
    meta: {
      ...hm.meta,
      width: size,
      height: size,
      row0: hm.meta.row0 + row0,
      col0: hm.meta.col0 + col0,
      line_offset_px: hm.meta.line_offset_px - row0,
      sample_offset_px: hm.meta.sample_offset_px - col0,
      site_row_px: center.row - row0,
      site_col_px: center.col - col0,
    },
    heightsM,
  };
}
