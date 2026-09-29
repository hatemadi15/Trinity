import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEphemerisFromUrl, loadManifest, loadMask, loadSites } from './loaders';
import { FetchTileSource } from '../engine/tiles.fetch';
import { LevelSampler, levelById } from '../engine/tiles';
import { hasFile, repoPath } from '../engine/__tests__/helpers';

const publicData = repoPath('web', 'public', 'data');
const present = hasFile('web', 'public', 'data', 'sites.json');
let server: http.Server;
let base = '';

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(publicData, decodeURIComponent((req.url ?? '/').split('?')[0]));
    if (!file.startsWith(publicData) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200).end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}`;
});
afterAll(() => server.close());

describe.skipIf(!present)('data loaders against web/public/data', () => {
  it('loads featured and derived sites', async () => {
    const sites = await loadSites(base);
    expect(sites.map((s) => s.id)).toContain('shackleton_center_rim_high');
    expect(sites.find((s) => s.id === 'blue_ghost_m1')?.polar).toBe(false);
  });
  it('loads the ephemeris and a mask', async () => {
    const eph = await loadEphemerisFromUrl(base);
    expect(eph.n).toBe(113_976);
    const mask = await loadMask(base, 'south_pole');
    expect(mask.elevation_deg.length).toBe(720);
    expect(mask.mast_m).toBe(2);
  });
});

describe('data loaders without data files', () => {
  it('loadSites reports a missing file with its URL', async () => {
    await expect(loadSites(`${base}/nope`)).rejects.toMatchObject({ name: 'DataError', status: 404 });
    await expect(loadSites(`${base}/nope`)).rejects.toThrow(/nope\/sites\.json/);
  });
});

describe.skipIf(!hasFile('web', 'public', 'data', 'tiles', 'manifest.json'))('FetchTileSource', () => {
  it('samples the south pole through HTTP tiles and returns null for a missing tile', async () => {
    const manifest = await loadManifest(base);
    const src = new FetchTileSource(base);
    const l0 = levelById(manifest, 'L0');
    const sampler = new LevelSampler(l0, src);
    expect(await sampler.valueAt(-90, 0)).toBeCloseTo(1290.12, 1);
    expect(await src.getTileBytes(l0, 999, 999)).toBeNull();
  });
});
