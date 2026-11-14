import { describe, expect, it } from 'vitest';
import { handleEngineRequest } from './worker-handler';
import { FsTileSource, readManifest } from './tiles.node';
import { MemoryTileSource } from './tiles';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

const tiles = repoPath('data_out', 'tiles');
const deps = { manifest: async () => readManifest(tiles), source: () => new FsTileSource(tiles) };

describe.skipIf(!hasFile('data_out', 'tiles', 'manifest.json'))('handleEngineRequest', () => {
  it('computes a mask for a featured site that matches the committed one', async () => {
    const py = readJson<{ lat: number; lon: number; elevation_deg: number[] }>('data', 'masks', 'south_pole.json');
    const res = await handleEngineRequest({ id: 1, type: 'mask', lat: py.lat, lon: py.lon, base: 'unused' }, deps);
    expect(res.type).toBe('mask');
    if (res.type !== 'mask') return;
    expect(res.id).toBe(1);
    let worst = 0;
    for (let k = 0; k < 720; k++) worst = Math.max(worst, Math.abs(res.mask[k] - py.elevation_deg[k]));
    expect(worst).toBeLessThan(0.01);
    expect(res.coverage.samples).toBeGreaterThan(0);
    expect(res.failedTiles).toEqual([]);
  }, 120_000);
  it('handler returns an error for a site without DEM coverage', async () => {
    const res = await handleEngineRequest({ id: 2, type: 'mask', lat: 18.56, lon: 61.81, base: 'unused' }, deps);
    expect(res).toMatchObject({ id: 2, type: 'error' });
    if (res.type === 'error') expect(res.message).toMatch(/no DEM coverage/);
  });
});

describe('what the worker reports with a skyline', () => {
  it('passes on the coverage, the absent and failed tiles, the grid of the site height and the terrain it read', async () => {
    const level = (id: string, scale: number) => ({
      id, map_scale_m: scale, lines: 1024, samples: 1024, line_offset_px: 511.5, sample_offset_px: 511.5, max_latitude_deg: -60,
      dn_scale_m: 0.5, tile_size: 512, tiles_x: 2, tiles_y: 2, nodata: -32768, path: `${id}/{y}_{x}.bin`,
    });
    const manifest = { version: 1, generated_utc: '2026-11-12T09:07:07+00:00', reference_radius_m: 1737400, levels: [level('L0', 20), level('L1', 80), level('L2', 240)] };
    const sources = Object.fromEntries(manifest.levels.map((l) => [l.id, new MemoryTileSource(l, new Int16Array(1024 * 1024), new Set(['1_1']))]));
    const res = await handleEngineRequest(
      { id: 3, type: 'mask', lat: -89.99, lon: 0, base: 'synthetic-absent', mastM: 5 },
      { manifest: async () => manifest, source: () => ({ getTileBytes: (l, ty, tx) => sources[l.id].getTileBytes(l, ty, tx) }) },
    );
    expect(res.type).toBe('mask');
    if (res.type !== 'mask') return;
    expect(res.absentTiles).toEqual(expect.arrayContaining(['L0/1_1', 'L2/1_1']));
    expect(res.coverage.missing).toBeGreaterThan(0);
    expect(res.coverage.absentTiles).toEqual(res.absentTiles);
    expect(res.siteGrid).toBe('L0');
    expect(res.terrain).toEqual({ version: 1, generatedUtc: '2026-11-12T09:07:07+00:00' });
  });
});
