import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { hasFile, readBytes, readJson } from '../engine/__tests__/helpers';
import { createExploreStore } from './explore';
import { parseExploreQuery } from './query';

describe('parseExploreQuery', () => {
  it('reads site, start and days, and ignores what it cannot use', () => {
    expect(parseExploreQuery('?site=im2_athena&start=2025-03-06&days=14')).toEqual({ site: 'im2_athena', startUtc: '2025-03-06T00:00:00', days: 14 });
    expect(parseExploreQuery(new URLSearchParams('site=nobile_rim_2'))).toEqual({ site: 'nobile_rim_2' });
    expect(parseExploreQuery('?start=2027-02-30&days=45')).toEqual({});
    expect(parseExploreQuery('?start=2040-01-01')).toEqual({});
    expect(parseExploreQuery('?site=../etc&days=30')).toEqual({ days: 30 });
    expect(parseExploreQuery('')).toEqual({});
  });
});

const haveData = hasFile('data', 'ephemeris', 'moon_me_2024_2036_1h.f32') && hasFile('data', 'masks', 'im2_athena.json');

function fileLoaders(failFor?: string) {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const sites = [
    ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
    ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
  ];
  return {
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id: string) => {
      if (id === failFor) throw new Error(`could not load /data/masks/${id}.json (HTTP 404)`);
      const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  };
}

describe.skipIf(!haveData)('applyQuery', () => {
  it('selects the site and the window from the URL, once the store is ready', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().applyQuery('?site=im2_athena&start=2025-03-06&days=14');
    const s = store.getState();
    expect(s.siteId).toBe('im2_athena');
    expect(s.startUtc).toBe('2025-03-06T00:00:00');
    expect(s.days).toBe(14);
    expect(s.series?.hours).toBe(14 * 24);
  });

  it('ignores unknown sites and bad dates and keeps the defaults', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    const before = store.getState();
    await store.getState().applyQuery('?site=atlantis&start=2027-02-30');
    const after = store.getState();
    expect(after.siteId).toBe(before.siteId);
    expect(after.startUtc).toBe(before.startUtc);
    expect(after.error).toBeNull();
  });

  it('gives a mare site a flat skyline and the globe view', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().applyQuery('?site=blue_ghost_m1&start=2025-03-02&days=14');
    const s = store.getState();
    expect(s.siteId).toBe('blue_ghost_m1');
    expect(s.maskMeta?.source).toBe('flat');
    expect(s.mask?.length).toBe(720);
    expect(Math.max(...Array.from(s.mask!))).toBe(0);
    expect(s.mode).toBe('globe');
    expect(s.summary!.illumFraction).toBeGreaterThan(0.9); // the 14 days after the landing are daylight on the mare
    expect(s.error).toBeNull();
  });
});

describe.skipIf(!haveData)('selectSite failure', () => {
  it('resets maskBusy and reports the error', async () => {
    const store = createExploreStore(fileLoaders('haworth'));
    await store.getState().init();
    store.setState({ maskBusy: true });
    await store.getState().selectSite('haworth');
    expect(store.getState().maskBusy).toBe(false);
    expect(store.getState().error).toMatch(/haworth/);
  });
});
