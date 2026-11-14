import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';
import { decodeTile, LevelSampler, levelById, MemoryTileSource, newTally, type TileLevel, type TileManifest } from './tiles';
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

describe('LevelSampler failure handling and residency', () => {
  it('a throwing tile source samples as NaN, records the failure, and retries on the next ensure', async () => {
    const level = syntheticLevel(1100, 20);
    const grid = new Int16Array(1100 * 1100).fill(100);
    const good = new MemoryTileSource(level, grid);
    let fail = true;
    const flaky = {
      async getTileBytes(l: TileLevel, ty: number, tx: number) {
        if (fail && ty === 1 && tx === 1) throw new Error('network down');
        return good.getTileBytes(l, ty, tx);
      },
    };
    const s = new LevelSampler(level, flaky);
    const cols = new Float64Array([700]);
    const rows = new Float64Array([700]);
    await s.ensureForPixels(cols, rows);
    expect(Number.isNaN(s.valueBilinear(cols, rows)[0])).toBe(true);
    expect(s.failedTiles()).toEqual(['1_1']);
    fail = false;
    await s.ensureForPixels(cols, rows);
    expect(s.valueBilinear(cols, rows)[0]).toBe(50);
    expect(s.failedTiles()).toEqual([]);
  });
  it('counts resident tiles and releases them with clear()', async () => {
    const level = syntheticLevel(1100, 20);
    const s = new LevelSampler(level, new MemoryTileSource(level, new Int16Array(1100 * 1100)));
    await s.ensureForPixels(new Float64Array([10, 1000]), new Float64Array([10, 1000]));
    expect(s.tileCount()).toBe(2);
    s.clear();
    expect(s.tileCount()).toBe(0);
    expect(() => s.dn(10, 10)).toThrow(/not loaded/);
  });
});

describe('the tiles a sampling pass could not use', () => {
  // A 4 x 4 grid of tiles: 0_1 is absent (the source has no such tile) and 1_0 fails to load.
  function sampler() {
    const level = syntheticLevel(1600, 20);
    const good = new MemoryTileSource(level, new Int16Array(1600 * 1600).fill(100), new Set(['0_1']));
    const flaky = {
      async getTileBytes(l: TileLevel, ty: number, tx: number) {
        if (ty === 1 && tx === 0) throw new Error('tile T 1_0: HTTP 500');
        return good.getTileBytes(l, ty, tx);
      },
    };
    return new LevelSampler(level, flaky);
  }

  it('tallies the absent and the failed tiles a pass sampled, and only those', async () => {
    const s = sampler();
    const cols = new Float64Array([100, 700, 100, 700]);
    const rows = new Float64Array([100, 100, 700, 700]);
    await s.ensureForPixels(cols, rows);
    const tally = newTally();
    const out = new Float64Array(4);
    s.valueBilinearInto(cols, rows, out, tally);
    expect(out[0]).toBe(50);
    expect(Number.isNaN(out[1]) && Number.isNaN(out[2])).toBe(true);
    expect(s.tallyKeys(tally)).toEqual({ absent: ['T/0_1'], failed: ['T/1_0'] });
    expect(s.absentTiles()).toEqual(['0_1']);
    // A pass that samples only tiles with data tallies nothing, whatever the sampler met before.
    const clean = newTally();
    s.valueBilinearInto(new Float64Array([100]), new Float64Array([100]), out, clean);
    expect(s.tallyKeys(clean)).toEqual({ absent: [], failed: [] });
  });

  it('tallies an absent tile met by a sample on a tile edge, whose neighbours lie in two tiles', async () => {
    const s = sampler();
    // Column 511.5 needs columns 511 (tile 0_0) and 512 (tile 0_1, absent).
    const cols = new Float64Array([511.5]);
    const rows = new Float64Array([100]);
    await s.ensureForPixels(cols, rows);
    const tally = newTally();
    const out = new Float64Array(1);
    s.valueBilinearInto(cols, rows, out, tally);
    expect(Number.isNaN(out[0])).toBe(true);
    expect(s.tallyKeys(tally)).toEqual({ absent: ['T/0_1'], failed: [] });
  });
});
