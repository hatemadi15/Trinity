import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { bestLanding, bestLandingAcross, landingScores, poweredFrom, timeWithPower, YEAR_HOURS } from './landing';
import { hourlySeries, type Series } from './metrics';
import { DEFAULT_POWER, powerSeries, simulateBattery, type PowerConfig } from './power';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };

function series(sun: number[], earth?: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth ?? new Array<number>(n).fill(0)),
    sunAu: new Float64Array(n).fill(1),
  };
}
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

describe('poweredFrom', () => {
  it('counts the hours to the first brownout, capped at the period and at the end of the table', () => {
    const dark = powerSeries(series(rep(0, 30)), CFG);
    expect(poweredFrom(dark, CFG, 0, 30)).toBe(10);
    expect(poweredFrom(dark, CFG, 0, 6)).toBe(6);
    expect(poweredFrom(dark, CFG, 25, 30)).toBe(5);
    expect(poweredFrom(dark, CFG, 30, 30)).toBe(0);
    const dayThenNight = powerSeries(series([...rep(1, 5), ...rep(0, 30)]), CFG);
    expect(poweredFrom(dayThenNight, CFG, 0, 35)).toBe(15);
    expect(poweredFrom(dayThenNight, CFG, 5, 35)).toBe(10);
  });

  it('agrees with the battery walk from the start of the period', () => {
    const p = powerSeries(series([...rep(1, 3), ...rep(0, 20), ...rep(1, 4)]), CFG);
    const walk = simulateBattery(p, CFG);
    expect(poweredFrom(p, CFG, 0, p.length)).toBe(timeWithPower(walk));
    expect(timeWithPower(walk)).toBe(13);
    expect(timeWithPower(simulateBattery(powerSeries(series(rep(1, 8)), CFG), CFG))).toBe(8);
  });
});

describe('bestLanding', () => {
  it('is the sunlit hour with the longest time with power', () => {
    const s = series([...rep(0, 10), ...rep(1, 20), ...rep(0, 30), ...rep(1, 5), ...rep(0, 40)]);
    expect(bestLanding(s, CFG, { from: 0, to: 105, step: 1, capHours: 100 })).toEqual({ hour: 10, poweredHours: 30, earthFraction: 0 });
  });

  it('breaks ties by more contact with Earth, then by the earlier hour', () => {
    const sun = [...rep(1, 10), ...rep(0, 30), ...rep(1, 10), ...rep(0, 30)];
    const earth = [...rep(0, 40), ...rep(1, 40)];
    expect(bestLanding(series(sun, earth), CFG, { from: 0, to: 80, step: 1, capHours: 80 })?.hour).toBe(40);
    expect(bestLanding(series(sun), CFG, { from: 0, to: 80, step: 1, capHours: 80 })?.hour).toBe(0);
  });

  it('has no answer when no hour of the scan is sunlit', () => {
    expect(bestLanding(series(rep(0, 50)), CFG, { from: 0, to: 50, step: 1, capHours: 50 })).toBeNull();
  });

  it('caps the time with power at the period length and honours the step', () => {
    const scores = landingScores(series(rep(1, 50)), CFG, { from: 0, to: 26, step: 6, capHours: 24 });
    expect(Array.from(scores.hours)).toEqual([0, 6, 12, 18, 24]);
    expect(Array.from(scores.powered)).toEqual([24, 24, 24, 24, 24]);
    expect(bestLandingAcross([scores])).toEqual({ hour: 0, poweredHours: 24, earthFraction: 0 });
  });

  it('never scans past the end of the series', () => {
    const scores = landingScores(series(rep(1, 10)), CFG, { from: 0, to: 500, step: 4, capHours: 100 });
    expect(Array.from(scores.hours)).toEqual([0, 4, 8]);
    expect(Array.from(scores.powered)).toEqual([10, 6, 2]);
    expect(landingScores(series(rep(1, 10)), CFG, { from: 20, to: 30, step: 1, capHours: 5 }).hours).toHaveLength(0);
  });

  it('across several sites takes the mean and only hours at which every site is sunlit', () => {
    const a = landingScores(series([...rep(1, 10), ...rep(0, 30)]), CFG, { from: 0, to: 40, step: 5, capHours: 40 });
    const b = landingScores(series([...rep(0, 5), ...rep(1, 25), ...rep(0, 10)]), CFG, { from: 0, to: 40, step: 5, capHours: 40 });
    // Hour 0: a sunlit, b dark, so not a candidate. Hour 5: a keeps power 15 h, b 35 h (to the end of the table).
    expect(bestLandingAcross([a, b])).toEqual({ hour: 5, poweredHours: 25, earthFraction: 0 });
    expect(bestLandingAcross([])).toBeNull();
  });
});

interface LandingFixture {
  site_id: string;
  lat: number;
  lon: number;
  polar: boolean;
  start_utc: string;
  days: number;
  config: { panel: PowerConfig['panel']; panel_azimuth_deg: number; area_m2: number; efficiency: number; load_w: number; battery_wh: number; initial_soc_fraction: number };
  now_hours: number;
  period_best: { hour: number; powered_hours: number; earth_fraction: number } | null;
  year_best: { hour: number; powered_hours: number; earth_fraction: number } | null;
  sample_hours: number[];
  sample_powered: number[];
}

describe('parity with the Python reference', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of [
    'de_gerlache_rim_2_2027-01-01_30d.json',
    'shackleton_center_2027-01-01_30d.json',
    'shackleton_center_rim_high_2027-01-01_30d.json',
    'blue_ghost_m1_2025-03-02_14d.json',
    'nobile_rim_1_2027-01-01_90d.json',
  ]) {
    it(`matches ${name}`, () => {
      const fx = readJson<LandingFixture>('data', 'fixtures', 'landing', name);
      const mask = fx.polar ? readJson<{ elevation_deg: number[] }>('data', 'masks', `${fx.site_id}.json`).elevation_deg : new Float64Array(720);
      const period = fx.days * 24;
      const s = hourlySeries({ lat: fx.lat, lon: fx.lon }, mask, eph, utcToEt(fx.start_utc), YEAR_HOURS + period);
      const cfg: PowerConfig = {
        panel: fx.config.panel,
        panelAzimuthDeg: fx.config.panel_azimuth_deg,
        areaM2: fx.config.area_m2,
        efficiency: fx.config.efficiency,
        loadW: fx.config.load_w,
        batteryWh: fx.config.battery_wh,
        initialSocFraction: fx.config.initial_soc_fraction,
      };
      const powerW = powerSeries(s, cfg);
      expect(poweredFrom(powerW, cfg, 0, period)).toBe(fx.now_hours);
      expect(fx.sample_hours.map((h) => poweredFrom(powerW, cfg, h, period))).toEqual(fx.sample_powered);
      const check = (got: ReturnType<typeof bestLanding>, want: LandingFixture['period_best']) => {
        if (!want) {
          expect(got).toBeNull();
          return;
        }
        expect(got?.hour).toBe(want.hour);
        expect(got?.poweredHours).toBe(want.powered_hours);
        expect(got?.earthFraction).toBeCloseTo(want.earth_fraction, 12);
      };
      check(bestLanding(s, cfg, { from: 0, to: period, step: 1, capHours: period }), fx.period_best);
      check(bestLanding(s, cfg, { from: 0, to: YEAR_HOURS, step: 6, capHours: period }), fx.year_best);
    });
  }
});
