import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EngineClient } from './engine-client';
import { hasFile, readJson, repoPath } from './engine/__tests__/helpers';

const publicData = repoPath('web', 'public', 'data');
const present = hasFile('web', 'public', 'data', 'tiles', 'manifest.json');
let server: http.Server;
let base = '';
/** Tiles the server answers with a 404 although it has them, as a host that lost a file would. */
const dropped = new Set<string>();

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = path.join(publicData, url);
    if (dropped.has(url) || !file.startsWith(publicData) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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

describe.skipIf(!present)('EngineClient inline fallback (no Worker in Node)', () => {
  it('computes a mask over HTTP tiles that matches the committed one and reports coverage', async () => {
    expect(typeof Worker).toBe('undefined');
    const py = readJson<{ lat: number; lon: number; elevation_deg: number[] }>('data', 'masks', 'south_pole.json');
    const client = new EngineClient(base);
    const res = await client.computeMask(py.lat, py.lon);
    let worst = 0;
    for (let k = 0; k < 720; k++) worst = Math.max(worst, Math.abs(res.mask[k] - py.elevation_deg[k]));
    expect(worst).toBeLessThan(0.01);
    expect(res.failedTiles).toEqual([]);
    expect(res.coverage.samples).toBeGreaterThan(0);
    client.dispose();
  }, 120_000);
  it('names a tile the server answers with a 404 as absent, and counts the ray steps it leaves without terrain', async () => {
    // The 240 m tile under the Shackleton rim summit: no coarser grid can fill it.
    dropped.add('/tiles/L2/7_7.bin');
    try {
      // A base of its own (the same server), so the engine starts without the tiles the first test loaded.
      const client = new EngineClient(`${base}/.`);
      const res = await client.computeMask(-89.78131, -156.25683, { mastM: 2 });
      expect(res.absentTiles).toEqual(['L2/7_7']);
      expect(res.failedTiles).toEqual([]);
      expect(res.coverage.missing).toBeGreaterThan(0);
      expect(res.coverage.openAzimuths).toBeGreaterThan(0);
      client.dispose();
    } finally {
      dropped.clear();
    }
  }, 120_000);
  it('rejects a site without DEM coverage with the engine message', async () => {
    const client = new EngineClient(base);
    await expect(client.computeMask(18.56, 61.81)).rejects.toThrow(/no DEM coverage/);
  });
});
