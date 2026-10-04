import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CAP_SHADOW_HALF_PX,
  CAP_SITE_HALF_PX,
  contextFileFor,
  decodeHeightmap,
  latLonToPixel,
  shadowLevels,
  loadHeightmap,
  loadTerrainManifest,
  pixelToLatLon,
  windowFileFor,
  type Heightmap,
  type HeightmapMeta,
  type TerrainManifest,
} from './terrain';
import { hasFile, readBytes, readJson, repoPath } from '../engine/__tests__/helpers';

const terrainDir = ['web', 'public', 'data', 'terrain'];
const present = hasFile(...terrainDir, 'manifest.json');

describe('decodeHeightmap', () => {
  it('round-trips a zlib-compressed little-endian uint16 raster into metres', async () => {
    const dn = new Uint16Array([0, 1, 2, 65535, 100, 200]);
    const bytes = new Uint8Array(zlib.deflateSync(Buffer.from(dn.buffer)));
    const heights = await decodeHeightmap(bytes, { width: 3, height: 2, min_m: -100, scale_m_per_unit: 0.5 });
    expect(heights).toBeInstanceOf(Float32Array);
    expect(heights.length).toBe(6);
    expect(heights[0]).toBeCloseTo(-100, 5);
    expect(heights[1]).toBeCloseTo(-99.5, 5);
    expect(heights[3]).toBeCloseTo(-100 + 65535 * 0.5, 2);
    expect(heights[5]).toBeCloseTo(0, 5);
  });

  it('rejects a payload whose size does not match the sidecar', async () => {
    const bytes = new Uint8Array(zlib.deflateSync(Buffer.from(new Uint16Array(4).buffer)));
    await expect(decodeHeightmap(bytes, { width: 3, height: 3, min_m: 0, scale_m_per_unit: 1 })).rejects.toThrow(/expected 18/);
  });
});

describe('windowFileFor', () => {
  const manifest = {
    version: 1,
    windows: [{ site_id: 'a', lat: -89, lon: 0, file: 'a.u16', meta: 'a.json', level: 'L0', cell_m: 20, width: 4, height: 4, bytes: 1 }],
    cap: { file: 'south_cap.u16', meta: 'south_cap.json' },
    globe_texture: 'lroc_color_2k.jpg',
  } satisfies TerrainManifest;
  it('returns the raster and sidecar names of a listed site, null otherwise', () => {
    expect(windowFileFor(manifest, 'a')).toEqual({ file: 'a.u16', meta: 'a.json' });
    expect(windowFileFor(manifest, 'custom_1')).toBeNull();
  });
});

describe('contextFileFor', () => {
  const manifest = {
    version: 2,
    windows: [
      { site_id: 'deep', lat: -89.5, lon: 0, file: 'deep.u16', meta: 'deep.json', level: 'L0', cell_m: 20, width: 4, height: 4, bytes: 1, context: { file: 'deep.context.u16', meta: 'deep.context.json', cell_m: 80, width: 4, height: 4 } },
      { site_id: 'far', lat: -85, lon: 0, file: 'far.u16', meta: 'far.json', level: 'L1', cell_m: 80, width: 4, height: 4, bytes: 1 },
    ],
    cap: { file: 'south_cap.u16', meta: 'south_cap.json' },
    globe_texture: 'lroc_color_2k.jpg',
  } satisfies TerrainManifest;
  it('names the 80 m context of a 20 m window, and nothing for an 80 m window or an unlisted site', () => {
    expect(contextFileFor(manifest, 'deep')).toEqual({ file: 'deep.context.u16', meta: 'deep.context.json' });
    expect(contextFileFor(manifest, 'far')).toBeNull();
    expect(contextFileFor(manifest, 'nowhere')).toBeNull();
  });
});

describe('shadowLevels', () => {
  const grid = (kind: HeightmapMeta['kind'], size: number, cell: number, siteCol: number, siteRow: number, value = 0): Heightmap => ({
    meta: { site_id: 'x', lat: -89, lon: 0, kind, source: 's', level: 'L', cell_m: cell, width: size, height: size, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1, site_height_m: 0, line_offset_px: (size - 1) / 2, sample_offset_px: (size - 1) / 2, site_row_px: siteRow, site_col_px: siteCol },
    heightsM: new Float32Array(size * size).fill(value),
  });

  it('runs coarse to fine: a crop of the cap around the site, then the context, then the window, each with its own site pixel', () => {
    const cap = grid('cap', 1000, 960, 499.5, 499.5, 7);
    const context = grid('context', 64, 80, 31.6, 32.2);
    const window = grid('window', 128, 20, 64.1, 63.9);
    // A site 0.5 degree from the pole: 15 km, so 15.7 cap pixels from its centre.
    const levels = shadowLevels({ lat: -89.5, lon: 0 }, window, context, cap);
    expect(levels.map((l) => l.pxM)).toEqual([960, 80, 20]);
    expect(levels[0].width).toBe(2 * CAP_SHADOW_HALF_PX + 1);
    expect(levels[0].heights[0]).toBe(7);
    expect(levels[1]).toMatchObject({ width: 64, height: 64, siteCol: 31.6, siteRow: 32.2 });
    expect(levels[2]).toMatchObject({ width: 128, siteCol: 64.1, siteRow: 63.9 });
    const px = latLonToPixel(cap.meta, -89.5, 0);
    expect(levels[0].siteRow).toBeCloseTo(px.row - (Math.round(px.row) - CAP_SHADOW_HALF_PX), 9);
  });

  it('leaves the cap out for a site off it, such as one on the near side far from the pole: no levels, so flat ground', () => {
    const cap = grid('cap', 1000, 960, 499.5, 499.5, 7);
    // Blue Ghost, at 18.6 degrees north: thousands of cap pixels away, where a crop would clamp to the cap's edge.
    expect(shadowLevels({ lat: 18.56, lon: 61.81 }, null, null, cap)).toEqual([]);
    // 60 degrees south lies beyond a cap 480 km round the pole.
    expect(shadowLevels({ lat: -60, lon: 0 }, null, null, cap)).toEqual([]);
  });

  it('without a window, ends on the 48 km of the cap around the site that the 3D view shows', () => {
    const cap = grid('cap', 1000, 960, 499.5, 499.5, 7);
    const levels = shadowLevels({ lat: -89.5, lon: 0 }, null, null, cap);
    expect(levels.map((l) => l.width)).toEqual([2 * CAP_SHADOW_HALF_PX + 1, 2 * CAP_SITE_HALF_PX + 1]);
    expect(levels.map((l) => l.pxM)).toEqual([960, 960]);
    const px = latLonToPixel(cap.meta, -89.5, 0);
    expect(levels[1].siteRow).toBeCloseTo(px.row - (Math.round(px.row) - CAP_SITE_HALF_PX), 9);
  });

  it('crops the cap wider on request: the arrival flies over 200 km of it, whose shadows need the hills beyond', () => {
    const cap = grid('cap', 1000, 960, 499.5, 499.5, 7);
    const levels = shadowLevels({ lat: -89.5, lon: 0 }, null, null, cap, 480);
    expect(levels[0].width).toBe(961);
    expect(levels[0].pxM).toBe(960);
  });

  it('leaves out what is missing: no context for an 80 m window, no cap when it failed to load', () => {
    const window = grid('window', 64, 80, 31.5, 31.5);
    expect(shadowLevels({ lat: -85, lon: 0 }, window, null, null).map((l) => l.pxM)).toEqual([80]);
    expect(shadowLevels({ lat: -85, lon: 0 }, null, null, null)).toEqual([]);
  });
});

describe('pixelToLatLon / latLonToPixel', () => {
  const geo = { cell_m: 20, row0: 100, col0: 300, line_offset_px: 511.5, sample_offset_px: 511.5 };
  it('maps the projection origin to the south pole and round-trips through the raster offsets', () => {
    const pole = pixelToLatLon(geo, 511.5 - 300, 511.5 - 100);
    expect(pole.lat).toBeCloseTo(-90, 9);
    const px = latLonToPixel(geo, -90, 0);
    expect(px.col).toBeCloseTo(211.5, 9);
    expect(px.row).toBeCloseTo(411.5, 9);
    const ll = pixelToLatLon(geo, 40.25, 700.75);
    const back = latLonToPixel(geo, ll.lat, ll.lon);
    expect(back.col).toBeCloseTo(40.25, 6);
    expect(back.row).toBeCloseTo(700.75, 6);
  });
  it('puts north (smaller rows) toward lon 0 and east (larger cols) toward lon 90', () => {
    const north = pixelToLatLon(geo, 211.5, 411.5 - 50);
    expect(north.lon).toBeCloseTo(0, 9);
    const east = pixelToLatLon(geo, 211.5 + 50, 411.5);
    expect(east.lon).toBeCloseTo(90, 9);
  });
});

describe.skipIf(!present)('terrain rasters in web/public/data/terrain', () => {
  it('decodes shackleton_center and finds the site at the sidecar pixel and height', async () => {
    const manifest = readJson<TerrainManifest>(...terrainDir, 'manifest.json');
    const entry = windowFileFor(manifest, 'shackleton_center');
    expect(entry).toEqual({ file: 'shackleton_center.u16', meta: 'shackleton_center.json' });
    if (!entry) return;
    const meta = readJson<HeightmapMeta>(...terrainDir, entry.meta);
    const heights = await decodeHeightmap(readBytes(...terrainDir, entry.file), meta);
    expect(heights.length).toBe(meta.width * meta.height);
    const { lat, lon } = pixelToLatLon(meta, meta.site_col_px, meta.site_row_px);
    expect(Math.abs(lat - meta.lat)).toBeLessThan(1e-3);
    expect(Math.abs(lon - meta.lon)).toBeLessThan(1e-3);
    const px = latLonToPixel(meta, meta.lat, meta.lon);
    expect(px.col).toBeCloseTo(meta.site_col_px, 6);
    expect(px.row).toBeCloseTo(meta.site_row_px, 6);
    const centre = heights[(meta.height >> 1) * meta.width + (meta.width >> 1)];
    expect(Math.abs(centre - meta.site_height_m)).toBeLessThan(5);
    let lo = Infinity, hi = -Infinity;
    for (const h of heights) { if (h < lo) lo = h; if (h > hi) hi = h; }
    expect(lo).toBeCloseTo(meta.min_m, 2);
    expect(hi).toBeCloseTo(meta.max_m, 2);
  });

  it('the south cap sidecar puts the pole at its site pixel', () => {
    const meta = readJson<HeightmapMeta>(...terrainDir, 'south_cap.json');
    expect(meta.kind).toBe('cap');
    const { lat } = pixelToLatLon(meta, meta.site_col_px, meta.site_row_px);
    expect(lat).toBeCloseTo(-90, 9);
    const edge = pixelToLatLon(meta, meta.site_col_px, 0);
    expect(edge.lat).toBeLessThan(-59);
    expect(edge.lat).toBeGreaterThan(-61);
  });
});

describe.skipIf(!present)('terrain loaders over HTTP', () => {
  const publicData = repoPath('web', 'public', 'data');
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

  it('loads the manifest and a listed window from <base>/terrain/', async () => {
    const manifest = await loadTerrainManifest(base);
    expect(manifest.cap.file).toBe('south_cap.u16');
    expect(manifest.globe_texture).toBe('lroc_color_2k.jpg');
    const entry = windowFileFor(manifest, 'im2_athena');
    expect(entry).not.toBeNull();
    if (!entry) return;
    const hm = await loadHeightmap(base, entry.file, entry.meta);
    expect(hm.meta.site_id).toBe('im2_athena');
    expect(hm.heightsM.length).toBe(hm.meta.width * hm.meta.height);
    await expect(loadHeightmap(base, 'nope.u16', 'nope.json')).rejects.toMatchObject({ name: 'DataError', status: 404 });
  });
});

describe('globeTextureUrl', () => {
  const manifest = { version: 1, windows: [], cap: { file: 'c.u16', meta: 'c.json' }, globe_texture: 'lroc_color_2k.jpg' };
  it('builds the texture URL from the manifest when the texture was synced', async () => {
    const { globeTextureUrl } = await import('./terrain');
    expect(globeTextureUrl('/data', manifest)).toBe('/data/terrain/lroc_color_2k.jpg');
    expect(globeTextureUrl('/data', { ...manifest, globe_texture_present: true })).toBe('/data/terrain/lroc_color_2k.jpg');
  });
  it('returns null without a manifest or when the pipeline recorded the texture as absent', async () => {
    const { globeTextureUrl } = await import('./terrain');
    expect(globeTextureUrl('/data', null)).toBeNull();
    expect(globeTextureUrl('/data', { ...manifest, globe_texture_present: false })).toBeNull();
  });
});
