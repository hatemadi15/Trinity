import { describe, expect, it } from 'vitest';
import type { Level } from './engine/shadow';
import { ShadowClient } from './shadow-client';

const flat = (w: number, h: number): Level => ({ heights: new Float32Array(w * h), width: w, height: h, pxM: 20, siteCol: (w - 1) / 2, siteRow: (h - 1) / 2 });

describe('ShadowClient (no worker: it runs the handler itself)', () => {
  it('returns the picture of the latest request and nothing for one it overtook', async () => {
    const client = new ShadowClient();
    await client.setLevels('a', [flat(12, 10)]);
    const first = client.picture('a', 90, 2, false);
    const second = client.picture('a', 100, 3, false);
    expect(await first).toBeNull();
    const latest = await second;
    expect(latest).toMatchObject({ type: 'picture', key: 'a', width: 12, height: 10, siteLit: true });
    client.dispose();
  });

  it('keeps the requests for two sets of levels apart', async () => {
    const client = new ShadowClient();
    await client.setLevels('a', [flat(12, 10)]);
    await client.setLevels('b', [flat(8, 8)]);
    const [a, b] = await Promise.all([client.picture('a', 90, 2, true), client.picture('b', 90, 2, false)]);
    expect(a).toMatchObject({ key: 'a', width: 6, height: 5 });
    expect(b).toMatchObject({ key: 'b', width: 8, height: 8 });
    client.dispose();
  });
});
