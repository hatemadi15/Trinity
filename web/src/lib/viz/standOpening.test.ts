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

  it('stands the lander by the hour the view opens on: 40° left of that hour’s Sun (20° on a tall screen), 22° left of Earth at night (10° on a tall screen)', () => {
    // Hour 5: the Sun up at 315°.
    expect(standLander(series, power, false, 5).azDeg).toBe(275);
    expect(standLander(series, power, true, 5).azDeg).toBe(295);
    // Hour 11: night, Earth in view at 70°.
    expect(standLander(series, power, false, 11).azDeg).toBe(48);
    expect(standLander(series, power, true, 11).azDeg).toBe(60);
    // Its panel and dish still face the Sun and Earth of the landing hour.
    const night = standLander(series, power, false, 11);
    expect(night.faceAzDeg).toBe(245);
    expect([night.earthAzDeg, night.earthElDeg]).toEqual([70, 3]);
    // An hour past the period's end stands it by the last hour.
    expect(standLander(series, power, false, 99).azDeg).toBe(48);
  });

  it('keeps the lander in the opening view at every hour, on a wide screen and a tall one', () => {
    // Half the view's width in degrees, for its height in degrees and its shape (the page's: 60° or 80°, 36° or 50° on Earth at night).
    const half = (fov: number, aspect: number) => (Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
    for (let h = 0; h < 12; h++)
      for (const tall of [false, true]) {
        const onEarth = series.sunFraction[h] === 0 && series.earthVisible[h] === 1;
        const fov = onEarth ? (tall ? 50 : 36) : tall ? 80 : 60;
        const rel = Math.abs(((standLander(series, power, tall, h).azDeg - openingYaw(series, h, tall, true) + 540) % 360) - 180);
        // With 5° to spare for the lander's own width.
        expect(rel, `hour ${h}, ${tall ? 'tall' : 'wide'}`).toBeLessThan(half(fov, tall ? 390 / 844 : 16 / 10) - 5);
      }
  });

  it('opens 35° left of the hour’s Sun with a lander (15° on a tall screen), on the Sun without one, and on Earth at night', () => {
    expect(openingYaw(series, 5, false, true)).toBe(280);
    expect(openingYaw(series, 5, true, true)).toBe(300);
    expect(openingYaw(series, 5, false, false)).toBe(315);
    expect(openingYaw(series, 11, false, true)).toBe(66);
    expect(openingAnchor(series, 11)).toBe(70);
  });
});
