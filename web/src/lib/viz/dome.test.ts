import { describe, expect, it } from 'vitest';
import { domeProject, domeRadius, groundPath, skylinePath, trackPath } from './dome';

describe('dome projection', () => {
  it('magnifies the horizon band: zenith centre, +10 deg at half radius, horizon at 75 %, -10 deg at the rim', () => {
    expect(domeRadius(90, 100)).toBeCloseTo(0, 9);
    expect(domeRadius(50, 100)).toBeCloseTo(25, 9);
    expect(domeRadius(10, 100)).toBeCloseTo(50, 9);
    expect(domeRadius(0, 100)).toBeCloseTo(75, 9);
    expect(domeRadius(-10, 100)).toBeCloseTo(100, 9);
    expect(domeRadius(-30, 100)).toBeCloseTo(100, 9);
  });
  it('maps azimuth clockwise from north (up) to east (right)', () => {
    expect(domeProject(0, 0, 100)).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(-75, 9) });
    expect(domeProject(90, 0, 100)).toEqual({ x: expect.closeTo(75, 9), y: expect.closeTo(0, 9) });
    expect(domeProject(180, 50, 100)).toEqual({ x: expect.closeTo(0, 9), y: expect.closeTo(25, 9) });
  });
  it('builds closed skyline and ground paths', () => {
    const mask = new Float64Array(720).fill(2);
    const sky = skylinePath(mask, 100);
    expect(sky.startsWith('M')).toBe(true);
    expect(sky.endsWith('Z')).toBe(true);
    expect(sky.split('L').length).toBe(720);
    expect(groundPath(mask, 100).split('Z').length).toBe(3);
  });
  it('breaks a track at NaN samples', () => {
    const az = Float64Array.from([0, 10, NaN, 30, 40]);
    const el = Float64Array.from([1, 2, 3, 4, 5]);
    const d = trackPath(az, el, 100, 0, 5);
    expect(d.split('M').length - 1).toBe(2);
  });
});
