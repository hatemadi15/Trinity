import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { hasFile, readBytes, readJson } from '../engine/__tests__/helpers';
import { createExploreStore } from '../store/explore';
import { summarizeState } from './state-summary';

const haveData = hasFile('data', 'ephemeris', 'moon_me_2024_2036_1h.f32') && hasFile('data', 'masks', 'nobile_rim_2.json');

function fileLoaders() {
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
      const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  };
}

describe.skipIf(!haveData)('summarizeState', () => {
  it('is null before the store is ready', () => {
    const store = createExploreStore(fileLoaders());
    expect(summarizeState(store.getState())).toBeNull();
  });

  it('returns the site, window, rounded numbers, planner settings and compare rows', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('nobile_rim_2');
    store.getState().setWindow('2027-03-01T00:00:00', 14);
    await store.getState().addToCompare('de_gerlache_rim_2');
    const s = summarizeState(store.getState());
    expect(s).not.toBeNull();
    expect(s!.site).toEqual({ id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)', label: 'Nobile Rim 2', lat: -84.20156, lon: 60.69989 });
    expect(s!.window).toEqual({ startUtc: '2027-03-01T00:00:00', days: 14 });
    expect(s!.summary.hours).toBe(14 * 24);
    for (const k of ['illumFraction', 'earthVisFraction', 'jointFraction', 'meanSunFraction'] as const) {
      const v = s!.summary[k];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBe(Math.round(v * 1000) / 1000); // three decimals
    }
    expect(Number.isInteger(s!.summary.longestDarkH)).toBe(true);
    expect(Number.isInteger(s!.power.brownoutHours)).toBe(true);
    expect(typeof s!.power.survives).toBe('boolean');
    // Time with power from landing on the first day, capped at the period, and the hours of it with Earth in view.
    expect(s!.power.poweredHours).toBeGreaterThan(0);
    expect(s!.power.poweredHours).toBeLessThanOrEqual(14 * 24);
    expect(s!.power.contactHours).toBeLessThanOrEqual(s!.power.poweredHours);
    expect(s!.power.meanPowerW).toBe(Math.round(s!.power.meanPowerW * 10) / 10); // one decimal
    expect(s!.params.power.loadW).toBe(200);
    expect(s!.params.mastM).toBe(2);
    expect(s!.compare.map((c) => c.id)).toEqual(['de_gerlache_rim_2']);
    expect(s!.compare[0].name).toMatch(/de Gerlache Rim 2/);
    expect(typeof s!.compare[0].survives).toBe('boolean');
    expect(JSON.stringify(s).length).toBeLessThan(1500); // compact enough for a prompt
  });

  it('says whether power ends at night or with the Sun up, as the verdict does, and nothing when it does not end', async () => {
    const store = createExploreStore(fileLoaders());
    await store.getState().init();
    await store.getState().selectSite('nobile_rim_2');
    store.getState().setWindow('2027-03-01T00:00:00', 14);
    const night = summarizeState(store.getState())!;
    expect(night.power.survives).toBe(false);
    expect(night.power.endsAtNight).toBe(true);
    // Where the Sun never sets, a load above what the panel gives in full sunlight runs the battery down with the Sun up.
    await store.getState().selectSite('shackleton_center_rim_high');
    store.getState().setWindow('2027-01-01T00:00:00', 30);
    const lasts = summarizeState(store.getState())!;
    expect(lasts.power.survives).toBe(true);
    expect(lasts.power.endsAtNight).toBeUndefined();
    store.getState().setPower({ loadW: 2000 });
    const lowSun = summarizeState(store.getState())!;
    expect(lowSun.summary.longestDarkH).toBe(0);
    expect(lowSun.power.survives).toBe(false);
    expect(lowSun.power.endsAtNight).toBe(false);
  });
});
