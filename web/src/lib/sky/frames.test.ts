import { describe, expect, it } from 'vitest';
import { azElOf, dirAzEl, enuBasis, meToWorld } from './frames';

describe('frames', () => {
  it('puts azimuth clockwise from north and elevation up, with north along -z', () => {
    const n = dirAzEl(0, 0), e = dirAzEl(90, 0), up = dirAzEl(0, 90);
    expect(n[2]).toBeCloseTo(-1, 9);
    expect(e[0]).toBeCloseTo(1, 9);
    expect(up[1]).toBeCloseTo(1, 9);
    expect(azElOf(dirAzEl(327.4, 2.46)).az).toBeCloseTo(327.4, 6);
    expect(azElOf(dirAzEl(327.4, 2.46)).el).toBeCloseTo(2.46, 6);
  });

  it('builds the site basis in the Moon-fixed frame: up is the site direction, east is horizontal', () => {
    const b = enuBasis(-88.28, -64.31);
    const la = (-88.28 * Math.PI) / 180, lo = (-64.31 * Math.PI) / 180;
    expect(b.up[0]).toBeCloseTo(Math.cos(la) * Math.cos(lo), 12);
    expect(b.east[2]).toBe(0);
    expect(meToWorld(b, b.up)[1]).toBeCloseTo(1, 12);
    // North at a south polar site points towards the pole's side of the sky: towards +z in MOON_ME.
    expect(b.north[2]).toBeGreaterThan(0);
    expect(azElOf(meToWorld(b, b.north)).az).toBeCloseTo(0, 9);
    expect(azElOf(meToWorld(b, b.east)).az).toBeCloseTo(90, 9);
  });
});
