import { describe, expect, it } from 'vitest';
import { flatField, heightAt, mapOf, terrainField, worldOf } from './terrainField';

const level = (cols: number, rows: number, cell: number, h: (c: number, r: number) => number) => {
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = h(c, r);
  return { heights, width: cols, height: rows, pxM: cell, siteCol: (cols - 1) / 2, siteRow: (rows - 1) / 2 };
};

describe('the terrain field', () => {
  it('turns map metres into world metres by the site’s longitude, both ways', () => {
    const w = worldOf(-64.31, 1000, 0);
    const m = mapOf(-64.31, w.x, w.z);
    expect(m.mx).toBeCloseTo(1000, 6);
    expect(m.my).toBeCloseTo(0, 6);
    // At longitude 0 the map's up is the site's north (world -z) and its right is east.
    expect(worldOf(0, 0, 500).z).toBeCloseTo(-500, 9);
    expect(worldOf(0, 500, 0).x).toBeCloseTo(500, 9);
  });

  it('gives heights relative to the site, lowered by the Moon’s curvature, from the finest level that holds the point', () => {
    const coarse = level(41, 41, 100, () => 500);
    const fine = level(21, 21, 20, () => 510);
    const f = terrainField([coarse, fine], 0, 500);
    expect(heightAt(f, 0, 0)).toBeCloseTo(10, 3); // the fine level, at the site
    expect(heightAt(f, 1500, 0)).toBeCloseTo(0 - 1500 ** 2 / (2 * 1737400), 3); // the coarse level, 1.5 km east
    expect(heightAt(f, 9e5, 0)).toBe(-1e6); // outside every level
  });

  it('is flat ground on the curved Moon at a site without terrain', () => {
    expect(heightAt(flatField(18), 0, 0)).toBeCloseTo(0, 9);
    expect(heightAt(flatField(18), 10000, 0)).toBeCloseTo(-(10000 ** 2) / (2 * 1737400), 6);
  });
});
