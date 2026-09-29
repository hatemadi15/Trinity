import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from './ephemeris';
import { hourlySeries, type Series } from './metrics';
import { DEFAULT_POWER, irradianceWm2, panelCosine, powerBudget, powerSeries, simulateBattery, SOLAR_CONSTANT_WM2, type PowerConfig } from './power';
import { utcToEt } from './time';
import { readBytes, readJson } from './__tests__/helpers';

const D2R = Math.PI / 180;

function series(hours: number, sunAz: number, sunEl: number, sunFraction = 1): Series {
  return {
    i0: 0,
    hours,
    sunAz: new Float64Array(hours).fill(sunAz),
    sunEl: new Float64Array(hours).fill(sunEl),
    earthAz: new Float64Array(hours),
    earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours).fill(sunFraction),
    earthVisible: new Uint8Array(hours),
    sunAu: new Float64Array(hours).fill(1),
  };
}

describe('panel geometry and irradiance', () => {
  it('cosine factors for the four panel models', () => {
    expect(panelCosine('horizontal', 0, 90, 30)).toBeCloseTo(Math.sin(30 * D2R), 12);
    expect(panelCosine('vertical', 45, 45, 10)).toBeCloseTo(Math.cos(10 * D2R), 12);
    expect(panelCosine('vertical', 45, 135, 10)).toBeCloseTo(0, 12); // 90° off the panel normal
    expect(panelCosine('vertical', 0, 180, 10)).toBe(0); // facing away, clamped
    expect(panelCosine('vertical_tracking', 0, 200, 10)).toBeCloseTo(Math.cos(10 * D2R), 12);
    expect(panelCosine('full_tracking', 0, 200, 10)).toBe(1);
    expect(panelCosine('horizontal', 0, 0, -1)).toBe(0); // below the horizon, clamped
  });
  it('irradiance scales with the disk fraction and 1/au²', () => {
    expect(irradianceWm2(1, 1)).toBe(SOLAR_CONSTANT_WM2);
    expect(irradianceWm2(1, 0.5)).toBeCloseTo(680.5, 9);
    expect(irradianceWm2(2, 1)).toBeCloseTo(340.25, 9);
    expect(irradianceWm2(1, 0)).toBe(0);
  });
  it('powerSeries multiplies efficiency, area, irradiance and cosine', () => {
    const cfg: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 2, efficiency: 0.25 };
    const p = powerSeries(series(3, 0, 5), cfg);
    expect(Array.from(p)).toEqual([680.5, 680.5, 680.5]);
  });
});

describe('simulateBattery', () => {
  const cfg: PowerConfig = { ...DEFAULT_POWER, loadW: 100, batteryWh: 1000, initialSocFraction: 1 };
  it('discharges through the night and reports the minimum state of charge', () => {
    const p = new Float64Array(20); // 20 h of darkness at 100 W load: 1000 Wh is gone after 10 h
    const r = simulateBattery(p, cfg);
    expect(r.energyWh[0]).toBe(900);
    expect(r.energyWh[9]).toBe(0);
    expect(r.socMin).toBe(0);
    expect(r.firstBrownoutHour).toBe(10);
    expect(r.brownoutHours).toBe(10);
    expect(r.survives).toBe(false);
  });
  it('clamps charging at the capacity and survives when generation covers the load', () => {
    const p = new Float64Array(5).fill(500);
    const r = simulateBattery(p, { ...cfg, initialSocFraction: 0.5 });
    expect(Array.from(r.energyWh)).toEqual([900, 1000, 1000, 1000, 1000]);
    expect(r.socMin).toBeCloseTo(0.5, 12);
    expect(r.brownoutHours).toBe(0);
    expect(r.firstBrownoutHour).toBeNull();
    expect(r.survives).toBe(true);
    expect(r.meanPowerW).toBe(500);
  });
  it('reports a brownout from the first hour when the load always exceeds the power', () => {
    const r = simulateBattery(new Float64Array(3).fill(10), { ...cfg, areaM2: 0, batteryWh: 50, initialSocFraction: 0 });
    expect(r.firstBrownoutHour).toBe(0);
    expect(r.brownoutHours).toBe(3);
    expect(r.socMin).toBe(0);
    expect(Number.isFinite(r.meanPowerW)).toBe(true);
  });
  it('handles a zero-capacity battery without dividing by zero', () => {
    const r = simulateBattery(new Float64Array(2).fill(500), { ...cfg, batteryWh: 0 });
    expect(r.socMin).toBe(0);
    expect(r.survives).toBe(true);
  });
});

interface PowerFixture {
  site_id: string;
  lat: number;
  lon: number;
  start_utc: string;
  days: number;
  config: {
    panel: PowerConfig['panel'];
    panel_azimuth_deg: number;
    area_m2: number;
    efficiency: number;
    load_w: number;
    battery_wh: number;
    initial_soc_fraction: number;
  };
  summary: { soc_min: number; brownout_hours: number; first_brownout_hour: number | null; survives: boolean; mean_power_w: number };
  sample_indexes: number[];
  samples: { power_w: number[]; energy_wh: number[] };
}

describe('parity with the Python power model', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  for (const name of [
    'shackleton_center_rim_high_2025-01-01_60d_vertical_tracking.json',
    'shackleton_center_rim_high_2025-01-01_60d_horizontal.json',
    'shackleton_center_rim_high_2025-01-01_60d_vertical.json',
    'im1_odysseus_2025-01-01_60d_full_tracking.json',
  ]) {
    it(`matches ${name}`, () => {
      const fx = readJson<PowerFixture>('data', 'fixtures', 'power', name);
      const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', `${fx.site_id}.json`).elevation_deg;
      const s = hourlySeries({ lat: fx.lat, lon: fx.lon }, mask, eph, utcToEt(fx.start_utc), fx.days * 24);
      const cfg: PowerConfig = {
        panel: fx.config.panel,
        panelAzimuthDeg: fx.config.panel_azimuth_deg,
        areaM2: fx.config.area_m2,
        efficiency: fx.config.efficiency,
        loadW: fx.config.load_w,
        batteryWh: fx.config.battery_wh,
        initialSocFraction: fx.config.initial_soc_fraction,
      };
      const r = powerBudget(s, cfg);
      fx.sample_indexes.forEach((i, k) => {
        expect(r.powerW[i]).toBeCloseTo(fx.samples.power_w[k], 6);
        expect(r.energyWh[i]).toBeCloseTo(fx.samples.energy_wh[k], 6);
      });
      expect(r.socMin).toBeCloseTo(fx.summary.soc_min, 9);
      expect(r.brownoutHours).toBe(fx.summary.brownout_hours);
      expect(r.firstBrownoutHour).toBe(fx.summary.first_brownout_hour);
      expect(r.survives).toBe(fx.summary.survives);
      expect(r.meanPowerW).toBeCloseTo(fx.summary.mean_power_w, 6);
    });
  }
});
