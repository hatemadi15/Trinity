import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { repoPath } from '../engine/__tests__/helpers';
import { loadValidation } from './validation';

describe('loadValidation', () => {
  let server: http.Server;
  let base = '';
  beforeAll(async () => {
    const root = repoPath('data');
    server = http.createServer((req, res) => {
      // Under /without-pictures the pictures' table is missing, as in a data folder made before it.
      const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const bare = url.replace(/^\/without-pictures/, '');
      const file = path.join(root, bare);
      if (!fs.existsSync(file) || (bare !== url && bare.endsWith('/images.json'))) {
        res.statusCode = 404;
        res.end('missing');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(fs.readFileSync(file));
    });
    await new Promise<void>((r) => server.listen(0, r));
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  });
  afterAll(() => server.close());

  it('loads the four validation documents from the data base', async () => {
    const v = await loadValidation(base);
    expect(v.horizons.n_rows).toBeGreaterThan(0);
    expect(v.horizons.sites[0].rows[0]).toHaveProperty('az_ours');
    expect(v.mazarico.rows.some((r) => r.covered)).toBe(true);
    expect(v.power.cases.length).toBeGreaterThan(0);
    expect(v.backcasts.rows.map((r) => r.site_id)).toContain('blue_ghost_m1');
  });

  it('gives every document its evidence: what it shows, its coverage and its limits, and a rule unless it is context', async () => {
    const v = await loadValidation(base);
    for (const doc of [v.horizons, v.mazarico, v.power, v.backcasts]) {
      expect(doc.evidence.establishes.length).toBeGreaterThan(40);
      expect(doc.evidence.limitations.length).toBeGreaterThanOrEqual(2);
      expect(doc.evidence.command).toMatch(/lunar_pipeline\.cli validate/);
    }
    for (const doc of [v.horizons, v.mazarico, v.power]) expect(doc.evidence.criteria?.rule).toBeTruthy();
    expect(v.backcasts.evidence.kind).toBe('context');
    expect(v.backcasts.evidence.criteria).toBeNull();
  });

  it('loads the check of shadows against camera pictures beside them', async () => {
    const v = await loadValidation(base);
    expect(v.images).toBeDefined();
    expect(v.images!.evidence.kind).toBe('check');
    expect(v.images!.evidence.command).toMatch(/lunar_pipeline\.cli images/);
    expect(v.images!.evidence.criteria.rule).toBeTruthy();
    expect(v.images!.rows.length).toBe(v.images!.evidence.coverage.pictures);
    expect(v.images!.rows.every((r) => r.agree > 0 && r.agree <= 1)).toBe(true);
  });

  it('leaves the pictures out, rather than fail, where their table is missing', async () => {
    const v = await loadValidation(`${base}/without-pictures`);
    expect(v.images).toBeUndefined();
    expect(v.horizons.n_rows).toBeGreaterThan(0);
  });

  it('fails with a DataError naming the missing file', async () => {
    await expect(loadValidation(`${base}/nowhere`)).rejects.toThrow(/validation\/horizons\.json/);
  });
});
