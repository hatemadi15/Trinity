import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

const IMMUTABLE = 'public, max-age=31536000, immutable';

describe('hosting configuration', () => {
  it('vercel.json parses and serves /data with an immutable cache header', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8');
    const cfg = JSON.parse(raw) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const data = cfg.headers.find((h) => h.source.startsWith('/data/'));
    expect(data).toBeTruthy();
    expect(data!.headers).toContainEqual({ key: 'Cache-Control', value: IMMUTABLE });
  });

  it('next.config makes the browser check /data again when the app serves it itself, since the pipeline rewrites files under the same names', async () => {
    const headers = await nextConfig.headers!();
    const data = headers.find((h) => h.source.startsWith('/data/'));
    expect(data).toBeTruthy();
    expect(data!.headers).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' });
  });

  it('.vercelignore keeps the local data mirror out of the deployment', () => {
    const ignore = fs.readFileSync(path.resolve(process.cwd(), '.vercelignore'), 'utf8');
    expect(ignore.split(/\r?\n/)).toContain('public/data');
  });
});
