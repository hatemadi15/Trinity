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
  it('rejects a site without DEM coverage with the engine message', async () => {
    const client = new EngineClient(base);
    await expect(client.computeMask(18.56, 61.81)).rejects.toThrow(/no DEM coverage/);
  });
});
