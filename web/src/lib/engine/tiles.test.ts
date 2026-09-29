import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { decodeTile, LevelSampler, levelById, MemoryTileSource, type TileLevel, type TileManifest } from './tiles';
import { FsTileSource, readManifest } from './tiles.node';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

function syntheticLevel(size: number, scale: number): TileLevel {
  return {
    id: 'T', map_scale_m: scale, lines: size, samples: size, line_offset_px: (size - 1) / 2,
    sample_offset_px: (size - 1) / 2, max_latitude_deg: -89, dn_scale_m: 0.5, tile_size: 512,
    tiles_x: Math.ceil(size / 512), tiles_y: Math.ceil(size / 512), nodata: -32768, path: 'T/{y}_{x}.bin',
  };
}

describe('decodeTile', () => {
  it('round-trips a zlib-compressed int16 tile', async () => {
    const src = new Int16Array(512 * 512);
    for (let i = 0; i < src.length; i++) src[i] = (i % 5000) - 2500;
    const bytes = new Uint8Array(zlib.deflateSync(Buffer.from(src.buffer)));
    const out = await decodeTile(bytes, 512);
    expect(out.length).toBe(512 * 512);
    expect(out[0]).toBe(-2500);
    expect(out[4999]).toBe(2499);
    expect(out[512 * 512 - 1]).toBe(src[512 * 512 - 1]);
  });
});

describe('LevelSampler on a synthetic grid', () => {
  it('interpolates bilinearly, NaN outside, NaN for nodata', async () => {
    const level = syntheticLevel(4, 20);
    const grid = new Int16Array([0, 2, 4, 6, 10, 12, 14, 16, 20, 22, 24, 26, 30, 32, 34, 36]);
    const s = new LevelSampler(level, new MemoryTileSource(level, grid));
    const cols = new Float64Array([0.5, 1.0, -1.0, 3.5]);
    const rows = new Float64Array([0.5, 2.0, 0.0, 0.0]);
    await s.ensureForPixels(cols, rows);
    const v = s.valueBilinear(cols, rows);
    expect(v[0]).toBeCloseTo(0.5 * (0 + 2 + 10 + 12) / 4, 12);
    expect(v[1]).toBeCloseTo(0.5 * 22, 12);
    expect(Number.isNaN(v[2]) && Number.isNaN(v[3])).toBe(true);
    grid[5] = -32768;
    const s2 = new LevelSampler(level, new MemoryTileSource(level, grid));
    await s2.ensureForPixels(cols, rows);
    expect(Number.isNaN(s2.valueBilinear(cols, rows)[0])).toBe(true);
  });
  it('maps lat/lon to pixels like the Python reader', () => {
    const level = syntheticLevel(1024, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(1024 * 1024)));
    const p = s.pixelFromLatLon(-90, 0);
    expect(p.col).toBeCloseTo(511.5, 9);
    expect(p.row).toBeCloseTo(511.5, 9);
    const back = s.latLonFromPixel(600, 400);
    const again = s.pixelFromLatLon(back.lat, back.lon);
    expect(again.col).toBeCloseTo(600, 6);
    expect(again.row).toBeCloseTo(400, 6);
  });
  it('samples a missing tile as NaN instead of throwing', async () => {
    const level = syntheticLevel(1100, 20);
    const src = new MemoryTileSource(level, new Int16Array(1100 * 1100).fill(100), new Set(['1_1']));
    const s = new LevelSampler(level, src);
    const cols = new Float64Array([100, 700]);
    const rows = new Float64Array([100, 700]);
    await s.ensureForPixels(cols, rows);
    const v = s.valueBilinear(cols, rows);
    expect(v[0]).toBe(50);
    expect(Number.isNaN(v[1])).toBe(true);
  });
});

const tilesPresent = hasFile('data_out', 'tiles', 'manifest.json');

describe.skipIf(!tilesPresent)('LevelSampler on real LOLA tiles', () => {
  it('reads the south pole height that Python recorded', async () => {
    const manifest: TileManifest = readManifest(repoPath('data_out', 'tiles'));
    const l0 = levelById(manifest, 'L0');
    const s = new LevelSampler(l0, new FsTileSource(repoPath('data_out', 'tiles')));
    const h = await s.valueAt(-90, 0);
    const mask = readJson<{ site_height_m: number }>('data', 'masks', 'south_pole.json');
    expect(h).toBeCloseTo(mask.site_height_m, 1);
  });
});
