import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { createExploreStore, recompute } from './explore';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import type { Site } from '../data/loaders';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
const sites = [
  ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
  ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
];
const maskOf = (id: string) => readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);

function fileLoaders() {
  return {
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id: string) => {
      const m = maskOf(id);
      return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  };
}

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
    const custom: Site = { id: 'custom', name: 'Custom site', lat: -89.5, lon: 10, category: 'custom', polar: true, source: 'user' };
    store.getState().applyMask(custom, new Float64Array(720).fill(0), { siteHeightM: 0, source: 'computed' });
    expect(store.getState().siteId).toBe('custom');
    expect(store.getState().summary?.illumFraction).toBeGreaterThan(0);
  });
});
