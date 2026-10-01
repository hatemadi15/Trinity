import { describe, expect, it } from 'vitest';
import { AU_KM } from './constants';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { bestWindow, bestWindowAcross, contactWindows, diskFraction, headSeries, hourlySeries, longestRun, maskAtAzimuth, SeriesIndex, summarize, sunRadiusDeg, withCommsThreshold, type Series } from './metrics';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

function emptySeries(hours: number): Series {
  return {
    i0: 0, hours, sunAz: new Float64Array(hours), sunEl: new Float64Array(hours), earthAz: new Float64Array(hours), earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours), earthVisible: new Uint8Array(hours), sunAu: new Float64Array(hours).fill(1),
  };
}

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
    const s = { ...emptySeries(100), sunFraction, earthVisible } satisfies Series;
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
  it('bestWindow can restrict candidate starts and falls back when the filter rejects every start', () => {
    const sunFraction = new Float64Array(100);
    sunFraction.fill(1, 20, 60);
    const s = { ...emptySeries(100), sunFraction, earthVisible: new Uint8Array(100).fill(1) } satisfies Series;
    const idx = new SeriesIndex(s);
    const sunlit = bestWindow(idx, 24, 1, undefined, (h) => sunFraction[h] > 0);
    expect(sunlit.start).toBeGreaterThanOrEqual(20);
    expect(sunlit.summary.illumFraction).toBe(1);
    const none = bestWindow(idx, 24, 1, undefined, () => false);
    expect(none.start).toBeGreaterThanOrEqual(0);
    expect(none.score).toBe(bestWindow(idx, 24, 1).score);
  });
  it('bestWindowAcross scores the mean over several series and averages their summaries', () => {
    const a = { ...emptySeries(100), sunFraction: new Float64Array(100) };
    a.sunFraction.fill(1, 0, 50);
    const b = { ...emptySeries(100), sunFraction: new Float64Array(100) };
    b.sunFraction.fill(1, 25, 75);
    const best = bestWindowAcross([new SeriesIndex(a), new SeriesIndex(b)], 24, 1);
    expect(best.start).toBeGreaterThanOrEqual(25);
    expect(best.start).toBeLessThanOrEqual(26);
    expect(best.summary.illumFraction).toBeCloseTo(1, 9);
    expect(best.summary.hours).toBe(24);
    const single = bestWindowAcross([new SeriesIndex(a)], 24, 1);
    expect(single.start).toBe(bestWindow(new SeriesIndex(a), 24, 1).start);
    expect(single.score).toBeCloseTo(bestWindow(new SeriesIndex(a), 24, 1).score, 12);
  });
  it('withCommsThreshold lowers Earth visibility monotonically and keeps the rest of the series', () => {
    const hours = 200;
    const mask = new Float64Array(720).fill(2); // flat 2° skyline
    const earthEl = new Float64Array(hours);
    for (let h = 0; h < hours; h++) earthEl[h] = -3 + (h / hours) * 16; // −3° → +13°
    const base: Series = { ...emptySeries(hours), earthEl, sunFraction: new Float64Array(hours).fill(1) };
    const at0 = withCommsThreshold(base, mask, 0);
    const at5 = withCommsThreshold(base, mask, 5);
    const at10 = withCommsThreshold(base, mask, 10);
    const vis = (s: Series) => s.earthVisible.reduce((a, b) => a + b, 0);
    expect(vis(at0)).toBeGreaterThan(vis(at5));
    expect(vis(at5)).toBeGreaterThan(vis(at10));
    // el − 2 > 0 once el > 2: (2 + 3) / 16 × 200 = 62.5 → 63 hours excluded
    expect(vis(at0)).toBe(hours - 63);
    expect(at5.sunFraction).toBe(base.sunFraction); // untouched arrays are shared
    const m10 = summarize(at10);
    expect(m10.jointFraction).toBeLessThanOrEqual(Math.min(m10.illumFraction, m10.earthVisFraction));
  });
  it('contactWindows lists half-open runs of visible hours', () => {
    const s = { ...emptySeries(10), earthVisible: Uint8Array.from([0, 1, 1, 0, 0, 1, 0, 1, 1, 1]) };
    expect(contactWindows(s)).toEqual([{ start: 1, end: 3 }, { start: 5, end: 6 }, { start: 7, end: 10 }]);
    expect(contactWindows({ ...emptySeries(3), earthVisible: new Uint8Array(3) })).toEqual([]);
  });
});

interface Fixture {
  site_id: string; lat: number; lon: number; start_utc: string; days: number; start_index: number;
  metrics: { hours: number; illum_fraction: number; mean_sun_fraction: number; longest_dark_h: number; earth_vis_fraction: number; longest_earth_gap_h: number; joint_fraction: number };
  sample_indexes: number[]; samples: Record<'sun_az' | 'sun_el' | 'earth_az' | 'earth_el' | 'sun_fraction' | 'sun_au', number[]>; earth_visible: boolean[];
}

describe('parity with the Python report', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of ['shackleton_center_rim_high_2025-01-01_730d.json', 'im1_odysseus_2025-01-01_730d.json', 'nobile_rim_2_2025-01-01_730d.json']) {
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
        expect(series.sunAu[i]).toBeCloseTo(fx.samples.sun_au[k], 9);
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

describe('headSeries', () => {
  it('returns the first hours of a series without copying', () => {
    const s: Series = {
      i0: 7,
      hours: 4,
      sunAz: Float64Array.from([1, 2, 3, 4]),
      sunEl: Float64Array.from([1, 2, 3, 4]),
      earthAz: Float64Array.from([1, 2, 3, 4]),
      earthEl: Float64Array.from([1, 2, 3, 4]),
      sunFraction: Float64Array.from([1, 0, 1, 0]),
      earthVisible: Uint8Array.from([1, 1, 0, 0]),
      sunAu: Float64Array.from([1, 1, 1, 1]),
    };
    const head = headSeries(s, 2);
    expect(head.hours).toBe(2);
    expect(head.i0).toBe(7);
    expect(Array.from(head.sunFraction)).toEqual([1, 0]);
    expect(Array.from(head.earthVisible)).toEqual([1, 1]);
    expect(head.sunAz.buffer).toBe(s.sunAz.buffer);
    expect(headSeries(s, 9)).toBe(s);
  });
});
