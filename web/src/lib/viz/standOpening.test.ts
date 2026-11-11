import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import catalogue from '../data/catalogue.json';
import { placeBoulders, siteSeed } from '../sky/boulders';
import { hero } from './arrival';
import { hillShift, LANDER_DIST_M, openingAnchor, openingYaw, standLander, standResident } from './standOpening';

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

describe('where the resident stands (spec 20.2)', () => {
  const h = hero(), skyline = { az0: 0, step: 360 / h.mask.length, el: h.mask };
  const seedOf = (site: { lat: number; lon: number }) => siteSeed(site.lat, site.lon);
  /** Where the lander stands on the ground, as the scene places it: x east, z south. */
  const feetOf = (lander: { azDeg: number; distM: number }) => ({ x: lander.distM * Math.sin((lander.azDeg * Math.PI) / 180), z: -lander.distM * Math.cos((lander.azDeg * Math.PI) / 180) });
  /** The angle from one azimuth to another, degrees, from -180 to 180. */
  const turn = (fromDeg: number, toDeg: number) => ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
  /** How far a rock's middle lies from the line between the eye and a spot on the ground. */
  const offSight = (b: { x: number; z: number }, p: { x: number; z: number }) => {
    const t = Math.max(0, Math.min(1, (b.x * p.x + b.z * p.z) / (p.x * p.x + p.z * p.z)));
    return Math.hypot(b.x - t * p.x, b.z - t * p.z);
  };

  it('keeps the resident out of the opening view at every hour, on a wide and a tall screen', () => {
    // The hero month, its lander and rocks placed as the scene places them for each hour the view may open on, and the
    // view turned towards its hills as the page turns it, half as wide as a tall phone's (21°) up to a 32:9 screen's (64°).
    const seed = seedOf(h.site);
    let worst = { margin: Infinity, where: '' };
    for (let hour = 0; hour < h.series.hours; hour++)
      for (const tall of [false, true]) {
        const lander = standLander(h.series, h.power, tall, hour);
        const resident = standResident(lander, placeBoulders(seed, feetOf(lander)), seed);
        for (const halfW of [21, 32, 43, 54, 64]) {
          const margin = Math.abs(turn(openingYaw(h.series, hour, tall, true, skyline, halfW), resident.azDeg)) - halfW;
          if (margin < worst.margin) worst = { margin, where: `hour ${hour}, ${tall ? 'tall' : 'wide'}, half-width ${halfW}°` };
        }
      }
    // At least 10° outside the frame's edge, for its own width and the hill turn's last degree.
    expect(worst.margin, worst.where).toBeGreaterThanOrEqual(10);
  });

  it('places the resident 8 to 10 m out, clear of every rock and with none between it and the eye', () => {
    // Every site of the catalogue, its lander anywhere round: behind you from the lander, up to 25° round towards the
    // Sun's side of straight behind (away from your own shadow), and the same each time for a site.
    for (const site of catalogue.sites)
      for (const azDeg of [0, 75, 150, 225, 300]) {
        const seed = seedOf(site), lander = { azDeg, distM: 16 };
        const rocks = placeBoulders(seed, feetOf(lander));
        const r = standResident(lander, rocks, seed), where = `${site.id}, lander at ${azDeg}°`;
        expect(r.distM, where).toBeGreaterThanOrEqual(8);
        expect(r.distM, where).toBeLessThanOrEqual(10);
        expect(r.x, where).toBeCloseTo(r.distM * Math.sin((r.azDeg * Math.PI) / 180), 9);
        expect(r.z, where).toBeCloseTo(-r.distM * Math.cos((r.azDeg * Math.PI) / 180), 9);
        const round = turn(azDeg + 180, r.azDeg);
        expect(round, where).toBeGreaterThanOrEqual(-25 - 1e-9);
        expect(round, where).toBeLessThanOrEqual(1e-9);
        for (const b of rocks) {
          expect(Math.hypot(b.x - r.x, b.z - r.z), where).toBeGreaterThanOrEqual(b.r + 0.85);
          expect(offSight(b, r), where).toBeGreaterThanOrEqual(b.r + 0.3);
        }
        expect(standResident(lander, rocks, seed)).toEqual(r);
      }
  });

  it('steps 5° at a time from where the seed puts it, on towards 25° round first, then back the other way, and stands where the band is clearest when nothing is clear', () => {
    const lander = { azDeg: 100 };
    // A seed whose spot lies 10° to 15° round, so the band has room both ways: two steps on, two back.
    const seed = Array.from({ length: 400 }, (_, k) => k).find((k) => {
      const t = turn(280, standResident(lander, [], k).azDeg);
      return t < -10 && t > -15;
    })!;
    const free = standResident(lander, [], seed);
    // A small rock 6.5 m out on the way to the spot `k` steps round from the seed's own (+ on towards 25°, - back).
    const onSight = (k: number, off = 0) => {
      const a = ((free.azDeg - 5 * k) * Math.PI) / 180;
      return { x: 6.5 * Math.sin(a) + off * Math.cos(a), z: -6.5 * Math.cos(a) + off * Math.sin(a), r: 0.15 };
    };
    expect(standResident(lander, [onSight(0)], seed).azDeg).toBeCloseTo(free.azDeg - 5, 9);
    // On towards 25° round blocked to the band's end: back the other way, past the seed's own.
    expect(standResident(lander, [onSight(0), onSight(1), onSight(2)], seed).azDeg).toBeCloseTo(free.azDeg + 5, 9);
    // A rock beside the spot itself, 0.4 m off it, is in the way as one in the line of sight is.
    const a = (free.azDeg * Math.PI) / 180;
    expect(standResident(lander, [{ x: free.x + 0.4 * Math.cos(a), z: free.z + 0.4 * Math.sin(a), r: 0.15 }], seed).azDeg).toBeCloseTo(free.azDeg - 5, 9);
    // Every spot blocked: the one whose rock lies farthest off its line of sight, still in the band.
    const all = [onSight(2), onSight(1), onSight(0), onSight(-1), onSight(-2, 0.3)];
    expect(standResident(lander, all, seed).azDeg).toBeCloseTo(free.azDeg + 10, 9);
    expect(standResident(lander, all, seed).distM).toBe(free.distM);
  });
});
