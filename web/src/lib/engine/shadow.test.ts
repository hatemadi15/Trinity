import { describe, expect, it } from 'vitest';
import { readJson } from './__tests__/helpers';
import { cast, shade, sunBearingDeg, sweep, type Level } from './shadow';

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

  it('lets a missing height neither light nor darken the rest of its line', () => {
    const level = flat(20, 20);
    (level.heights as Float64Array)[10 * 20 + 10] = NaN;
    const { lit } = sweep(level, 90, 2);
    expect(Array.from(lit).every((v) => v === 1)).toBe(true);
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
