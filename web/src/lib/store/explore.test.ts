import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { createExploreStore, DEFAULT_PARAMS, recompute } from './explore';
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
    expect(s.siteId).toBe('de_gerlache_rim_2');
    expect(s.series?.hours).toBe(30 * 24);
    expect(s.best).toEqual({ hour: 466, poweredHours: 303, earthFraction: expect.closeTo(0.2541, 3) });
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
    await store.getState().selectSite('de_gerlache_rim_2'); // the default, cached by init
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

  it('terrainState is unavailable without terrain loaders or when the manifest fails', async () => {
    const none = createExploreStore(fileLoaders());
    await none.getState().init();
    expect(none.getState().terrainState).toBe('unavailable');
    const failing = createExploreStore({
      ...fileLoaders(),
      loadTerrainManifest: async () => {
        throw new Error('HTTP 404');
      },
      loadHeightmap: async () => {
        throw new Error('unreachable');
      },
    });
    await failing.getState().init();
    await failing.getState().waitForTerrain();
    expect(failing.getState().terrainState).toBe('unavailable');
  });

  it.skipIf(!terrainPresent)('terrainState goes loading then ready; windowLoading tracks the site window fetch', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let release2!: () => void;
    const gate2 = new Promise<void>((r) => {
      release2 = r;
    });
    const real = terrainLoaders();
    const store = createExploreStore({
      ...real,
      loadHeightmap: async (file, metaFile) => {
        await (file.endsWith('shackleton_center.u16') ? gate2 : gate);
        return real.loadHeightmap(file, metaFile);
      },
    });
    await store.getState().init();
    await store.getState().selectSite('shackleton_center_rim_high'); // a site with a detailed window
    expect(store.getState().terrainState).toBe('loading');
    release();
    await store.getState().waitForTerrain();
    expect(store.getState().terrainState).toBe('ready');
    expect(store.getState().windowLoading).toBe(false);
    expect(store.getState().heightmap?.meta.site_id).toBe(store.getState().siteId);
    // A second, uncached window: loading flips on for the fetch and off when it lands.
    await store.getState().selectSite('shackleton_center');
    expect(store.getState().windowLoading).toBe(true);
    release2();
    await store.getState().waitForTerrain();
    expect(store.getState().windowLoading).toBe(false);
    expect(store.getState().heightmap?.meta.site_id).toBe('shackleton_center');
  });

  it.skipIf(!terrainPresent)('windowLoading clears when a custom site replaces a selection whose window is still loading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = terrainLoaders();
    const store = createExploreStore({
      ...real,
      loadHeightmap: async (file, metaFile) => {
        if (file.endsWith('shackleton_center.u16')) await gate;
        return real.loadHeightmap(file, metaFile);
      },
    });
    await store.getState().init();
    await store.getState().waitForTerrain();
    await store.getState().selectSite('shackleton_center');
    expect(store.getState().windowLoading).toBe(true);
    store.getState().applyMask(custom, new Float64Array(720), { siteHeightM: 0, source: 'computed', failedTiles: 0 });
    expect(store.getState().windowLoading).toBe(false);
    release();
    await store.getState().waitForTerrain();
    await new Promise((r) => setTimeout(r, 20));
    const s = store.getState();
    expect(s.siteId).toBe(custom.id);
    expect(s.heightmap).toBeNull();
    expect(s.windowLoading).toBe(false);
  });

  it.skipIf(!terrainPresent)('windowLoading clears when returning to a cached window while another fetch is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = terrainLoaders();
    const store = createExploreStore({
      ...real,
      loadHeightmap: async (file, metaFile) => {
        if (file.endsWith('shackleton_center.u16')) await gate;
        return real.loadHeightmap(file, metaFile);
      },
    });
    await store.getState().init();
    await store.getState().selectSite('shackleton_center_rim_high'); // a site with a detailed window
    await store.getState().waitForTerrain();
    const first = store.getState().siteId!;
    await store.getState().selectSite('shackleton_center');
    expect(store.getState().windowLoading).toBe(true);
    await store.getState().selectSite(first);
    expect(store.getState().windowLoading).toBe(false);
    expect(store.getState().heightmap?.meta.site_id).toBe(first);
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(store.getState().heightmap?.meta.site_id).toBe(first);
    expect(store.getState().windowLoading).toBe(false);
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

describe('planner parameters, compare and best window', () => {
  const fakeCompute = async (lat: number, lon: number, mastM: number) => ({
    mask: new Float64Array(720).fill(mastM > 2 ? 0.5 : 1.5),
    siteHeightM: 100,
    failedTiles: 0,
  });

  it('recomputes the summary and power when parameters change', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const before = store.getState();
    expect(before.power?.powerW.length).toBe(30 * 24);
    expect(before.params).toEqual(DEFAULT_PARAMS);
    store.getState().setParams({ minEarthElDeg: 10 });
    const after = store.getState();
    expect(after.summary!.earthVisFraction).toBeLessThanOrEqual(before.summary!.earthVisFraction);
    expect(after.contacts.every((w) => w.end > w.start)).toBe(true);
    store.getState().setPower({ areaM2: 0 });
    expect(store.getState().power?.survives).toBe(false);
    expect(store.getState().power?.firstBrownoutHour).toBe(Math.floor(2000 / 200)); // full battery, 200 W load
  });

  it('selectCustom computes the mask through the loader and applies the site', async () => {
    const store = createExploreStore({ ...fileLoaders(), computeMask: fakeCompute });
    await store.getState().init();
    await store.getState().selectCustom(-89.5, 200);
    const s = store.getState();
    expect(s.site?.category).toBe('custom');
    expect(s.site?.lon).toBe(-160);
    expect(s.maskMeta?.source).toBe('computed');
    expect(s.maskBusy).toBe(false);
  });

  it('mast height recomputes the selected site skyline', async () => {
    const store = createExploreStore({ ...fileLoaders(), computeMask: fakeCompute });
    await store.getState().init();
    const featured = store.getState().mask!;
    store.getState().setParams({ mastM: 6 });
    await store.getState().waitForMask();
    expect(store.getState().mask).not.toBe(featured);
    expect(store.getState().mask![0]).toBe(0.5);
    expect(store.getState().maskMeta?.mastM).toBe(6);
    expect(store.getState().maskBusy).toBe(false);
  });

  it('addToCompare keeps at most four sites and removeFromCompare drops one', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    for (const id of ['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena', 'south_pole']) {
      await store.getState().addToCompare(id);
    }
    expect(store.getState().compareIds).toEqual(['shackleton_center', 'de_gerlache_center', 'im1_odysseus', 'im2_athena']);
    expect(store.getState().compare.map((c) => c.site.id)).toEqual(store.getState().compareIds);
    expect(store.getState().compare[0].power.powerW.length).toBe(30 * 24);
    store.getState().removeFromCompare('im1_odysseus');
    expect(store.getState().compareIds).toEqual(['shackleton_center', 'de_gerlache_center', 'im2_athena']);
    await store.getState().addToCompare('de_gerlache_center'); // duplicate ignored
    expect(store.getState().compareIds.length).toBe(3);
  });

  it('addToCompare accepts a computed custom site without a mask file', async () => {
    const store = createExploreStore({ ...fileLoaders(), computeMask: fakeCompute });
    await store.getState().init();
    await store.getState().selectCustom(-89.5, 10);
    const id = store.getState().siteId!;
    await store.getState().addToCompare(id);
    expect(store.getState().compare.map((c) => c.site.id)).toContain(id);
  });

  it('compare results follow the window and the parameters', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('shackleton_center');
    const h30 = store.getState().compare[0].series.hours;
    store.getState().setWindow('2027-03-01T00:00:00', 14);
    expect(store.getState().compare[0].series.hours).toBe(14 * 24);
    expect(h30).toBe(30 * 24);
    const before = store.getState().compare[0].power.meanPowerW;
    store.getState().setPower({ areaM2: 8 });
    expect(store.getState().compare[0].power.meanPowerW).toBeCloseTo(before * 2, 6);
  });

  it('clears the best-window note when the site, window or parameters change', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().findBestWindow(14);
    expect(store.getState().bestWindowNote).not.toBeNull();
    await store.getState().selectSite('shackleton_center');
    expect(store.getState().bestWindowNote).toBeNull();
    await store.getState().findBestWindow(14);
    store.getState().setWindow('2027-06-01T00:00:00', 14);
    expect(store.getState().bestWindowNote).toBeNull();
    await store.getState().findBestWindow(14);
    store.getState().setPower({ areaM2: 2 });
    expect(store.getState().bestWindowNote).toBeNull();
  });

  it('a slow custom compute that lands after another selection is dropped', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const store = createExploreStore({
      ...fileLoaders(),
      computeMask: async () => {
        await gate;
        return { mask: new Float64Array(720).fill(3), siteHeightM: 1, failedTiles: 0 };
      },
    });
    await store.getState().init();
    const pending = store.getState().selectCustom(-89.5, 20);
    expect(store.getState().maskBusy).toBe(true);
    await store.getState().selectSite('shackleton_center');
    release();
    await pending;
    expect(store.getState().siteId).toBe('shackleton_center');
    expect(store.getState().mask![0]).not.toBe(3);
    expect(store.getState().maskBusy).toBe(false);
  });

  it('a mast round trip settles on the final mast, starts at most one compute and never applies a stale one', async () => {
    const calls: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const store = createExploreStore({
      ...fileLoaders(),
      computeMask: async (_lat, _lon, mastM) => {
        calls.push(mastM);
        await gate;
        return { mask: new Float64Array(720).fill(mastM), siteHeightM: 1, failedTiles: 0 };
      },
    });
    await store.getState().init();
    const featured = store.getState().mask!;
    store.getState().setParams({ mastM: 3 });
    store.getState().setParams({ mastM: 4 });
    store.getState().setParams({ mastM: 2 });
    await store.getState().waitForMask();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().mask).toBe(featured);
    expect(store.getState().maskMeta?.mastM ?? 2).toBe(2);
    expect(calls.length).toBeLessThanOrEqual(1);
    expect(store.getState().maskBusy).toBe(false);
  });

  it('a mast compute that lands after the mast moved on is not applied', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const store = createExploreStore({
      ...fileLoaders(),
      computeMask: async (_lat, _lon, mastM) => {
        if (mastM === 5) await gate;
        return { mask: new Float64Array(720).fill(mastM), siteHeightM: 1, failedTiles: 0 };
      },
    });
    await store.getState().init();
    store.getState().setParams({ mastM: 5 });
    await store.getState().waitForDebounce();
    expect(store.getState().maskBusy).toBe(true);
    store.getState().setParams({ mastM: 7 });
    await store.getState().waitForMask();
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().maskMeta?.mastM).toBe(7);
    expect(store.getState().mask![0]).toBe(7);
    expect(store.getState().maskBusy).toBe(false);
  });

  it('compare entries carry the mast their skyline was computed with', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('shackleton_center');
    expect(store.getState().compare[0].mastM).toBe(2);
  });

  it('findBestWindow moves the start to the landing hour with the longest time with power in the next 12 months', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init(); // de Gerlache Rim 2, 1 January 2027, 30 days
    const result = await store.getState().findBestWindow(30);
    expect(result).toEqual({ startUtc: '2027-10-12T18:00:00', poweredHours: 333, earthFraction: expect.closeTo(0.7988, 3) });
    expect(store.getState().startUtc).toBe('2027-10-12T18:00:00');
    expect(store.getState().days).toBe(30);
    expect(store.getState().series!.sunFraction[0]).toBeGreaterThan(0); // a lander arrives in daylight
    expect(store.getState().bestWindowNote).toBe('Best landing in the next 12 months: 12 Oct 2027, power for 13 d 21 h, Earth in view 80 % of that time.');
  });

  it('findBestWindow across the compared sites takes the mean time with power and says so', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('im1_odysseus');
    await store.getState().addToCompare('shackleton_center_rim_high');
    const r = await store.getState().findBestWindow(14, 'compare');
    expect(r).not.toBeNull();
    expect(r!.poweredHours).toBeGreaterThan(300);
    expect(store.getState().startUtc).toBe(r!.startUtc);
    expect(store.getState().bestWindowNote).toMatch(/^Across 2 compared sites: best landing in the next 12 months: .* power for .* on average/);
    for (const c of store.getState().compare) expect(c.series.sunFraction[0]).toBeGreaterThan(0);
  });

  it('findBestWindow reports a site that never sees the Sun instead of moving the window', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('shackleton_center');
    await expect(store.getState().findBestWindow(30)).resolves.toBeNull();
    expect(store.getState().startUtc).toBe('2027-01-01T00:00:00');
    expect(store.getState().bestWindowNote).toBe('No hour in the next 12 months has sunlight here.');
  });

  it('findBestWindow near the end of the Sun and Earth table clamps the scan and never throws', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('shackleton_center_rim_high'); // sunlit almost always, so a candidate hour exists in the short scan
    store.getState().setWindow('2036-10-01T00:00:00', 90);
    expect(store.getState().error).toBeNull();
    const result = await store.getState().findBestWindow(90);
    expect(result).not.toBeNull();
    expect(store.getState().startUtc >= '2036-10-01T00:00:00').toBe(true);
    expect(store.getState().series?.hours).toBe(90 * 24);
    store.getState().setWindow('2036-12-01T00:00:00', 14);
    expect(store.getState().best).not.toBeUndefined();
    await expect(store.getState().findBestWindow(90)).resolves.toBeNull();
    expect(store.getState().bestWindowNote).toMatch(/does not fit/);
    expect(store.getState().startUtc).toBe('2036-12-01T00:00:00');
  });
});

describe('best landing date and the overview of all sites', () => {
  it('keeps the best landing hour of the period in step with the site, the period and the lander', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    expect(store.getState().best?.hour).toBe(466);
    store.getState().setWindow('2027-01-01T00:00:00', 14);
    expect(store.getState().best?.hour).toBeLessThan(14 * 24);
    await store.getState().selectSite('shackleton_center');
    expect(store.getState().best).toBeNull(); // the crater floor never sees the Sun
    await store.getState().selectSite('shackleton_center_rim_high');
    store.getState().setWindow('2027-01-01T00:00:00', 30);
    expect(store.getState().best?.poweredHours).toBe(720);
    store.getState().setPower({ batteryWh: 20000, loadW: 400, areaM2: 8 });
    expect(store.getState().best).not.toBeNull();
  });

  it('gives every compared site its own best landing hour', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().addToCompare('nobile_rim_1');
    expect(store.getState().compare[0].best).toEqual({ hour: 373, poweredHours: 388, earthFraction: expect.any(Number) });
  });

  it('loadOverview fills one entry per catalogue site and fetches each skyline once', async () => {
    const counters = { masks: 0, sites: 0 };
    const store = createExploreStore(fileLoaders({ counters }));
    await store.getState().init();
    await store.getState().loadOverview();
    const o = store.getState().overview;
    expect(Object.keys(o)).toHaveLength(19);
    expect(store.getState().overviewBusy).toBe(false);
    expect(o.de_gerlache_rim_2).toEqual({ sunFraction: expect.closeTo(0.446, 3), earthFraction: expect.closeTo(0.45, 3), nowHours: 76, best: { hour: 466, poweredHours: 303, earthFraction: expect.any(Number) } });
    expect(o.shackleton_center).toMatchObject({ sunFraction: 0, nowHours: 10, best: null });
    expect(o.shackleton_center_rim_high.nowHours).toBe(720);
    expect(o.blue_ghost_m1.sunFraction).toBeGreaterThan(0.3); // a flat horizon, no skyline file
    expect(counters.masks).toBe(18);
    await store.getState().loadOverview(); // same period and lander: nothing to do
    expect(counters.masks).toBe(18);
  });

  it('loadOverview starts again when the period or the lander changes', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().loadOverview();
    const before = store.getState().overview.de_gerlache_rim_2.nowHours;
    store.getState().setPower({ batteryWh: 20000 });
    await store.getState().loadOverview();
    expect(store.getState().overview.de_gerlache_rim_2.nowHours).toBeGreaterThan(before);
    store.getState().setWindow('2027-06-01T00:00:00', 14);
    await store.getState().loadOverview();
    expect(Object.keys(store.getState().overview)).toHaveLength(19);
  });

  it('loadOverview leaves a site out when its skyline cannot be loaded, and finishes', async () => {
    const base = fileLoaders();
    const store = createExploreStore({
      ...base,
      loadMask: async (id: string) => {
        if (id === 'haworth') throw new Error('could not load /data/masks/haworth.json (HTTP 404)');
        return base.loadMask(id);
      },
    });
    await store.getState().init();
    await store.getState().loadOverview();
    expect(store.getState().overview.haworth).toBeUndefined();
    expect(Object.keys(store.getState().overview)).toHaveLength(18);
    expect(store.getState().overviewBusy).toBe(false);
    expect(store.getState().error).toBeNull();
  });

  it('a newer loadOverview wins over one still running', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const first = store.getState().loadOverview();
    store.getState().setWindow('2027-03-01T00:00:00', 14);
    const second = store.getState().loadOverview();
    await Promise.all([first, second]);
    const period = recompute(eph, sites.find((s) => s.id === 'malapert_massif')!, Float64Array.from(maskOf('malapert_massif').elevation_deg), '2027-03-01T00:00:00', 14);
    expect(store.getState().overview.malapert_massif.sunFraction).toBeCloseTo(period.summary.illumFraction, 9);
    expect(store.getState().overviewBusy).toBe(false);
  });
});
