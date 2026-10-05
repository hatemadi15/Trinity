import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { LANDER_DIST_M, openingAnchor, openingYaw, standLander } from './standOpening';

/** Twelve hours: the Sun up at 320° for ten of them, then night with Earth in view at 70°. */
const series = {
  i0: 0,
  hours: 12,
  sunAz: Float64Array.from({ length: 12 }, (_, h) => 320 - h),
  sunEl: Float64Array.from({ length: 12 }, (_, h) => (h < 10 ? 2 : -1)),
  earthAz: new Float64Array(12).fill(70),
  earthEl: new Float64Array(12).fill(3),
  sunFraction: Float64Array.from({ length: 12 }, (_, h) => (h < 10 ? 1 : 0)),
  earthVisible: new Uint8Array(12).fill(1),
  sunAu: new Float64Array(12).fill(1),
} as Series;
const power = { powered: new Uint8Array(12).fill(1) } as unknown as PowerResult;

describe('where the lander stands and where the view opens', () => {
  it('stands the lander 16 m away, 40° left of the first hour’s Sun (20° on a tall screen), its face 75° left of it', () => {
    const wide = standLander(series, power, false), tall = standLander(series, power, true);
    expect(wide.distM).toBe(LANDER_DIST_M);
    expect(wide.azDeg).toBe(280);
    expect(tall.azDeg).toBe(300);
    expect(wide.faceAzDeg).toBe(245);
    expect([wide.earthAzDeg, wide.earthElDeg]).toEqual([70, 3]);
    expect(wide.powered).toBe(power.powered);
  });

  it('opens 35° left of the hour’s Sun with a lander (15° on a tall screen), on the Sun without one, and on Earth at night', () => {
    expect(openingYaw(series, 5, false, true)).toBe(280);
    expect(openingYaw(series, 5, true, true)).toBe(300);
    expect(openingYaw(series, 5, false, false)).toBe(315);
    expect(openingYaw(series, 11, false, true)).toBe(66);
    expect(openingAnchor(series, 11)).toBe(70);
  });
});
