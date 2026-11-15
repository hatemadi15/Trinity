import { describe, expect, it } from 'vitest';
import { cast, shade, type Level } from './shadow';
import { createShadowHandler, halfLevel, MAX_REFINE, PICTURE_MIN_PX, refineFactor, refineLevel, smoothMargin, withRefinedFinest } from './shadow-handler';

/** A grid with a ridge down one column, the site in the middle. */
function ridge(w: number, h: number, px: number, col: number, height: number): Level {
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) heights[r * w + col] = height;
  return { heights, width: w, height: h, pxM: px, siteCol: (w - 1) / 2, siteRow: (h - 1) / 2 };
}

describe('the shadow handler', () => {
  const coarse = ridge(16, 12, 80, 2, 0);
  const fine = ridge(40, 30, 20, 22, 30);

  it('draws the finest level of the levels it holds as they are, full size or halved', () => {
    const handle = createShadowHandler();
    expect(handle({ id: 1, type: 'levels', key: 'a', levels: [coarse, fine], minPx: 0 })).toEqual({ id: 1, type: 'ok' });
    const full = handle({ id: 2, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: false });
    expect(full).toMatchObject({ id: 2, type: 'picture', key: 'a', width: 40, height: 30 });
    const half = handle({ id: 3, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: true });
    expect(half).toMatchObject({ id: 3, type: 'picture', width: 20, height: 15 });
    if (full.type === 'picture') expect(full.pixels).toHaveLength(40 * 30);
  });

  it('draws a coarse finest level refined to the picture size asked for, and halves the refined level while the time moves', () => {
    const handle = createShadowHandler();
    handle({ id: 1, type: 'levels', key: 'a', levels: [coarse, fine], minPx: 80 });
    expect(handle({ id: 2, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: false })).toMatchObject({ type: 'picture', width: 80, height: 60 });
    expect(handle({ id: 3, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: true })).toMatchObject({ type: 'picture', width: 40, height: 30 });
  });

  it('refines every site to a picture at least 1024 pixels across by default: a 240 m window four times', () => {
    const handle = createShadowHandler();
    handle({ id: 1, type: 'levels', key: 'a', levels: [ridge(256, 256, 240, 100, 200)] });
    const full = handle({ id: 2, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 3, half: false });
    expect(full).toMatchObject({ type: 'picture', width: PICTURE_MIN_PX, height: PICTURE_MIN_PX });
    expect(handle({ id: 3, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 3, half: true })).toMatchObject({ type: 'picture', width: 512, height: 512 });
  });

  it('says whether the site itself is lit, as the sweep finds at its pixel of the level it draws', () => {
    const handle = createShadowHandler();
    handle({ id: 1, type: 'levels', key: 'a', levels: [coarse, fine], minPx: 80 });
    const drawn = withRefinedFinest([coarse, fine], 80);
    const finest = drawn[drawn.length - 1];
    for (const [bearing, el] of [
      [90, 2],
      [270, 0.5],
      [90, 0.5],
    ]) {
      const res = handle({ id: 2, type: 'shade', key: 'a', bearingDeg: bearing, elDeg: el, half: false });
      const { lit } = cast(drawn, bearing, el);
      const site = Math.round(finest.siteRow) * finest.width + Math.round(finest.siteCol);
      expect(res.type === 'picture' && res.siteLit).toBe(lit[site] === 1);
      // The same answer as the window's own cells give.
      const native = cast([coarse, fine], bearing, el).lit;
      expect(lit[site]).toBe(native[Math.round(fine.siteRow) * fine.width + Math.round(fine.siteCol)]);
    }
  });

  it('holds the levels of the last two sites only', () => {
    const handle = createShadowHandler();
    for (const key of ['a', 'b', 'c']) handle({ id: 1, type: 'levels', key, levels: [coarse, fine], minPx: 0 });
    expect(handle({ id: 2, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: false }).type).toBe('error');
    expect(handle({ id: 3, type: 'shade', key: 'b', bearingDeg: 90, elDeg: 2, half: false }).type).toBe('picture');
    expect(handle({ id: 4, type: 'shade', key: 'c', bearingDeg: 90, elDeg: 2, half: false }).type).toBe('picture');
  });

  it('answers a picture for levels it does not hold with an error', () => {
    const res = createShadowHandler()({ id: 9, type: 'shade', key: 'nope', bearingDeg: 0, elDeg: 1, half: false });
    expect(res).toMatchObject({ id: 9, type: 'error' });
  });
});

describe('halfLevel', () => {
  it('averages 2 by 2 cells, doubles the pixel size and keeps the site where it was', () => {
    const level: Level = { heights: Float32Array.from([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]), width: 4, height: 3, pxM: 20, siteCol: 1.5, siteRow: 0.5 };
    const half = halfLevel(level);
    expect(half).toMatchObject({ width: 2, height: 1, pxM: 40, siteCol: 0.5, siteRow: 0 });
    expect(Array.from(half.heights)).toEqual([(0 + 2 + 8 + 10) / 4, (4 + 6 + 12 + 14) / 4]);
  });
});

/** A level whose heights are f(col, row) at the cell centres. */
function sampled(w: number, h: number, pxM: number, f: (c: number, r: number) => number, site = { col: (w - 1) / 2, row: (h - 1) / 2 }): Level {
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) heights[r * w + c] = f(c, r);
  return { heights, width: w, height: h, pxM, siteCol: site.col, siteRow: site.row };
}

/** Where fine cell (j, i) of a level refined k times is centred, in the original's cells. */
const coarseAt = (j: number, k: number) => (j + 0.5) / k - 0.5;

describe('refineFactor', () => {
  it('brings the longer side to 1024 pixels, four times finer at most: a 20 m window as it is, 80 m twice, 240 m four times', () => {
    expect(refineFactor({ width: 1024, height: 1024 })).toBe(1);
    expect(refineFactor({ width: 512, height: 512 })).toBe(2);
    expect(refineFactor({ width: 256, height: 256 })).toBe(4);
    // The cap's 51 cells of 960 m around a clicked point with no window: four times at most, not the 21 that 1024 px would need.
    expect(refineFactor({ width: 51, height: 51 })).toBe(MAX_REFINE);
    expect(MAX_REFINE).toBe(4);
    expect(refineFactor({ width: 40, height: 30 }, 80)).toBe(2);
    expect(refineFactor({ width: 40, height: 30 }, 0)).toBe(1);
  });
});

describe('refineLevel', () => {
  const level = sampled(6, 4, 240, (c, r) => 1000 + 30 * c - 20 * r, { col: 2.3, row: 1.7 });
  const plane = sampled(10, 8, 240, (c, r) => 1000 + 30 * c - 20 * r, { col: 4.3, row: 3.7 });

  it('splits each cell k by k over the same ground, the site where it was', () => {
    const fine = refineLevel(level, 4);
    expect(fine).toMatchObject({ width: 24, height: 16, pxM: 60 });
    expect(fine.width * fine.pxM).toBe(level.width * level.pxM);
    expect(fine.height * fine.pxM).toBe(level.height * level.pxM);
    // The site at the same map position: its fine column, read back in the original's cells.
    expect(coarseAt(fine.siteCol, 4)).toBeCloseTo(level.siteCol, 12);
    expect(coarseAt(fine.siteRow, 4)).toBeCloseTo(level.siteRow, 12);
    expect(refineLevel(level, 1)).toBe(level);
    expect(() => refineLevel(level, 1.5)).toThrow();
  });

  it('passes through the heights at the original cell centres', () => {
    // Uneven ground: with k = 3 every third fine cell is centred on an original cell and keeps its height.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 400;
    const rough = sampled(9, 7, 240, () => rand());
    const fine = refineLevel(rough, 3);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 9; c++) expect(fine.heights[(3 * r + 1) * fine.width + 3 * c + 1]).toBeCloseTo(rough.heights[r * 9 + c], 3);
    // With k = 2 and 4 the original centres fall between fine cells: on an even slope the four around one average to its
    // height (two cells in from the edges, where the surface leans on cells beyond the ground).
    for (const k of [2, 4]) {
      const even = refineLevel(plane, k);
      for (let r = 2; r < plane.height - 2; r++)
        for (let c = 2; c < plane.width - 2; c++) {
          const i = k * r + k / 2 - 1;
          const j = k * c + k / 2 - 1;
          const mean = (even.heights[i * even.width + j] + even.heights[i * even.width + j + 1] + even.heights[(i + 1) * even.width + j] + even.heights[(i + 1) * even.width + j + 1]) / 4;
          expect(mean).toBeCloseTo(plane.heights[r * plane.width + c], 3);
        }
    }
  });

  it('is smooth: curved ground comes back exactly between the cells, never in blocks', () => {
    // Catmull-Rom carries a quadratic surface exactly (away from the edges, on ground that rises the same way throughout).
    const f = (x: number, y: number) => 500 + 40 * x + 25 * y + 3 * x * x + 2 * y * y + x * y;
    const bowl = sampled(12, 10, 240, f);
    const k = 4;
    const fine = refineLevel(bowl, k);
    let checked = 0;
    for (let i = 2 * k; i < fine.height - 2 * k; i++)
      for (let j = 2 * k; j < fine.width - 2 * k; j++) {
        expect(fine.heights[i * fine.width + j]).toBeCloseTo(f(coarseAt(j, k), coarseAt(i, k)), 2);
        checked++;
      }
    expect(checked).toBeGreaterThan(500);
    // No two neighbours inside a cell share a height, as a blocky copy's would.
    for (let j = 2 * k; j < fine.width - 2 * k - 1; j++) expect(fine.heights[5 * k * fine.width + j + 1]).not.toBe(fine.heights[5 * k * fine.width + j]);
  });

  it('never rises above or sinks below the cells either side, so a cliff gets no made-up rim', () => {
    const cliff = sampled(8, 6, 240, (c) => (c < 4 ? 0 : 300));
    const fine = refineLevel(cliff, 4);
    for (let i = 0; i < fine.heights.length; i++) {
      expect(fine.heights[i]).toBeGreaterThanOrEqual(0);
      expect(fine.heights[i]).toBeLessThanOrEqual(300);
    }
    // Flat ground away from the cliff stays flat.
    expect(fine.heights[10 * fine.width + 2]).toBe(0);
    expect(fine.heights[10 * fine.width + 30]).toBe(300);
  });

  it('halved, as while the time moves, a level refined twice has the original cells again', () => {
    const back = halfLevel(refineLevel(plane, 2));
    expect(back).toMatchObject({ width: plane.width, height: plane.height, pxM: plane.pxM });
    expect(back.siteCol).toBeCloseTo(plane.siteCol, 12);
    expect(back.siteRow).toBeCloseTo(plane.siteRow, 12);
    for (let r = 2; r < plane.height - 2; r++) for (let c = 2; c < plane.width - 2; c++) expect(back.heights[r * plane.width + c]).toBeCloseTo(plane.heights[r * plane.width + c], 3);
  });
});

describe('the refined level in the sweep', () => {
  it('nests under the window it refines: the same shadows, with the edge in finer steps', () => {
    // A 200 m wall on 240 m cells with a low Sun from the east: the wall shades the ground west of it.
    const window = ridge(32, 24, 240, 20, 200);
    const cap = ridge(16, 12, 960, 2, 0);
    const levels = withRefinedFinest([cap, window], 128);
    expect(levels).toHaveLength(3);
    const fine = levels[2];
    expect(fine).toMatchObject({ width: 128, height: 96, pxM: 60 });
    const { lit } = cast(levels, 90, 4);
    const native = cast([cap, window], 90, 4).lit;
    // Each fine cell agrees with the window cell it lies in, except within one window cell of the shadow's edge.
    const row = 12;
    const fineRow = 4 * row + 1;
    const edge = (l: ArrayLike<number>, w: number, r: number) => {
      let c = w - 1;
      while (c > 0 && l[r * w + c] === 1) c--;
      return c;
    };
    const nativeEdge = edge(native, 32, row);
    const fineEdge = edge(lit, 128, fineRow);
    expect(Math.abs(coarseAt(fineEdge, 4) - nativeEdge)).toBeLessThanOrEqual(1);
    let agree = 0;
    for (let i = 0; i < 96; i++)
      for (let j = 0; j < 128; j++) if (lit[i * 128 + j] === native[Math.floor(i / 4) * 32 + Math.floor(j / 4)]) agree++;
    expect(agree / (128 * 96)).toBeGreaterThan(0.95);
  });
});

describe('smoothMargin', () => {
  it('blends the steps between neighbouring sweep lines and holds deep shadow to the soft edge', () => {
    // Lines alternating 4 m above and below the edge, as the sweep's one-cell steps draw them at a grazing Sun: one even grey.
    const w = 6;
    const h = 4;
    const stripes = Float64Array.from({ length: w * h }, (_, i) => (i % w) % 2 === 0 ? 4 : -4);
    const smooth = smoothMargin(stripes, w, h);
    for (let r = 0; r < h; r++) for (let c = 1; c < w - 1; c++) expect(Math.abs(smooth[r * w + c])).toBeLessThanOrEqual(1e-9);
    // A lit cell beside a cliff's deep shadow (500 m of margin) counts it as 6 m: it stays lit (margin −3 m, the soft
    // edge's lit end) and the shadow beside it dark.
    const cliff = Float64Array.from({ length: w * h }, (_, i) => ((i % w) < 3 ? -6 : 500));
    const edge = smoothMargin(cliff, w, h);
    expect(edge[w + 2]).toBeCloseTo(-3, 9);
    expect(edge[w + 3]).toBeCloseTo(3, 9);
    // Even ground is left as it is.
    expect(Array.from(smoothMargin(new Float64Array(w * h).fill(-2), w, h))).toEqual(new Array(w * h).fill(-2));
  });

  it('is used for a refined site only: a site drawn on its own cells keeps its picture exactly', () => {
    const levels = [ridge(16, 12, 960, 2, 0), ridge(40, 30, 240, 22, 300)];
    for (const minPx of [0, 160]) {
      const handle = createShadowHandler();
      handle({ id: 1, type: 'levels', key: 'a', levels, minPx });
      const res = handle({ id: 2, type: 'shade', key: 'a', bearingDeg: 80, elDeg: 3, half: false });
      const drawn = withRefinedFinest(levels, minPx);
      const finest = drawn[drawn.length - 1];
      const { margin } = cast(drawn, 80, 3);
      const want = shade(finest, minPx === 0 ? margin : smoothMargin(margin, finest.width, finest.height), 80, 3);
      expect(res.type === 'picture' && Array.from(res.pixels)).toEqual(Array.from(want));
    }
  });
});
