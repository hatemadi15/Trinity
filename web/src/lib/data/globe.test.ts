import zlib from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGlobeAssets } from './globe';

const manifest = { version: 1, color: { '1k': 'moon_color_1k.jpg', '4k': 'moon_color_4k.jpg' }, normal: { '1k': 'moon_normal_1k.jpg', '4k': 'moon_normal_4k.jpg' }, heights: { file: 'moon_heights_1440.u16', meta: 'moon_heights_1440.json' }, albedo_scale: 0.8, radius_m: 1737400, credit: 'NASA SVS' };
const meta = { width: 4, height: 2, min_m: -100, max_m: 100, scale_m_per_unit: 1 };
const dn = new Uint16Array([0, 50, 100, 150, 200, 0, 0, 0]);

describe('loadGlobeAssets', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the manifest, gives the small and large maps’ addresses and decodes the heights to metres', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest));
        if (url.endsWith('.json')) return new Response(JSON.stringify(meta));
        return new Response(zlib.deflateSync(Buffer.from(dn.buffer)));
      }),
    );
    const g = await loadGlobeAssets('/data');
    expect(g.color).toEqual({ low: '/data/globe/moon_color_1k.jpg', high: '/data/globe/moon_color_4k.jpg' });
    expect(g.normal.high).toBe('/data/globe/moon_normal_4k.jpg');
    expect(g.albedoScale).toBe(0.8);
    expect(g.credit).toBe('NASA SVS');
    expect([g.heights.width, g.heights.height]).toEqual([4, 2]);
    expect(Array.from(g.heights.metres.slice(0, 3))).toEqual([-100, -50, 0]);
  });
});
