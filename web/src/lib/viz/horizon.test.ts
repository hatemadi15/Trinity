import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { horizonGeometry } from './horizon';

function series(sunAz: number[], sunEl: number[], visible: number[]): Series {
  const n = sunAz.length;
  return {
    i0: 0,
    hours: n,
    sunAz: Float64Array.from(sunAz),
    sunEl: Float64Array.from(sunEl),
    earthAz: new Float64Array(n).fill(10),
    earthEl: new Float64Array(n).fill(3),
    sunFraction: Float64Array.from(visible),
    earthVisible: new Uint8Array(n).fill(1),
    sunAu: new Float64Array(n).fill(1),
  };
}

const flatMask = new Float64Array(720);

describe('horizonGeometry', () => {
  it('lays the whole horizon out from north on the left through east, south and west back to north', () => {
    const g = horizonGeometry(flatMask, series([90, 91], [2, 2], [1, 1]), 720, 200);
    expect(g.x(0)).toBe(0);
    expect(g.x(90)).toBe(180);
    expect(g.x(360)).toBe(720);
    // The skyline is drawn at every half degree, the first point repeated at the right edge.
    expect(g.skyline.match(/L/g)!.length).toBeGreaterThanOrEqual(721);
  });

  it('fits the skyline and both paths with a degree to spare', () => {
    const mask = Float64Array.from({ length: 720 }, (_, i) => (i === 100 ? 6 : 0));
    const g = horizonGeometry(mask, series([90, 91], [-2, 2], [0, 1]), 720, 200);
    expect(g.y(7)).toBeCloseTo(0, 6);
    expect(g.y(-3)).toBeCloseTo(200, 6);
    expect([g.minDeg, g.maxDeg]).toEqual([-3, 7]);
  });

  it('keeps the picture to 10° below the horizon, so a night far below it does not squash the sky', () => {
    const g = horizonGeometry(flatMask, series([90, 180, 270], [-60, 30, -60], [0, 1, 0]), 720, 200);
    expect(g.y(31)).toBeCloseTo(0, 6);
    expect(g.y(-11)).toBeCloseTo(200, 6);
  });

  it('splits a path where it crosses north, so it is never drawn across the picture', () => {
    const g = horizonGeometry(flatMask, series([350, 356, 2, 8], [2, 2, 2, 2], [1, 1, 1, 1]), 720, 200);
    expect(g.sun).toHaveLength(2);
    expect(g.sun.every((r) => r.visible)).toBe(true);
  });

  it('splits a path where the body hides and shows again', () => {
    const g = horizonGeometry(flatMask, series([90, 91, 92, 93], [2, 2, 2, 2], [1, 0, 0, 1]), 720, 200);
    expect(g.sun.map((r) => r.visible)).toEqual([true, false, true]);
  });
});
