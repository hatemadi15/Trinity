import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

describe('data loaders ask for their two files at once', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A fetch the test answers by hand, file by file, and that records what was asked. */
  function handFetch() {
    const asked: string[] = [];
    const answers = new Map<string, (res: Response) => void>();
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url);
      return new Promise<Response>((resolve) => answers.set(url, resolve));
    });
    return { asked, answer: (url: string, res: Response) => answers.get(url)!(res) };
  }
  const json = (body: unknown) => new Response(JSON.stringify(body));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('asks for both site lists before either answers, and leaves out a derived list that is not there', async () => {
    const f = handFetch();
    const sites = loadSites('/data');
    await settle();
    expect(f.asked).toEqual(['/data/sites.json', '/data/sites_derived.json']);
    f.answer('/data/sites_derived.json', new Response('not found', { status: 404 }));
    f.answer('/data/sites.json', json({ sites: [{ id: 'south_pole' }] }));
    await expect(sites).resolves.toEqual([{ id: 'south_pole' }]);
  });

  it('still reports a derived list that fails for another reason, and a missing featured list', async () => {
    const f = handFetch();
    const broken = loadSites('/data');
    await settle();
    f.answer('/data/sites.json', json({ sites: [] }));
    f.answer('/data/sites_derived.json', new Response('', { status: 500 }));
    await expect(broken).rejects.toMatchObject({ name: 'DataError', status: 500, url: '/data/sites_derived.json' });
    const missing = loadSites('/other');
    await settle();
    f.answer('/other/sites_derived.json', json({ sites: [] }));
    f.answer('/other/sites.json', new Response('', { status: 404 }));
    await expect(missing).rejects.toMatchObject({ name: 'DataError', status: 404, url: '/other/sites.json' });
  });

  it('asks for the ephemeris header and its table before either answers', async () => {
    const f = handFetch();
    const header = '/data/ephemeris/moon_me_2024_2036_1h.json';
    const table = '/data/ephemeris/moon_me_2024_2036_1h.f32';
    const eph = loadEphemerisFromUrl('/data');
    await settle();
    expect(f.asked).toEqual([header, table]);
    f.answer(table, new Response(new Float32Array(12)));
    f.answer(header, json({ t0_et: 0, step_s: 3600, n: 2, shape: [2, 2, 3], bodies: ['SUN', 'EARTH'], frame: 'MOON_ME' }));
    await expect(eph).resolves.toMatchObject({ n: 2, stepS: 3600 });
    // A table that does not match its header is still refused.
    const short = loadEphemerisFromUrl('/data');
    await settle();
    f.answer(header, json({ t0_et: 0, step_s: 3600, n: 3, shape: [3, 2, 3], bodies: ['SUN', 'EARTH'], frame: 'MOON_ME' }));
    f.answer(table, new Response(new Float32Array(12)));
    await expect(short).rejects.toThrow(/byte length/);
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
