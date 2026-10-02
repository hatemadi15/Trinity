import { describe, expect, it } from 'vitest';
import { cast, type Level } from './shadow';
import { createShadowHandler, halfLevel } from './shadow-handler';

/** A grid with a ridge down one column, the site in the middle. */
function ridge(w: number, h: number, px: number, col: number, height: number): Level {
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) heights[r * w + col] = height;
  return { heights, width: w, height: h, pxM: px, siteCol: (w - 1) / 2, siteRow: (h - 1) / 2 };
}

describe('the shadow handler', () => {
  const coarse = ridge(16, 12, 80, 2, 0);
  const fine = ridge(40, 30, 20, 22, 30);

  it('draws the finest level of the levels it holds, full size or halved', () => {
    const handle = createShadowHandler();
    expect(handle({ id: 1, type: 'levels', key: 'a', levels: [coarse, fine] })).toEqual({ id: 1, type: 'ok' });
    const full = handle({ id: 2, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: false });
    expect(full).toMatchObject({ id: 2, type: 'picture', key: 'a', width: 40, height: 30 });
    const half = handle({ id: 3, type: 'shade', key: 'a', bearingDeg: 90, elDeg: 2, half: true });
    expect(half).toMatchObject({ id: 3, type: 'picture', width: 20, height: 15 });
    if (full.type === 'picture') expect(full.pixels).toHaveLength(40 * 30);
  });

  it('says whether the site itself is lit, as the sweep finds at its pixel', () => {
    const handle = createShadowHandler();
    handle({ id: 1, type: 'levels', key: 'a', levels: [coarse, fine] });
    for (const [bearing, el] of [
      [90, 2],
      [270, 0.5],
      [90, 0.5],
    ]) {
      const res = handle({ id: 2, type: 'shade', key: 'a', bearingDeg: bearing, elDeg: el, half: false });
      const { lit } = cast([coarse, fine], bearing, el);
      const site = Math.round(fine.siteRow) * fine.width + Math.round(fine.siteCol);
      expect(res.type === 'picture' && res.siteLit).toBe(lit[site] === 1);
    }
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
