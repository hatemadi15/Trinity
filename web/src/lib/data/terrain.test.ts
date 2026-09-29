import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decodeHeightmap,
  latLonToPixel,
  loadHeightmap,
  loadTerrainManifest,
  pixelToLatLon,
  windowFileFor,
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
