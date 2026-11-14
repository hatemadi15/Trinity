import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import { hourlySeries, summarize, withCommsThreshold } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget } from '../engine/power';
import { utcToEt } from '../engine/time';
import { periodOutcome } from '../plan/outcome';
import { NO_REQUIREMENTS } from '../plan/requirements';
import { recompute, scanOf } from '../store/explore';
import { eph, sites } from '@/test/file-loaders';
import { figuresOf, firstSunsetHour, seriesWithMask, summarizeVersions, versionsResult, type Figures } from './figures';

const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const shifted = (d: number) => mask.map((v) => v + d);
const START = '2027-01-01T00:00:00';

describe('the figures of a landing under another skyline', () => {
  it('sees the same hours over another skyline as the engine does when it traces them with that skyline', () => {
    const a = hourlySeries(site, mask, eph, utcToEt(START), 240);
    const other = shifted(0.4);
    const b = hourlySeries(site, other, eph, utcToEt(START), 240);
    const c = seriesWithMask(a, other);
    for (let h = 0; h < 240; h++) {
      expect(c.sunFraction[h]).toBeCloseTo(b.sunFraction[h], 12);
      expect(c.earthVisible[h]).toBe(b.earthVisible[h]);
    }
    // With a least height for Earth above the skyline, as the engine's radio threshold has it.
    const t = withCommsThreshold(b, other, 2);
    expect(Array.from(seriesWithMask(a, other, 2).earthVisible)).toEqual(Array.from(t.earthVisible));
  });

  it('gives the app’s own time with power, first sunset, longest night and contact while powered', () => {
    const r = recompute(eph, site, mask, START, 30);
    const f = figuresOf(r.series, DEFAULT_POWER, NO_REQUIREMENTS);
    expect(f.poweredH).toBe(r.power.firstBrownoutHour ?? r.series.hours);
    expect(f.allPeriod).toBe(r.power.firstBrownoutHour === null);
    expect(f.longestNightH).toBe(summarize(r.series).longestDarkH);
    expect(f.poweredContactH).toBe(periodOutcome(r.series, powerBudget(r.series, DEFAULT_POWER)).poweredContactH);
    expect(f.firstSunsetH).toBe(firstSunsetHour(r.series));
    expect(r.series.sunFraction[f.firstSunsetH! - 1]).toBeGreaterThan(0);
    expect(r.series.sunFraction[f.firstSunsetH!]).toBe(0);
    expect(f.meets).toBeNull();
    expect(figuresOf(r.series, DEFAULT_POWER, { ...NO_REQUIREMENTS, minPoweredH: 24 }).meets).toBe(true);
  });
});

describe('the versions summed up', () => {
  const fig = (o: Partial<Figures>): Figures => ({ poweredH: 76, allPeriod: false, firstSunsetH: 60, longestNightH: 400, poweredContactH: 0, meets: null, ...o });

  it('gives the range of each figure, and how many versions keep the verdict when no requirement is set', () => {
    const s = summarizeVersions([fig({ poweredH: 70 }), fig({ poweredH: 80, firstSunsetH: 64 }), fig({ poweredH: 720, allPeriod: true, firstSunsetH: null })], fig({}));
    expect(s).toMatchObject({ versions: 3, poweredH: [70, 720], firstSunsetH: [60, 64], noSunset: 1, basis: 'verdict', held: 2 });
  });

  it('counts the versions that meet the requirements when some are set', () => {
    const s = summarizeVersions([fig({ meets: true }), fig({ meets: false }), fig({ meets: true })], fig({ meets: true }));
    expect(s).toMatchObject({ basis: 'requirements', held: 2 });
  });
});

describe('every version of a landing, as the worker works it out', () => {
  it('brackets the app’s own figures with versions on either side of its skyline, and counts the holds of every landing hour', () => {
    const req = { ...NO_REQUIREMENTS, minPoweredH: 48 };
    const own = recompute(eph, site, mask, START, 30);
    const r = versionsResult({ series: scanOf(own.series), hours: 720, masks: [shifted(-0.3), mask, shifted(0.3)], power: DEFAULT_POWER, minEarthElDeg: 0, requirements: req, byHour: true });
    expect(r.summary.main.poweredH).toBe(own.power.firstBrownoutHour ?? 720);
    expect(r.summary.versions).toBe(3);
    expect(r.summary.poweredH[0]).toBeLessThanOrEqual(r.summary.main.poweredH);
    expect(r.summary.poweredH[1]).toBeGreaterThanOrEqual(r.summary.main.poweredH);
    expect(r.summary.longestNightH[0]).toBeLessThanOrEqual(r.summary.main.longestNightH);
    expect(r.summary.basis).toBe('requirements');
    expect(r.holdsByHour).toHaveLength(720);
    // Landing at the start, the count by hour is the summary's own.
    expect(r.holdsByHour![0]).toEqual({ held: r.summary.held, of: 3 });
    // An hour without Sun is never a landing time on offer, so nothing is counted for it.
    const dark = own.series.sunFraction.findIndex((f, h) => h > 0 && f === 0);
    expect(r.holdsByHour![dark]).toBeNull();
  });
});
