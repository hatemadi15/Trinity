import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { hasFile, readBytes, readJson } from '../engine/__tests__/helpers';
import { createExploreStore } from '../store/explore';
import { degreesText, HOME, heroMask, heroSeries, PLACES, thousandsText } from './home';
import type { Site } from './loaders';

const validation = (name: string) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../data/validation', name), 'utf8'));

describe('home facts', () => {
  it('formats the tiny angle and the ratio for a sentence', () => {
    expect(degreesText(2.7e-5)).toBe('0.00003°');
    expect(thousandsText(19741)).toBe('20,000');
    expect(thousandsText(1499)).toBe('1,000');
  });

  it('has not drifted from the validation tables it summarises', () => {
    const horizons = validation('horizons.json');
    const mazarico = validation('mazarico.json');
    const backcasts = validation('backcasts.json');
    expect(HOME.facts.horizons_worst_el_deg).toBe(horizons.max_abs_delta_el_deg);
    expect(HOME.facts.horizons_rows).toBe(horizons.n_rows);
    const covered: number[] = mazarico.rows.filter((r: { covered: boolean; delta_points?: number }) => r.covered && r.delta_points !== undefined).map((r: { delta_points: number }) => Math.abs(r.delta_points)).sort((a: number, b: number) => a - b);
    const median = covered.length % 2 ? covered[(covered.length - 1) / 2] : (covered[covered.length / 2 - 1] + covered[covered.length / 2]) / 2;
    expect(HOME.facts.mazarico_sites).toBe(covered.length);
    expect(HOME.facts.mazarico_median_points).toBeCloseTo(median, 1);
    const ghost = backcasts.rows.find((r: { site_id: string }) => r.site_id === 'blue_ghost_m1');
    expect(HOME.facts.blue_ghost_end_minus_sunset_h).toBeCloseTo(ghost.end_minus_sunset_h, 1);
  });

  it('carries Earth for the same month, against the hills in its direction', () => {
    const s = HOME.sky;
    expect(s.earth_el).toHaveLength(720);
    expect(s.earth_hill_el).toHaveLength(720);
    expect(s.earth_visible).toHaveLength(720);
    const seen = s.earth_visible.reduce((a, b) => a + b, 0);
    expect(s.earth_pct).toBeCloseTo((100 * seen) / 720, 1);
    // In view exactly when Earth stands above the hills (away from the rounding of the stored heights).
    for (let h = 0; h < 720; h++) {
      const gap = s.earth_el[h] - s.earth_hill_el[h];
      if (Math.abs(gap) > 0.02) expect(s.earth_visible[h], `hour ${h}`).toBe(gap > 0 ? 1 : 0);
    }
  });

  it('carries what the battery does at the hero site, the figures of its landing fixture', () => {
    const fx = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../data/fixtures/landing/de_gerlache_rim_2_2027-01-01_30d.json'), 'utf8'));
    expect(HOME.battery.now_hours).toBe(fx.now_hours);
    expect(HOME.battery.best_hour).toBe(fx.period_best.hour);
    expect(HOME.battery.best_hours).toBe(fx.period_best.powered_hours);
    expect(HOME.battery.lander).toEqual(fx.config);
  });

  it('carries a full month of the hero site and its night', () => {
    expect(HOME.sky.hours).toBe(720);
    expect(HOME.sky.sun_el.length).toBe(720);
    expect(HOME.sky.night).toEqual({ sunset_hour: 67, sunrise_hour: 466, hours: 399 });
    expect(HOME.pair.rim_sun_pct).toBe(100);
  });

  it('turns the hero month into the engine’s hourly series: a fraction of the Sun’s disc wherever the pipeline says sunlit', () => {
    const s = heroSeries();
    expect(s.hours).toBe(720);
    for (let h = 0; h < s.hours; h++) expect(s.sunFraction[h] > 0).toBe(HOME.sky.lit[h] === 1);
    expect(s.sunAu[0]).toBeCloseTo(0.983, 2); // January: the Sun is nearest
    expect(heroMask()).toHaveLength(720);
  });

  it('lists the places in the order of the page: the ridge in the picture first, then the two landers on their dates', () => {
    expect(PLACES.map((p) => p.href)).toEqual(['/explore?site=de_gerlache_rim_2', '/explore?site=im2_athena&start=2025-03-06T18:00', '/explore?site=blue_ghost_m1&start=2025-03-02T09:00']);
    expect(PLACES.map((p) => p.tone)).toEqual(['plain', 'bad', 'good']);
  });
});

const haveData = hasFile('data', 'ephemeris', 'moon_me_2024_2036_1h.f32') && hasFile('data', 'masks', 'im2_athena.json');

describe.skipIf(!haveData)('the two landers on the home page', () => {
  it('open Explore on the first whole hour after the reported landing, with the Sun up there', async () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
    const store = createExploreStore({
      loadSites: async () => sites,
      loadEphemeris: async () => eph,
      loadMask: async (id: string) => {
        const m = readJson<{ elevation_deg: number[]; site_height_m: number }>('data', 'masks', `${id}.json`);
        return { site_id: id, lat: 0, lon: 0, mast_m: 2, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
      },
    });
    await store.getState().init();
    const landed = new Map<string, string>(validation('backcasts.json').rows.map((r: { site_id: string; landed_utc: string }) => [r.site_id, r.landed_utc]));
    const landers = PLACES.filter((p) => p.href.includes('start='));
    expect(landers).toHaveLength(2);
    for (const p of landers) {
      const query = p.href.slice(p.href.indexOf('?'));
      const id = new URLSearchParams(query).get('site')!;
      const firstHour = new Date(Math.ceil(Date.parse(landed.get(id)!) / 3_600_000) * 3_600_000).toISOString().slice(0, 19);
      await store.getState().applyQuery(query);
      const s = store.getState();
      expect(s.siteId).toBe(id);
      expect(s.startUtc, id).toBe(firstHour);
      expect(s.series!.sunFraction[0], id).toBeGreaterThan(0);
    }
  });
});
