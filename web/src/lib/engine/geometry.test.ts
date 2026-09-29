import { describe, expect, it } from 'vitest';
import { R_MOON_M } from './constants';
import { azElFromBodyVector, enuBasis, normalizeLon, psSouthLatLon, psSouthXY, siteVectorKm, wrapAz } from './geometry';

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('geometry', () => {
  it('normalizeLon wraps into (-180, 180]', () => {
    expect(normalizeLon(200)).toBeCloseTo(-160, 12);
    expect(normalizeLon(-160)).toBeCloseTo(-160, 12);
    expect(normalizeLon(180)).toBe(180);
    expect(normalizeLon(-180)).toBe(180);
    expect(normalizeLon(360)).toBeCloseTo(0, 12);
  });
  it('wrapAz never returns 360', () => {
    expect(wrapAz(-3e-15)).toBe(0);
    expect(wrapAz(-90)).toBe(270);
    expect(wrapAz(450)).toBe(90);
  });
  it('enuBasis is orthonormal and right-handed', () => {
    const { east, north, up } = enuBasis(-85, 30);
    for (const v of [east, north, up]) expect(Math.hypot(...v)).toBeCloseTo(1, 12);
    expect(Math.abs(dot(east, north))).toBeLessThan(1e-12);
    expect(Math.abs(dot(east, up))).toBeLessThan(1e-12);
    const cross = [east[1] * north[2] - east[2] * north[1], east[2] * north[0] - east[0] * north[2], east[0] * north[1] - east[1] * north[0]];
    expect(cross[0]).toBeCloseTo(up[0], 12);
    expect(cross[1]).toBeCloseTo(up[1], 12);
    expect(cross[2]).toBeCloseTo(up[2], 12);
  });
  it('gives cardinal azimuths and zenith', () => {
    const lat = -85, lon = 30;
    const p = siteVectorKm(lat, lon);
    const { east, north, up } = enuBasis(lat, lon);
    const at = (v: number[]) => azElFromBodyVector([p[0] + 1e6 * v[0], p[1] + 1e6 * v[1], p[2] + 1e6 * v[2]], lat, lon);
    expect(at(up).el).toBeCloseTo(90, 6);
    expect(at(east).az).toBeCloseTo(90, 6);
    expect(at(east).el).toBeCloseTo(0, 6);
    expect(at(north).az).toBeCloseTo(0, 6);
    expect(at([-north[0], -north[1], -north[2]]).az).toBeCloseTo(180, 6);
  });
  it('applies Earth parallax at the limb', () => {
    const { az, el } = azElFromBodyVector([384_400, 0, 0], 0, 90);
    expect(el).toBeCloseTo(-(Math.atan2(R_MOON_M / 1000, 384_400) * 180) / Math.PI, 9);
    expect(az).toBeCloseTo(270, 6);
  });
  it('projects 87.5S to 75,820.4 m from the pole', () => {
    const a = psSouthXY(-87.5, 0);
    expect(Math.abs(a.x)).toBeLessThan(1e-6);
    expect(a.y).toBeCloseTo(2 * R_MOON_M * Math.tan((1.25 * Math.PI) / 180), 3);
    expect(a.y).toBeCloseTo(75_820.4, 0);
    const b = psSouthXY(-87.5, 90);
    expect(b.x).toBeCloseTo(75_820.4, 0);
    expect(Math.abs(b.y)).toBeLessThan(1e-6);
  });
  it('round-trips the projection', () => {
    for (let i = 0; i < 200; i++) {
      const lat = -90 + 30 * ((i * 37) % 101) / 100;
      const lon = -180 + 360 * ((i * 53) % 97) / 97;
      const { x, y } = psSouthXY(lat, lon);
      const back = psSouthLatLon(x, y);
      expect(back.lat).toBeCloseTo(lat, 9);
      if (lat === -90) continue; // longitude is undefined at the pole (rho = 0)
      const dlon = ((back.lon - lon + 540) % 360) - 180;
      expect(Math.abs(dlon)).toBeLessThan(1e-7);
    }
  });
});
