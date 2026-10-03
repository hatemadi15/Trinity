import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { earthAxes, earthLitFraction, greenwichAngleDeg } from './earth';
import { enuBasis, meToWorld, type Vec3 } from './frames';

describe('Earth', () => {
  it('is new when it stands in front of the Sun and full when opposite it', () => {
    expect(earthLitFraction([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 9);
    expect(earthLitFraction([1, 0, 0], [-1, 0, 0])).toBeCloseTo(1, 9);
    expect(earthLitFraction([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.5, 9);
  });

  it('turns like SPICE’s IAU_EARTH frame, to 0.05°', () => {
    const { cases } = readJson<{ cases: { utc: string; matrix: number[] }[] }>('data', 'fixtures', 'sky', 'earth_rotation.json');
    expect(cases.length).toBe(20);
    for (const c of cases) {
      // The IAU_EARTH x axis (Greenwich) in J2000 is the matrix's first column.
      const spice = (Math.atan2(c.matrix[3], c.matrix[0]) * 180) / Math.PI;
      const ours = greenwichAngleDeg(Date.parse(c.utc + 'Z'));
      expect(Math.abs(((ours - spice + 540) % 360) - 180), c.utc).toBeLessThan(0.05);
    }
  });

  it('gives the sphere a right-handed set of axes, its pole along the J2000 pole', () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const b = enuBasis(-88.28, -64.31);
    const ax = earthAxes(identity, b, Date.parse('2027-01-01T10:00:00Z'));
    const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    expect(dot(ax.x, ax.y)).toBeCloseTo(0, 12);
    expect(dot(ax.y, ax.z)).toBeCloseTo(0, 12);
    const c = cross(ax.x, ax.y);
    for (let i = 0; i < 3; i++) expect(c[i]).toBeCloseTo(ax.z[i], 12);
    const pole = meToWorld(b, [0, 0, 1]);
    for (let i = 0; i < 3; i++) expect(ax.y[i]).toBeCloseTo(pole[i], 12);
  });
});
