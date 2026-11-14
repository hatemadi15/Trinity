import { describe, expect, it, vi } from 'vitest';
import type { Site } from '../data/loaders';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { hasFile, readBytes, readJson } from '../engine/__tests__/helpers';
import { createExploreStore } from './explore';
import { exploreHref } from '../links';
import { parseExploreQuery } from './query';

describe('parseExploreQuery', () => {
  it('reads site, start and days, and ignores what it cannot use', () => {
    expect(parseExploreQuery('?site=im2_athena&start=2025-03-06&days=14')).toEqual({ site: 'im2_athena', startUtc: '2025-03-06T00:00:00', days: 14 });
    expect(parseExploreQuery(new URLSearchParams('site=nobile_rim_2'))).toEqual({ site: 'nobile_rim_2' });
    expect(parseExploreQuery('?start=2027-02-30&days=45')).toEqual({ days: 45 });
    expect(parseExploreQuery('?start=2027-02-30&days=120')).toEqual({});
    expect(parseExploreQuery('?start=2040-01-01')).toEqual({});
    expect(parseExploreQuery('?site=../etc&days=30')).toEqual({ days: 30 });
    expect(parseExploreQuery('')).toEqual({});
  });

  it('reads a landing hour and any length from 2 to 90 days; an old date-only link lands at 00:00 UTC and 14, 30 and 90 still work', () => {
    expect(parseExploreQuery('?site=nobile_rim_2&start=2027-01-20T17:00&days=7')).toEqual({ site: 'nobile_rim_2', startUtc: '2027-01-20T17:00:00', days: 7 });
    expect(parseExploreQuery('?start=2027-01-20&days=14')).toEqual({ startUtc: '2027-01-20T00:00:00', days: 14 });
    for (const days of [2, 30, 45, 90]) expect(parseExploreQuery(`?days=${days}`)).toEqual({ days });
    for (const days of ['1', '91', '7.5', '', 'seven', '-7']) expect(parseExploreQuery(`?days=${days}`), days).toEqual({});
    // Minutes in a link are read at the nearest whole hour, as the engine reads its hourly table.
    expect(parseExploreQuery('?start=2027-01-20T17:20').startUtc).toBe('2027-01-20T17:00:00');
    expect(parseExploreQuery('?start=2027-01-20T24:00')).toEqual({});
  });

  it("keeps a clicked point's id, as the store writes it, and still leaves out what is neither that nor a catalogue id", () => {
    expect(parseExploreQuery('?site=custom_-89.5000_10.0000&days=14')).toEqual({ site: 'custom_-89.5000_10.0000', days: 14 });
    expect(parseExploreQuery('?site=custom_-60.0000_-160.2500')).toEqual({ site: 'custom_-60.0000_-160.2500' });
    expect(parseExploreQuery('?site=custom_-90.0000_180.0000')).toEqual({ site: 'custom_-90.0000_180.0000' });
    expect(parseExploreQuery('?site=custom_x')).toEqual({});
    expect(parseExploreQuery(`?site=${'a'.repeat(70)}`)).toEqual({});
    expect(parseExploreQuery('?site=custom_-89.5_10.0')).toEqual({});
    expect(parseExploreQuery('?site=custom_-89.5000_10.0000_x')).toEqual({});
    // Numbers in the right form that name no point on the Moon.
    expect(parseExploreQuery('?site=custom_-95.0000_10.0000')).toEqual({});
    expect(parseExploreQuery('?site=custom_-89.5000_190.0000')).toEqual({});
    // The prefix is the clicked points' alone: a catalogue id that took it would be left out.
    const catalogue = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
    expect(catalogue.filter((s) => s.id.startsWith('custom_'))).toEqual([]);
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

  it('opens a seven-day period landing at 17:00 UTC from its address, and writes the same address back', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().applyQuery('?site=nobile_rim_2&start=2027-01-20T17:00&days=7');
    const s = store.getState();
    expect([s.siteId, s.startUtc, s.days, s.series?.hours, s.error]).toEqual(['nobile_rim_2', '2027-01-20T17:00:00', 7, 7 * 24, null]);
    expect(exploreHref(s.siteId!, s.startUtc, s.days)).toBe('/explore?site=nobile_rim_2&start=2027-01-20T17:00&days=7');
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

  it('opens a clicked point from its address, the reload or shared link of a visit there, its skyline computed again', async () => {
    const computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 12, failedTiles: 0 }));
    const store = createExploreStore({ ...fileLoaders(), computeMask });
    await store.getState().init();
    await store.getState().applyQuery('?site=custom_-89.5000_10.0000&start=2027-03-01&days=14');
    const s = store.getState();
    expect(s.siteId).toBe('custom_-89.5000_10.0000');
    expect(s.site?.category).toBe('custom');
    expect(s.maskMeta?.source).toBe('computed');
    expect(computeMask).toHaveBeenCalledWith(-89.5, 10, 2);
    expect(s.startUtc).toBe('2027-03-01T00:00:00');
    expect(s.series?.hours).toBe(14 * 24);
    expect(s.customError).toBeNull();
  });

  it('keeps the default site for a point outside the area a click may pick, as for an unknown id', async () => {
    const computeMask = vi.fn(async () => ({ mask: new Float64Array(720), siteHeightM: 12, failedTiles: 0 }));
    const store = createExploreStore({ ...fileLoaders(), computeMask });
    await store.getState().init();
    await store.getState().applyQuery('?site=custom_-45.0000_10.0000');
    expect(store.getState().siteId).toBe('de_gerlache_rim_2');
    expect(computeMask).not.toHaveBeenCalled();
    expect(store.getState().customError).toBeNull();
    expect(store.getState().error).toBeNull();
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
    // The problem names the site by its label (store/explore.ts, siteProblem).
    expect(store.getState().error).toMatch(/^Haworth: /);
  });
});

describe.skipIf(!haveData)('globe view after a mare site', () => {
  it('restores the terrain view for the next polar site when the globe was switched on automatically', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    expect(store.getState().mode).toBe('terrain');
    await store.getState().selectSite('blue_ghost_m1');
    expect(store.getState().mode).toBe('globe');
    await store.getState().selectSite('haworth');
    expect(store.getState().mode).toBe('terrain');
  });

  it('leaves a globe the user chose alone', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    store.getState().setMode('globe');
    await store.getState().selectSite('blue_ghost_m1');
    await store.getState().selectSite('haworth');
    expect(store.getState().mode).toBe('globe');
  });
});
