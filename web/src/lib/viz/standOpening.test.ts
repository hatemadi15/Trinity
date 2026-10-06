import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { hillShift, LANDER_DIST_M, openingAnchor, openingYaw, standLander } from './standOpening';

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
    // Half the view's width in degrees, for its height in degrees and its shape (the page's: 60° or 80°, 44° or 56° on Earth at night).
    const half = (fov: number, aspect: number) => (Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
    for (let h = 0; h < 12; h++)
      for (const tall of [false, true]) {
        const onEarth = series.sunFraction[h] === 0 && series.earthVisible[h] === 1;
        const fov = onEarth ? (tall ? 56 : 44) : tall ? 80 : 60;
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

describe('a hill in the opening frame (spec 18.4)', () => {
  // A mask of 360 one-degree steps: a level skyline, but for a hill 8° high at one azimuth.
  const maskWith = (hillAz: number, el = 8) => ({ az0: 0, step: 1, el: Array.from({ length: 360 }, (_, a) => (a === ((hillAz % 360) + 360) % 360 ? el : 0)) });
  /** Half the view's width in degrees, as the test above works it out. */
  const half = (fov: number, aspect: number) => (Math.atan(Math.tan((fov * Math.PI) / 360) * aspect) * 180) / Math.PI;

  it('turns towards the skyline’s highest point within the range, as little as brings it 6° inside the frame', () => {
    // Facing 100° with a frame 44° wide each way: a hill at 40° needs the frame's left edge, 6° in, at 40°: a turn of −22°.
    expect(hillShift(maskWith(40), 100, 44, [-30, 30])).toBe(-22);
    // The same hill to the right: +22°.
    expect(hillShift(maskWith(160), 100, 44, [-30, 30])).toBe(22);
  });

  it('does not turn when the highest point is already in frame, nor past the range, nor on a level skyline', () => {
    expect(hillShift(maskWith(80), 100, 44, [-30, 30])).toBe(0);
    // A hill at 20° would need −42°: out of range, so nothing in range beats the level skyline: no turn.
    expect(hillShift(maskWith(20), 100, 44, [-30, 30])).toBe(0);
    expect(hillShift({ az0: 0, step: 1, el: new Array(360).fill(0) }, 100, 44, [-30, 30])).toBe(0);
    expect(hillShift({ az0: 0, step: 1, el: [] }, 100, 44, [-30, 30])).toBe(0);
  });

  it('turns the opening towards a hill, the Sun and the lander kept 6° inside the frame: on a wide screen right up to 30°, left only 3°', () => {
    // Hour 0: the Sun at 320°, the view opens 35° left of it at 285°, the lander 5° left of the middle. With a frame 44° each
    // way (38° in reach) a turn to the right moves both to the left in the frame: the view may turn 30° right before the
    // lander meets the left edge, and only 3° left before the Sun meets the right edge.
    expect(openingYaw(series, 0, false, true)).toBe(285);
    // A hill 45° right of the middle, 10° right of the Sun: in frame once the view has turned 7° right.
    expect(openingYaw(series, 0, false, true, maskWith(330), 44)).toBeCloseTo(292, 9);
    // A hill 68° right: 30° right brings it 6° inside the edge, as far as the view turns.
    expect(openingYaw(series, 0, false, true, maskWith(353), 44)).toBeCloseTo(315, 9);
    // A hill 75° right of the middle: it would take 37°, more than the lander allows, so the view stays.
    expect(openingYaw(series, 0, false, true, maskWith(0), 44)).toBeCloseTo(285, 9);
    // A hill 45° left of the middle: it would take 7° left, more than the Sun allows, so the view stays.
    expect(openingYaw(series, 0, false, true, maskWith(240), 44)).toBeCloseTo(285, 9);
  });

  it('keeps the lander and the Sun inside the frame at every hour, by day and by night, on a wide screen and a tall one, however far the hill', () => {
    for (let h = 0; h < 12; h++)
      for (const tall of [false, true])
        for (const hillAt of [-80, -40, 40, 80]) {
          const onEarth = series.sunFraction[h] === 0 && series.earthVisible[h] === 1;
          const fov = onEarth ? (tall ? 56 : 44) : tall ? 80 : 60;
          const halfW = half(fov, tall ? 390 / 844 : 16 / 10);
          const base = openingYaw(series, h, tall, true);
          const yaw = openingYaw(series, h, tall, true, maskWith(base + hillAt), halfW);
          const rel = (az: number) => Math.abs(((az - yaw + 540) % 360) - 180);
          expect(rel(standLander(series, power, tall, h).azDeg), `lander, hour ${h}, ${tall ? 'tall' : 'wide'}, hill ${hillAt}`).toBeLessThanOrEqual(halfW - 6 + 1e-9);
          if (!onEarth) expect(rel(series.sunAz[h]), `Sun, hour ${h}, ${tall ? 'tall' : 'wide'}, hill ${hillAt}`).toBeLessThanOrEqual(halfW - 6 + 1e-9);
          expect(Math.abs(((yaw - base + 540) % 360) - 180)).toBeLessThanOrEqual(30 + 1e-9);
        }
  });

  it('turns nothing without a mask, without a half-width, or when the view opens on Earth at night, whose hill is in frame already', () => {
    expect(openingYaw(series, 0, false, true, undefined, 44)).toBe(285);
    expect(openingYaw(series, 0, false, true, maskWith(240))).toBe(285);
    expect(openingYaw(series, 11, false, true, maskWith(30), 22)).toBe(66);
  });
});
