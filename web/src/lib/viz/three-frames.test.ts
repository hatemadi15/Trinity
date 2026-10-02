import { describe, expect, it } from 'vitest';
import { dirFromAzEl, latitudeRing, latLonToSphere, localToThree, moonToThree, sphereToLatLon, sunLight } from './three-frames';

describe('three frames', () => {
  it('moonToThree is a right-handed rotation with the lunar north pole up', () => {
    expect(moonToThree([0, 0, 1])).toEqual([0, 1, -0]);
    expect(moonToThree([1, 0, 0])).toEqual([1, 0, -0]);
    const [ax, ay, az] = moonToThree([1, 0, 0]);
    const [bx, by, bz] = moonToThree([0, 1, 0]);
    const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    const [nx, ny, nz] = moonToThree([0, 0, 1]);
    expect(cross).toEqual([expect.closeTo(nx, 12), expect.closeTo(ny, 12), expect.closeTo(nz, 12)]);
  });
  it('local frame: east +x, up +y, north -z', () => {
    expect(localToThree(1, 0, 0)).toEqual([1, 0, -0]);
    expect(localToThree(0, 1, 0)).toEqual([0, 0, -1]);
    expect(localToThree(0, 0, 1)).toEqual([0, 1, -0]);
    expect(dirFromAzEl(0, 0)).toEqual([expect.closeTo(0, 12), expect.closeTo(0, 12), -1]);
    expect(dirFromAzEl(90, 0)).toEqual([1, expect.closeTo(0, 12), expect.closeTo(-0, 12)]);
    expect(dirFromAzEl(0, 90)).toEqual([expect.closeTo(0, 12), 1, expect.closeTo(-0, 12)]);
  });
  it('sunLight returns intensity 0 below the skyline and ramps above it', () => {
    expect(sunLight(-1, 0.5)).toEqual({ intensity: 0, castShadow: false });
    expect(sunLight(0.75, 0.5).intensity).toBeCloseTo(0.5, 9);
    expect(sunLight(2, 0.5)).toEqual({ intensity: 1, castShadow: true });
  });
  it('globe mapping round-trips and puts the south pole at -y', () => {
    expect(latLonToSphere(-90, 0)).toEqual([expect.closeTo(0, 12), -1, expect.closeTo(0, 12)]);
    expect(latLonToSphere(0, 0)).toEqual([1, expect.closeTo(0, 12), expect.closeTo(-0, 12)]);
    const p = latLonToSphere(-85.5, 123.4);
    const back = sphereToLatLon(p);
    expect(back.lat).toBeCloseTo(-85.5, 9);
    expect(back.lon).toBeCloseTo(123.4, 9);
  });
});

describe('latitudeRing', () => {
  it('runs once round the globe at one latitude and closes on itself', () => {
    const ring = latitudeRing(-60, 1.004, 90);
    expect(ring).toHaveLength(91);
    for (const p of ring) {
      expect(sphereToLatLon(p).lat).toBeCloseTo(-60, 9);
      expect(Math.hypot(...p)).toBeCloseTo(1.004, 9);
    }
    expect(ring[90]).toEqual(ring[0]);
  });
});
