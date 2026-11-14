import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeSiteMask, type Samplers } from './horizon';
import { LevelSampler, levelById, type TileLevel } from './tiles';
import { FsTileSource, readManifest } from './tiles.node';
import { hasFile, readJson, repoPath } from './__tests__/helpers';

// The tiles the browser reads, copied into web/public/data (git-ignored): these tests skip without them.
const present = hasFile('web', 'public', 'data', 'tiles', 'manifest.json');
const dir = repoPath('web', 'public', 'data', 'tiles');

/** Samplers over the real tiles, with the tiles in `absent` answered as missing, as a 404 would be. */
function samplersWithout(absent: string[] = []): Samplers {
  const manifest = readManifest(dir);
  const files = new FsTileSource(dir);
  const source = { getTileBytes: (l: TileLevel, ty: number, tx: number) => (absent.includes(`${l.id}/${ty}_${tx}`) ? Promise.resolve(null) : files.getTileBytes(l, ty, tx)) };
  return { L0: new LevelSampler(levelById(manifest, 'L0'), source), L1: new LevelSampler(levelById(manifest, 'L1'), source), L2: new LevelSampler(levelById(manifest, 'L2'), source) };
}

/** The key of the tile under a site on one grid. */
function tileUnder(samplers: Samplers, level: 'L0' | 'L1' | 'L2', lat: number, lon: number): string {
  const { col, row } = samplers[level].pixelFromLatLon(lat, lon);
  return `${level}/${Math.floor(row / 512)}_${Math.floor(col / 512)}`;
}

describe.skipIf(!present)('coverage of the real skylines', () => {
  it('finds terrain at every step of every featured site; only IM-1 takes part of its skyline from the coarser grid', async () => {
    const samplers = samplersWithout();
    const files = fs.readdirSync(repoPath('data', 'masks')).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(18);
    for (const f of files) {
      const doc = readJson<{ site_id: string; lat: number; lon: number; fallback_bands: unknown[] }>('data', 'masks', f);
      const r = await computeSiteMask(doc.lat, doc.lon, samplers, { mastM: 2 });
      expect(r.coverage.missing, doc.site_id).toBe(0);
      expect(r.coverage.openAzimuths, doc.site_id).toBe(0);
      expect(r.coverage.absentTiles, doc.site_id).toEqual([]);
      expect(r.fallbackBands.length, doc.site_id).toBe(doc.fallback_bands.length);
    }
  }, 300_000);

  it('fills an absent 80 m tile under a site from the 240 m grid: nothing is missing, but the coarser grid is named', async () => {
    const site = { lat: -89.78131, lon: -156.25683 }; // the Shackleton rim summit
    const key = tileUnder(samplersWithout(), 'L1', site.lat, site.lon);
    const r = await computeSiteMask(site.lat, site.lon, samplersWithout([key]), { mastM: 2 });
    expect(r.coverage.absentTiles).toEqual([key]);
    expect(r.coverage.missing).toBe(0);
    expect(r.fallbackBands).toEqual([{ grid: 'L2', rMinM: 6_000, rMaxM: 100_000, stepM: 120 }]);
  }, 120_000);

  it('leaves steps without terrain where the coarsest grid lacks a tile, and opens the directions a hill there could rise above', async () => {
    const site = { lat: -89.78131, lon: -156.25683 };
    const key = tileUnder(samplersWithout(), 'L2', site.lat, site.lon);
    const r = await computeSiteMask(site.lat, site.lon, samplersWithout([key]), { mastM: 2 });
    expect(r.coverage.absentTiles).toEqual([key]);
    expect(r.coverage.missing).toBeGreaterThan(0);
    // Only the 240 m grid's own distances, 100 to 220 km out, have no other grid to fall back on.
    expect(r.coverage.ranges.map((x) => x.missing > 0)).toEqual([false, false, true]);
    expect(r.coverage.nearestMissingM).toBeGreaterThanOrEqual(100_000);
    expect(r.coverage.openAzimuths).toBeGreaterThan(0);
  }, 120_000);
});
