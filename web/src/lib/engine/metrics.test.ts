import { describe, expect, it } from 'vitest';
import { AU_KM } from './constants';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { bestWindow, diskFraction, hourlySeries, longestRun, maskAtAzimuth, SeriesIndex, summarize, sunRadiusDeg, type Series } from './metrics';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

describe('metrics primitives', () => {
  it('disk fraction endpoints and middle', () => {
    expect(diskFraction(-1, 0.2665)).toBeCloseTo(0, 12);
    expect(diskFraction(1, 0.2665)).toBeCloseTo(1, 12);
    expect(diskFraction(0, 0.2665)).toBeCloseTo(0.5, 12);
    expect(diskFraction(0.13325, 0.2665)).toBeCloseTo(0.8045, 3);
  });
  it('sun radius at 1 AU', () => {
    expect(sunRadiusDeg(AU_KM)).toBeCloseTo(0.2665, 3);
  });
  it('maskAtAzimuth wraps', () => {
    const mask = new Float64Array(720);
    mask[0] = 10;
    expect(maskAtAzimuth(mask, 359.75)).toBeCloseTo(5, 12);
    expect(maskAtAzimuth(mask, 0.25)).toBeCloseTo(5, 12);
  });
  it('longestRun with bounds', () => {
    expect(longestRun([0, 1, 1, 0, 1, 1, 1, 0])).toBe(3);
    expect(longestRun([0, 1, 1, 0, 1, 1, 1, 0], 0, 4)).toBe(2);
    expect(longestRun(new Uint8Array(5))).toBe(0);
  });
  it('summarize on a synthetic series', () => {
    const sunFraction = new Float64Array(100);
    sunFraction.fill(1, 0, 60);
    const earthVisible = new Uint8Array(100);
    earthVisible.fill(1, 0, 50);
    const s = { i0: 0, hours: 100, sunAz: new Float64Array(100), sunEl: new Float64Array(100), earthAz: new Float64Array(100), earthEl: new Float64Array(100), sunFraction, earthVisible } satisfies Series;
    const m = summarize(s);
    expect(m.illumFraction).toBeCloseTo(0.6, 12);
    expect(m.longestDarkH).toBe(40);
    expect(m.earthVisFraction).toBeCloseTo(0.5, 12);
    expect(m.longestEarthGapH).toBe(50);
    expect(m.jointFraction).toBeCloseTo(0.5, 12);
    const idx = new SeriesIndex(s);
    expect(idx.window(0, 100)).toEqual(m);
    expect(idx.window(50, 100).illumFraction).toBeCloseTo(0.2, 12);
    expect(idx.window(50, 100).longestDarkH).toBe(40);
    const best = bestWindow(idx, 24, 1);
    expect(best.start).toBeLessThanOrEqual(26);
    expect(best.summary.illumFraction).toBe(1);
  });
});

interface Fixture {
  site_id: string; lat: number; lon: number; start_utc: string; days: number; start_index: number;
  metrics: { hours: number; illum_fraction: number; mean_sun_fraction: number; longest_dark_h: number; earth_vis_fraction: number; longest_earth_gap_h: number; joint_fraction: number };
  sample_indexes: number[]; samples: Record<'sun_az' | 'sun_el' | 'earth_az' | 'earth_el' | 'sun_fraction', number[]>; earth_visible: boolean[];
}

describe('parity with the Python report', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of ['shackleton_center_rim_high_2025-01-01_730d.json', 'im1_odysseus_2025-01-01_730d.json']) {
    it(`matches ${name}`, () => {
      const fx = readJson<Fixture>('data', 'fixtures', 'metrics', name);
      const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', `${fx.site_id}.json`).elevation_deg;
      const series = hourlySeries({ lat: fx.lat, lon: fx.lon }, mask, eph, utcToEt(fx.start_utc), fx.days * 24);
      expect(series.i0).toBe(fx.start_index);
      fx.sample_indexes.forEach((i, k) => {
        expect(series.sunAz[i]).toBeCloseTo(fx.samples.sun_az[k], 6);
        expect(series.sunEl[i]).toBeCloseTo(fx.samples.sun_el[k], 6);
        expect(series.earthAz[i]).toBeCloseTo(fx.samples.earth_az[k], 6);
        expect(series.earthEl[i]).toBeCloseTo(fx.samples.earth_el[k], 6);
        expect(series.sunFraction[i]).toBeCloseTo(fx.samples.sun_fraction[k], 9);
        expect(series.earthVisible[i] === 1).toBe(fx.earth_visible[k]);
      });
      const m = summarize(series);
      expect(m.hours).toBe(fx.metrics.hours);
      expect(m.illumFraction).toBeCloseTo(fx.metrics.illum_fraction, 9);
      expect(m.meanSunFraction).toBeCloseTo(fx.metrics.mean_sun_fraction, 9);
      expect(m.longestDarkH).toBe(fx.metrics.longest_dark_h);
      expect(m.earthVisFraction).toBeCloseTo(fx.metrics.earth_vis_fraction, 9);
      expect(m.longestEarthGapH).toBe(fx.metrics.longest_earth_gap_h);
      expect(m.jointFraction).toBeCloseTo(fx.metrics.joint_fraction, 9);
    });
  }
  it('hourlySeries rejects a span past the table', () => {
    const mask = new Float64Array(720);
    expect(() => hourlySeries({ lat: -89, lon: 0 }, mask, eph, utcToEt('2036-12-01T00:00:00'), 24 * 40)).toThrow(/outside the ephemeris table/);
    expect(() => hourlySeries({ lat: -89, lon: 0 }, mask, eph, utcToEt('2023-12-31T00:00:00'), 24)).toThrow(/outside the ephemeris table/);
  });
});
