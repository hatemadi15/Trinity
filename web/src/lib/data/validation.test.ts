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
      const file = path.join(root, decodeURIComponent((req.url ?? '/').split('?')[0]));
      if (!fs.existsSync(file)) {
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

  it('fails with a DataError naming the missing file', async () => {
    await expect(loadValidation(`${base}/nowhere`)).rejects.toThrow(/validation\/horizons\.json/);
  });
});
