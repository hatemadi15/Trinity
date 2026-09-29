import { describe, expect, it } from 'vitest';
import type { Heightmap, HeightmapMeta } from '../data/terrain';
import { buildTerrainGeometry, heightAtPixel } from './terrain-mesh';

/** 3x3 raster, 1000 m cells, flat at 0 m except the centre cell at +1000 m. */
function peak(): Heightmap {
  const meta: HeightmapMeta = {
    site_id: 'peak', lat: -90, lon: 0, kind: 'window', source: 'synthetic', level: 'L0', cell_m: 1000,
    width: 3, height: 3, row0: 0, col0: 0, min_m: 0, max_m: 1000, scale_m_per_unit: 1000 / 65535,
    site_height_m: 0, line_offset_px: 1, sample_offset_px: 1, site_row_px: 1, site_col_px: 1, fill_source: null,
  };
  return { meta, heightsM: new Float32Array([0, 0, 0, 0, 1000, 0, 0, 0, 0]) };
}

const vertex = (g: { positions: Float32Array }, i: number): [number, number, number] =>
  [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]];

describe('buildTerrainGeometry', () => {
  it('samples a 3x3 raster at segments = 2 exactly on the pixel centres, east +x, north -z, up +y in km', () => {
    const g = buildTerrainGeometry(peak(), { segments: 2 });
    expect(g.positions.length).toBe(9 * 3);
    expect(g.normals.length).toBe(9 * 3);
    expect(g.uv.length).toBe(9 * 2);
    expect(g.indices.length).toBe(24);
    expect(g.sizeKm).toBeCloseTo(2, 12);
    // Vertex order: row-major from the north row (j = 0) west to east (i = 0..segments).
    expect(vertex(g, 4)).toEqual([0, 1, 0]); // centre: +1000 m -> 1 km
    expect(vertex(g, 0)).toEqual([-1, 0, -1]); // north-west corner
    expect(vertex(g, 2)).toEqual([1, 0, -1]); // north-east corner
    expect(vertex(g, 6)).toEqual([-1, 0, 1]); // south-west corner
    expect(vertex(g, 8)).toEqual([1, 0, 1]); // south-east corner
    for (let i = 0; i < 3; i++) expect(vertex(g, i)[2]).toBeLessThan(0); // north row -> -z
    for (let i = 6; i < 9; i++) expect(vertex(g, i)[2]).toBeGreaterThan(0); // south row -> +z
  });

  it('scales heights by the exaggeration and measures them from relativeTo', () => {
    const g3 = buildTerrainGeometry(peak(), { segments: 2, exaggeration: 3 });
    expect(vertex(g3, 4)[1]).toBeCloseTo(3, 6);
    expect(vertex(g3, 0)[1]).toBe(0);
    const rel = buildTerrainGeometry(peak(), { segments: 2, relativeTo: 500 });
    expect(vertex(rel, 4)[1]).toBeCloseTo(0.5, 6);
    expect(vertex(rel, 0)[1]).toBeCloseTo(-0.5, 6);
    // relativeTo defaults to the sidecar's site_height_m.
    const hm = peak();
    hm.meta.site_height_m = 1000;
    expect(vertex(buildTerrainGeometry(hm, { segments: 2 }), 4)[1]).toBeCloseTo(0, 6);
  });

  it('resamples bilinearly between pixel centres', () => {
    const g = buildTerrainGeometry(peak(), { segments: 4 });
    expect(g.positions.length).toBe(25 * 3);
    expect(vertex(g, 2 * 5 + 2)).toEqual([0, 1, 0]); // centre unchanged
    expect(vertex(g, 2 * 5 + 1)[0]).toBeCloseTo(-0.5, 6);
    expect(vertex(g, 2 * 5 + 1)[1]).toBeCloseTo(0.5, 6); // halfway up the west flank
    expect(vertex(g, 1 * 5 + 1)[1]).toBeCloseTo(0.25, 6); // diagonal quarter point
    expect(heightAtPixel(peak(), 0.5, 1)).toBeCloseTo(500, 6);
    expect(heightAtPixel(peak(), -3, 1)).toBeCloseTo(0, 6); // clamped to the raster edge
  });

  it('builds unit normals that lean away from the slope, straight up on the peak', () => {
    const g = buildTerrainGeometry(peak(), { segments: 2 });
    for (let v = 0; v < 9; v++) {
      const [nx, ny, nz] = [g.normals[v * 3], g.normals[v * 3 + 1], g.normals[v * 3 + 2]];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
      expect(ny).toBeGreaterThan(0);
    }
    expect(g.normals[4 * 3]).toBeCloseTo(0, 9); // symmetric peak: central difference vanishes
    expect(g.normals[4 * 3 + 1]).toBeCloseTo(1, 9);
    expect(g.normals[3 * 3]).toBeLessThan(0); // west-middle vertex: ground rises to the east -> normal leans west
    expect(g.normals[1 * 3 + 2]).toBeLessThan(0); // north-middle vertex: ground rises to the south -> normal leans north
  });

  it('indexes two counter-clockwise triangles per quad (seen from +y) and UVs with north at v = 1', () => {
    const g = buildTerrainGeometry(peak(), { segments: 2 });
    expect(g.indices).toBeInstanceOf(Uint32Array);
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [vertex(g, g.indices[t]), vertex(g, g.indices[t + 1]), vertex(g, g.indices[t + 2])];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const ny = ab[2] * ac[0] - ab[0] * ac[2];
      expect(ny).toBeGreaterThan(0);
    }
    expect(Math.max(...g.indices)).toBe(8);
    expect(new Set(g.indices).size).toBe(9);
    expect([g.uv[0], g.uv[1]]).toEqual([0, 1]);
    expect([g.uv[8 * 2], g.uv[8 * 2 + 1]]).toEqual([1, 0]);
    expect([g.uv[4 * 2], g.uv[4 * 2 + 1]]).toEqual([0.5, 0.5]);
    for (const v of g.uv) expect(v >= 0 && v <= 1).toBe(true);
  });

  it('centerOn moves the origin to the given pixel', () => {
    const g = buildTerrainGeometry(peak(), { segments: 2, centerOn: { col: 1, row: 0 } });
    expect(vertex(g, 1)).toEqual([0, 0, 0]); // north-middle pixel is now the origin
    expect(vertex(g, 4)).toEqual([0, 1, 1]); // the peak sits 1 km south of it
    expect(vertex(g, 0)).toEqual([-1, 0, 0]);
    expect(vertex(g, 8)).toEqual([1, 0, 2]);
    expect(g.sizeKm).toBeCloseTo(2, 12);
    const frac = buildTerrainGeometry(peak(), { segments: 2, centerOn: { col: 0.5, row: 1.5 } });
    expect(vertex(frac, 4)[0]).toBeCloseTo(0.5, 6);
    expect(vertex(frac, 4)[2]).toBeCloseTo(-0.5, 6);
  });

  it('defaults to 256 segments', () => {
    const g = buildTerrainGeometry(peak());
    expect(g.positions.length).toBe(257 * 257 * 3);
    expect(g.indices.length).toBe(256 * 256 * 6);
  });
});

describe('buildTerrainGeometry hole', () => {
  /** 5x5 raster, 1000 m cells, flat, site at the centre pixel (2, 2). */
  function flat5(): Heightmap {
    const meta: HeightmapMeta = {
      site_id: 'flat', lat: -90, lon: 0, kind: 'cap', source: 'synthetic', level: 'L2', cell_m: 1000,
      width: 5, height: 5, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1,
      site_height_m: 0, line_offset_px: 2, sample_offset_px: 2, site_row_px: 2, site_col_px: 2, fill_source: null,
    };
    return { meta, heightsM: new Float32Array(25) };
  }

  it('skips every quad whose four corners lie inside the hole around centerOn', () => {
    const g = buildTerrainGeometry(flat5(), { segments: 4, centerOn: { col: 2, row: 2 }, hole: { halfCols: 1, halfRows: 1 } });
    // 16 quads; the 4 quads touching the centre pixel (cols 1..3, rows 1..3) are dropped.
    expect(g.indices.length).toBe((16 - 4) * 6);
    expect(g.positions.length).toBe(25 * 3);
    const centre = 2 * 5 + 2;
    expect(Array.from(g.indices)).not.toContain(centre);
  });

  it('keeps quads that only touch the hole boundary', () => {
    const g = buildTerrainGeometry(flat5(), { segments: 4, centerOn: { col: 2, row: 2 }, hole: { halfCols: 0.5, halfRows: 0.5 } });
    expect(g.indices.length).toBe(16 * 6);
  });

  it('a hole larger than the raster removes every quad', () => {
    const g = buildTerrainGeometry(flat5(), { segments: 4, centerOn: { col: 2, row: 2 }, hole: { halfCols: 10, halfRows: 10 } });
    expect(g.indices.length).toBe(0);
  });
});
