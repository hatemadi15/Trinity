import { afterEach, describe, expect, it, vi } from 'vitest';
import { LevelSampler, MemoryTileSource, newTally, type TileLevel } from './tiles';
import { FetchTileSource } from './tiles.fetch';

const level: TileLevel = {
  id: 'L1', map_scale_m: 80, lines: 1024, samples: 1024, line_offset_px: 511.5, sample_offset_px: 511.5, max_latitude_deg: -80,
  dn_scale_m: 0.5, tile_size: 512, tiles_x: 2, tiles_y: 2, nodata: -32768, path: 'L1/{y}_{x}.bin',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FetchTileSource', () => {
  it('answers a 404 as an absent tile, which the sampler then names, and any other HTTP error as a failure', async () => {
    const memory = new MemoryTileSource(level, new Int16Array(1024 * 1024).fill(10));
    vi.stubGlobal('fetch', async (url: string) => {
      const [ty, tx] = url.match(/(\d+)_(\d+)\.bin$/)!.slice(1).map(Number);
      if (ty === 0 && tx === 1) return new Response('not found', { status: 404 });
      if (ty === 1 && tx === 0) return new Response('busy', { status: 503 });
      return new Response((await memory.getTileBytes(level, ty, tx)) as BodyInit, { status: 200 });
    });
    const source = new FetchTileSource('/data');
    await expect(source.getTileBytes(level, 0, 1)).resolves.toBeNull();
    await expect(source.getTileBytes(level, 1, 0)).rejects.toThrow(/HTTP 503/);
    const s = new LevelSampler(level, source);
    const cols = new Float64Array([100, 700, 100]);
    const rows = new Float64Array([100, 100, 700]);
    await s.ensureForPixels(cols, rows);
    const tally = newTally();
    s.valueBilinearInto(cols, rows, new Float64Array(3), tally);
    expect(s.tallyKeys(tally)).toEqual({ absent: ['L1/0_1'], failed: ['L1/1_0'] });
    expect(s.absentTiles()).toEqual(['0_1']);
    expect(s.failedTiles()).toEqual(['1_0']);
  });
});
