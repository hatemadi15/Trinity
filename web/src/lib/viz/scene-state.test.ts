import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { hourlySeries, maskAtAzimuth } from '../engine/metrics';
import { utcToEt } from '../engine/time';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import { sceneStateAt, siteUpThree } from './scene-state';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: ArrayLike<number>): number => Math.hypot(a[0], a[1], a[2]);

describe('scene state from the store', () => {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const maskDoc = readJson<{ lat: number; lon: number; elevation_deg: number[] }>('data', 'masks', 'shackleton_center_rim_high.json');
  const mask = Float64Array.from(maskDoc.elevation_deg);
  const site = { lat: maskDoc.lat, lon: maskDoc.lon };
  const series = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 240);
  const up = siteUpThree(site.lat, site.lon);

  it('siteUpThree is the unit site vector with lunar north at +y', () => {
    expect(norm(up)).toBeCloseTo(1, 12);
    expect(up[1]).toBeCloseTo(Math.sin(site.lat * DEG), 12);
  });

  for (const cursor of [0, 100]) {
    describe(`cursor ${cursor}`, () => {
      const s = sceneStateAt(eph, series, mask, cursor);

      it('copies the series angles', () => {
        expect(s.sunAz).toBe(series.sunAz[cursor]);
        expect(s.sunEl).toBe(series.sunEl[cursor]);
        expect(s.earthAz).toBe(series.earthAz[cursor]);
        expect(s.earthEl).toBe(series.earthEl[cursor]);
      });

      it('local directions are unit vectors whose up component is sin(el)', () => {
        expect(norm(s.sunDirLocal)).toBeCloseTo(1, 12);
        expect(Math.abs(s.sunDirLocal[1] - Math.sin(s.sunEl * DEG))).toBeLessThan(1e-9);
        expect(norm(s.earthDirLocal)).toBeCloseTo(1, 12);
        expect(Math.abs(s.earthDirLocal[1] - Math.sin(s.earthEl * DEG))).toBeLessThan(1e-9);
      });

      it('Moon-frame directions agree with the local elevations (pins moonToThree against the engine)', () => {
        expect(norm(s.sunDirMoon)).toBeCloseTo(1, 9);
        const sunElFromMoon = Math.asin(dot(s.sunDirMoon, up)) * RAD;
        expect(Math.abs(sunElFromMoon - s.sunEl)).toBeLessThan(0.3);
        // Earth is only ~384,000 km away: Moon-centred vs topocentric differ by up to ~0.26° of parallax.
        expect(norm(s.earthDirMoon)).toBeCloseTo(1, 9);
        const earthElFromMoon = Math.asin(dot(s.earthDirMoon, up)) * RAD;
        expect(Math.abs(earthElFromMoon - s.earthEl)).toBeLessThan(0.5);
      });

      it('skyline values are the mask sampled at the body azimuths', () => {
        expect(s.skylineAtSun).toBe(maskAtAzimuth(mask, s.sunAz));
        expect(s.skylineAtEarth).toBe(maskAtAzimuth(mask, s.earthAz));
      });

      it('light is off below the skyline and full from half a degree above it', () => {
        if (s.sunEl < s.skylineAtSun) {
          expect(s.light).toEqual({ intensity: 0, castShadow: false });
        } else if (s.sunEl >= s.skylineAtSun + 0.5) {
          expect(s.light).toEqual({ intensity: 1, castShadow: true });
        } else {
          expect(s.light.intensity).toBeGreaterThanOrEqual(0);
          expect(s.light.intensity).toBeLessThanOrEqual(1);
        }
      });

      it('earthVisible mirrors the series flag', () => {
        expect(s.earthVisible).toBe(series.earthVisible[cursor] === 1);
      });
    });
  }

  it('a raised mask (5° all round) switches the light off at cursor 0', () => {
    // The Sun never climbs above ~1.8° at 89.78°S, so a 5° skyline always hides it.
    const raised = new Float64Array(720).fill(5);
    const s = sceneStateAt(eph, series, raised, 0);
    expect(s.skylineAtSun).toBeCloseTo(5, 9);
    expect(s.light).toEqual({ intensity: 0, castShadow: false });
  });

  it('a sunk mask (-10° all round) keeps the light at full intensity', () => {
    const sunk = new Float64Array(720).fill(-10);
    const s = sceneStateAt(eph, series, sunk, 100);
    expect(s.light).toEqual({ intensity: 1, castShadow: true });
  });

  it('rejects a cursor outside the series', () => {
    expect(() => sceneStateAt(eph, series, mask, -1)).toThrow(RangeError);
    expect(() => sceneStateAt(eph, series, mask, 240)).toThrow(RangeError);
    expect(() => sceneStateAt(eph, series, mask, 1.5)).toThrow(RangeError);
  });
});
