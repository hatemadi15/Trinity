import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { createExploreStore, recompute } from './explore';
import { hasFile, readBytes, readJson } from '../engine/__tests__/helpers';
import type { Site } from '../data/loaders';
import { decodeHeightmap, type HeightmapMeta, type TerrainManifest } from '../data/terrain';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];
const maskOf = (id: string) =>
  readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);

function fileLoaders(opts: { delayMs?: (id: string) => number; counters?: { masks: number; sites: number } } = {}) {
  return {
    loadSites: async () => {
      if (opts.counters) opts.counters.sites++;
      return sites;
    },
    loadEphemeris: async () => eph,
    loadMask: async (id: string) => {
      if (opts.counters) opts.counters.masks++;
      const delay = opts.delayMs?.(id) ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const m = maskOf(id);
      return {
        site_id: id,
        lat: 0,
        lon: 0,
        mast_m: 2,
        site_height_m: m.site_height_m,
        elevation_deg: m.elevation_deg,
        bands: [],
        fallback_bands: [],
      };
    },
  };
}

const custom: Site = { id: 'custom', name: 'Custom site', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };

describe('recompute', () => {
  it('returns a series and summary for a featured site', () => {
    const site = sites.find((s) => s.id === 'shackleton_center_rim_high')!;
    const { series, summary } = recompute(eph, site, Float64Array.from(maskOf(site.id).elevation_deg), '2025-01-01T00:00:00', 30);
    expect(series.hours).toBe(720);
    expect(summary.illumFraction).toBeGreaterThan(0.5);
  });
});

describe('explore store', () => {
  it('init loads sites, ephemeris and the default site', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const s = store.getState();
    expect(s.status).toBe('ready');
    expect(s.siteId).toBe('shackleton_center_rim_high');
    expect(s.series?.hours).toBe(30 * 24);
    expect(s.summary?.longestDarkH).toBeGreaterThanOrEqual(0);
  });
  it('init is a no-op once data is loaded and keeps the chosen site', async () => {
    const counters = { masks: 0, sites: 0 };
    const store = createExploreStore(fileLoaders({ counters }));
    await store.getState().init();
    await store.getState().selectSite('shackleton_center');
    await store.getState().init();
    expect(counters.sites).toBe(1);
    expect(store.getState().siteId).toBe('shackleton_center');
  });
  it('selectSite recomputes and resets the cursor', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setCursor(100);
    await store.getState().selectSite('shackleton_center');
    const s = store.getState();
    expect(s.siteId).toBe('shackleton_center');
    expect(s.summary?.illumFraction).toBe(0);
    expect(s.cursorHour).toBe(0);
  });
  it('selectSite reuses a cached mask instead of fetching again', async () => {
    const counters = { masks: 0, sites: 0 };
    const store = createExploreStore(fileLoaders({ counters }));
    await store.getState().init();
    await store.getState().selectSite('shackleton_center');
    await store.getState().selectSite('shackleton_center_rim_high');
    expect(counters.masks).toBe(2);
  });
  it('a computed custom site can be re-selected after switching away', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().applyMask(custom, new Float64Array(720).fill(0), { siteHeightM: 0, source: 'computed', failedTiles: 0 });
    await store.getState().selectSite('shackleton_center');
    await store.getState().selectSite(custom.id);
    const s = store.getState();
    expect(s.siteId).toBe(custom.id);
    expect(s.error).toBeNull();
    expect(s.maskMeta?.source).toBe('computed');
  });
  it('a window change during a slow site load does not leave the series and window out of step', async () => {
    const store = createExploreStore(fileLoaders({ delayMs: (id) => (id === 'shackleton_center' ? 30 : 0) }));
    await store.getState().init();
    const pending = store.getState().selectSite('shackleton_center');
    store.getState().setWindow('2027-01-01T00:00:00', 90);
    await pending;
    const s = store.getState();
    expect(s.siteId).toBe('shackleton_center');
    expect(s.days).toBe(90);
    expect(s.series?.hours).toBe(90 * 24);
  });
  it('rapid site switches end on the last requested site', async () => {
    const store = createExploreStore(fileLoaders({ delayMs: (id) => (id === 'shackleton_center' ? 40 : 0) }));
    await store.getState().init();
    const slow = store.getState().selectSite('shackleton_center');
    const fast = store.getState().selectSite('south_pole');
    await Promise.all([slow, fast]);
    expect(store.getState().siteId).toBe('south_pole');
  });
  it('setWindow clamps the cursor', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setWindow('2027-01-01T00:00:00', 90);
    store.getState().setCursor(2000);
    store.getState().setWindow('2027-01-01T00:00:00', 14);
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });
  it('setWindow past the table sets an error and keeps state', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const before = store.getState().series;
    store.getState().setWindow('2036-12-20T00:00:00', 90);
    const s = store.getState();
    expect(s.error).toMatch(/ephemeris table/);
    expect(s.series).toBe(before);
    expect(s.days).toBe(30);
  });
  it('applyMask installs a computed mask for a custom site', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().applyMask(custom, new Float64Array(720).fill(0), { siteHeightM: 0, source: 'computed', failedTiles: 2 });
    expect(store.getState().siteId).toBe('custom');
    expect(store.getState().summary?.illumFraction).toBeGreaterThan(0);
    expect(store.getState().maskMeta?.failedTiles).toBe(2);
  });
});

describe('explore store terrain (Week 3)', () => {
  const terrainPresent = hasFile('web', 'public', 'data', 'terrain', 'manifest.json');
  const terrainLoaders = () => ({
    ...fileLoaders(),
    loadTerrainManifest: async () => readJson<TerrainManifest>('web', 'public', 'data', 'terrain', 'manifest.json'),
    loadHeightmap: async (file: string, metaFile: string) => {
      const meta = readJson<HeightmapMeta>('web', 'public', 'data', 'terrain', metaFile);
      const bytes = readBytes('web', 'public', 'data', 'terrain', file);
      return { meta, heightsM: await decodeHeightmap(bytes, meta) };
    },
  });

  it('defaults to terrain mode with 1x exaggeration and toggles both', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    expect(store.getState().mode).toBe('terrain');
    expect(store.getState().exaggeration).toBe(1);
    store.getState().setMode('globe');
    store.getState().setExaggeration(3);
    expect(store.getState().mode).toBe('globe');
    expect(store.getState().exaggeration).toBe(3);
  });

  it('works without terrain loaders (heightmaps stay null)', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    expect(store.getState().heightmap).toBeNull();
    expect(store.getState().capHeightmap).toBeNull();
  });

  it.skipIf(!terrainPresent)('selectSite loads the terrain window when listed', async () => {
    const store = createExploreStore(terrainLoaders());
    await store.getState().init();
    await store.getState().selectSite('shackleton_center');
    await store.getState().waitForTerrain();
    const s = store.getState();
    expect(s.heightmap?.meta.site_id).toBe('shackleton_center');
    expect(s.heightmap?.heightsM.length).toBe(1024 * 1024);
    expect(s.capHeightmap?.meta.kind).toBe('cap');
  });

  it.skipIf(!terrainPresent)('custom site without a window falls back to the cap', async () => {
    const store = createExploreStore(terrainLoaders());
    await store.getState().init();
    store.getState().applyMask(custom, new Float64Array(720).fill(0), { siteHeightM: 0, source: 'computed', failedTiles: 0 });
    await store.getState().waitForTerrain();
    const s = store.getState();
    expect(s.siteId).toBe(custom.id);
    expect(s.heightmap).toBeNull();
    expect(s.capHeightmap?.meta.kind).toBe('cap');
  });
});
