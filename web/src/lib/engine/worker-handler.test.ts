import { describe, expect, it } from 'vitest';
import { handleEngineRequest } from './worker-handler';
import { FsTileSource, readManifest } from './tiles.node';
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
