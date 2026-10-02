import { describe, expect, it } from 'vitest';
import { readJson } from './__tests__/helpers';
import { cast, percentile, shade, sunBearingDeg, sweep, type Level } from './shadow';

const BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315, 12.5, 298];
const flat = (h = 64, w = 80, px = 20): Level => ({ heights: new Float64Array(h * w), width: w, height: h, pxM: px, siteCol: (w - 1) / 2, siteRow: (h - 1) / 2 });

describe('sweep', () => {
  it('lights flat ground when the Sun is up and darkens it when the Sun is down', () => {
    for (const b of BEARINGS) {
      expect(sweep(flat(), b, 3).lit.every((v) => v === 1)).toBe(true);
      const dark = sweep(flat(), b, -3).lit;
      expect(dark.reduce((a, v) => a + v, 0) / dark.length).toBeLessThan(0.06);
    }
  });

  it('decides every pixel exactly once for any bearing', () => {
    for (const b of [...BEARINGS, 26.565051177077994]) {
      const { mBefore } = sweep(flat(37, 53), b, 2, () => 0);
      expect(Array.from(mBefore).every((m) => Number.isFinite(m))).toBe(true);
    }
  });

  it("casts a wall's shadow as long as its height over the tangent of the elevation", () => {
    const w = 61;
    const h = 61;
    const px = 10;
    const height = 20;
    const el = 5;
    const heights = new Float64Array(w * h);
    for (let r = 0; r < h; r++) heights[r * w + 30] = height; // a wall down the middle column
    const level: Level = { heights, width: w, height: h, pxM: px, siteCol: 30, siteRow: 30 };
    const { lit } = sweep(level, 90, el); // the Sun towards the right of the map: the shadow falls to the left
    const expected = Math.floor(height / Math.tan((el * Math.PI) / 180) / px);
    let n = 0;
    for (let c = 29; c >= 0 && lit[30 * w + c] === 0; c--) n++;
    expect(n).toBe(expected);
    expect(lit[30 * w + 31]).toBe(1); // the sunward side is lit
  });

  it('walks the grid in memory order yet keeps every line in order from the Sun: the same result as a plain walk along the lines', () => {
    // A rough random grid, a seed that varies with position, and bearings all round including the axes and diagonals.
    let state = 7;
    const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    const w = 47;
    const h = 31;
    const heights = Float64Array.from({ length: w * h }, () => rnd() * 300);
    const level: Level = { heights, width: w, height: h, pxM: 20, siteCol: 20.3, siteRow: 14.6 };
    const seed = (x: number, y: number) => (x - y) * 0.01;
    for (let b = 0; b < 360; b += 7.5) {
      for (const el of [0.5, 3]) {
        const got = sweep(level, b, el, seed);
        const want = plainSweep(level, b, el, seed);
        expect(Array.from(got.mBefore), `bearing ${b}`).toEqual(Array.from(want.mBefore));
        expect(Array.from(got.lit), `bearing ${b}`).toEqual(Array.from(want.lit));
      }
    }
  });

  it('lets a missing height neither light nor darken the rest of its line', () => {
    const level = flat(20, 20);
    (level.heights as Float64Array)[10 * 20 + 10] = NaN;
    const { lit } = sweep(level, 90, 2);
    expect(Array.from(lit).every((v) => v === 1)).toBe(true);
  });
});

describe('percentile', () => {
  it("is numpy's linear percentile, without sorting the values", () => {
    let state = 3;
    const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const n of [1, 2, 3, 10, 101, 1000]) {
      const values = Float64Array.from({ length: n }, () => Math.round(rnd() * 50) / 10);
      const sorted = Float64Array.from(values).sort();
      for (const q of [0, 8, 50, 92, 100]) {
        const at = (q / 100) * (n - 1);
        const lo = Math.floor(at);
        const hi = Math.ceil(at);
        const want = sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
        expect(percentile(Float64Array.from(values), n, q), `n ${n}, q ${q}`).toBeCloseTo(want, 12);
      }
    }
  });

  it('reads only the first count values', () => {
    expect(percentile(Float64Array.from([5, 1, 3, 99, 99]), 3, 50)).toBe(3);
  });
});

describe('sunBearingDeg', () => {
  it('adds the longitude on the south polar grid, within 0 to 360', () => {
    expect(sunBearingDeg(-64.31, 30)).toBeCloseTo(325.69, 9);
    expect(sunBearingDeg(120, 300)).toBeCloseTo(60, 9);
    expect(sunBearingDeg(-10, 5)).toBeCloseTo(355, 9);
  });
});

describe('cast and shade match the pipeline', () => {
  type Fixture = {
    levels: { heights: number[]; width: number; height: number; px_m: number; site_col: number; site_row: number }[];
    cases: { bearing_deg: number; el_deg: number; lit: number[]; margin: (number | null)[]; shade: number[] }[];
  };
  for (const name of ['ridge', 'chain']) {
    it(`on the ${name} fixture`, () => {
      const doc = readJson<Fixture>('data', 'fixtures', 'shadow', `${name}.json`);
      const levels: Level[] = doc.levels.map((l) => ({ heights: Float64Array.from(l.heights), width: l.width, height: l.height, pxM: l.px_m, siteCol: l.site_col, siteRow: l.site_row }));
      for (const c of doc.cases) {
        const { lit, margin } = cast(levels, c.bearing_deg, c.el_deg);
        expect(Array.from(lit)).toEqual(c.lit);
        c.margin.forEach((m, i) => {
          if (m === null) expect(Number.isFinite(margin[i])).toBe(false);
          else expect(Math.abs(margin[i] - m)).toBeLessThanOrEqual(0.001);
        });
        const picture = shade(levels[levels.length - 1], margin, c.bearing_deg, c.el_deg);
        c.shade.forEach((v, i) => expect(Math.abs(picture[i] - v)).toBeLessThanOrEqual(1));
      }
    });
  }
});

/** The sweep as first written: lines walked in their own order, column by column for an east-west Sun. */
function plainSweep(level: Level, bearingDeg: number, elDeg: number, seed: (x: number, y: number) => number): { lit: Uint8Array; mBefore: Float64Array } {
  const { width: w, height: h, pxM, siteCol, siteRow, heights } = level;
  const D = Math.PI / 180;
  const sx = Math.sin(bearingDeg * D);
  const sy = Math.cos(bearingDeg * D);
  const t = Math.tan(elDeg * D);
  const g = new Float64Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const x = (c - siteCol) * pxM;
      const y = (siteRow - r) * pxM;
      g[r * w + c] = heights[r * w + c] - (x * x + y * y) / (2 * 1737400) - (x * sx + y * sy) * t;
    }
  }
  const mBefore = new Float64Array(w * h).fill(-Infinity);
  const ux = Math.sin(bearingDeg * D);
  const uy = -Math.cos(bearingDeg * D);
  const visit = (r: number, c: number, line: number, m: Float64Array, entered: Uint8Array) => {
    if (!entered[line]) m[line] = seed((c - siteCol) * pxM, (siteRow - r) * pxM);
    entered[line] = 1;
    const i = r * w + c;
    mBefore[i] = m[line];
    if (g[i] > m[line]) m[line] = g[i];
  };
  if (Math.abs(ux) >= Math.abs(uy)) {
    const slope = uy / ux;
    const start = ux > 0 ? w - 1 : 0;
    const span = Math.ceil(Math.abs(slope) * (w - 1)) + 1;
    const m = new Float64Array(h + 2 * span).fill(-Infinity);
    const entered = new Uint8Array(h + 2 * span);
    for (let k = 0; k < w; k++) {
      const c = ux > 0 ? w - 1 - k : k;
      const lo = span - Math.floor(slope * (c - start) + 0.5);
      for (let r = 0; r < h; r++) visit(r, c, lo + r, m, entered);
    }
  } else {
    const slope = ux / uy;
    const start = uy > 0 ? h - 1 : 0;
    const span = Math.ceil(Math.abs(slope) * (h - 1)) + 1;
    const m = new Float64Array(w + 2 * span).fill(-Infinity);
    const entered = new Uint8Array(w + 2 * span);
    for (let k = 0; k < h; k++) {
      const r = uy > 0 ? h - 1 - k : k;
      const lo = span - Math.floor(slope * (r - start) + 0.5);
      for (let c = 0; c < w; c++) visit(r, c, lo + c, m, entered);
    }
  }
  const lit = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) lit[i] = mBefore[i] - g[i] <= 0 ? 1 : 0;
  return { lit, mBefore };
}
