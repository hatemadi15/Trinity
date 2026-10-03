import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hasFile, repoPath } from '../engine/__tests__/helpers';
import { DataError } from './loaders';
import { loadSkyAssets } from './sky';

const publicData = repoPath('web', 'public', 'data');
const present = hasFile('web', 'public', 'data', 'sky', 'stars.json');
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

describe.skipIf(!present)('the sky files against web/public/data', () => {
  it('loads the stars and the Moon’s orientation, and names the Earth maps', async () => {
    const sky = await loadSkyAssets(base);
    expect(sky.stars.count).toBeGreaterThan(8000);
    expect(sky.stars.vmag[0]).toBeCloseTo(-1.46, 2);
    expect(sky.moon.count * 4).toBe(sky.moon.quats.length);
    expect(sky.moon.stepMs).toBe(6 * 3600e3);
    expect(sky.earthDayUrl).toBe(`${base}/sky/earth_day_2048.jpg`);
    expect(sky.earthCloudsUrl).toBe(`${base}/sky/earth_clouds_2048.jpg`);
  });

  it('fails with the address of a missing file', async () => {
    await expect(loadSkyAssets(`${base}/nowhere`)).rejects.toBeInstanceOf(DataError);
  });
});
