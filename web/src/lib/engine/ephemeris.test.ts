import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { AU_KM } from './constants';
import { azElFromBodyVector } from './geometry';
import { interpVectors, loadEphemeris, rowVectors, type EphemerisHeader } from './ephemeris';
import { utcToEt } from './time';
import { readBytes, readJson, repoPath } from './__tests__/helpers';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);

describe('ephemeris', () => {
  it('loads the committed table', () => {
    expect(eph.n).toBe(113_976);
    expect(eph.data.length).toBe(113_976 * 6);
    const { sun, earth } = rowVectors(eph, 0);
    expect(Math.hypot(...sun) / AU_KM).toBeGreaterThan(0.97);
    expect(Math.hypot(...sun) / AU_KM).toBeLessThan(1.03);
    expect(Math.hypot(...earth)).toBeGreaterThan(356_000);
    expect(Math.hypot(...earth)).toBeLessThan(407_000);
  });
  it('loadEphemeris rejects wrong byte length', () => {
    expect(() => loadEphemeris(new Uint8Array(10), header)).toThrow(/byte length/);
  });
  it('interpVectors rejects epochs outside the table', () => {
    expect(() => interpVectors(eph, eph.t0Et - 10)).toThrow(RangeError);
    expect(() => interpVectors(eph, eph.t0Et + (eph.n - 1) * eph.stepS)).toThrow(RangeError);
  });
  it('interpVectors reproduces grid rows exactly and is smooth between them', () => {
    const et = eph.t0Et + 1000 * eph.stepS;
    const a = interpVectors(eph, et);
    const r = rowVectors(eph, 1000);
    expect(a.sun[0]).toBeCloseTo(r.sun[0], 6);
    const mid = interpVectors(eph, et + eph.stepS / 2);
    const next = rowVectors(eph, 1001);
    const between = (v: number, lo: number, hi: number) => v >= Math.min(lo, hi) - 1e3 && v <= Math.max(lo, hi) + 1e3;
    expect(between(mid.sun[0], r.sun[0], next.sun[0])).toBe(true);
  });
  it('matches JPL Horizons az/el to 0.002 deg for every fixture row', () => {
    const dir = repoPath('data', 'fixtures', 'horizons');
    const files = fs.readdirSync(dir).filter((f) => /_(sun|earth)\.json$/.test(f));
    expect(files.length).toBe(12);
    let worstEl = 0, worstAz = 0, rows = 0;
    for (const f of files) {
      const doc = readJson<{ body: string; lat: number; lon: number; rows: { utc: string; az: number; el: number }[] }>('data', 'fixtures', 'horizons', f);
      for (const row of doc.rows) {
        const v = interpVectors(eph, utcToEt(row.utc));
        const { az, el } = azElFromBodyVector(doc.body === 'SUN' ? v.sun : v.earth, doc.lat, doc.lon, 0);
        const dAz = ((az - row.az + 540) % 360) - 180;
        worstAz = Math.max(worstAz, Math.abs(dAz * Math.cos((row.el * Math.PI) / 180)));
        worstEl = Math.max(worstEl, Math.abs(el - row.el));
        rows++;
      }
    }
    expect(rows).toBe(300);
    expect(worstEl).toBeLessThan(0.002);
    expect(worstAz).toBeLessThan(0.002);
  });
});
