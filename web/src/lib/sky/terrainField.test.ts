import { describe, expect, it } from 'vitest';
import { flatField, heightAt, mapOf, meshHeightAt, terrainField, worldOf } from './terrainField';

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

  it('keeps the flight level apart: it is converted like the levels, and no height is read from it', () => {
    const coarse = level(41, 41, 100, () => 500);
    const fine = level(21, 21, 20, () => 510);
    const flight = level(31, 31, 240, () => 900);
    const f = terrainField([coarse, fine], 0, 500, flight);
    expect(f.flight).toMatchObject({ cols: 31, rows: 31, cell: 240 });
    expect(f.flight!.heights[15 * 31 + 15]).toBeCloseTo(400, 3); // 900 m less the site's 500, at the site
    expect(heightAt(f, 1500, 0)).toBeCloseTo(0 - 1500 ** 2 / (2 * 1737400), 3); // still the coarse level
    expect(terrainField([coarse, fine], 0, 500).flight).toBeUndefined();
  });

  it('is flat ground on the curved Moon at a site without terrain', () => {
    expect(heightAt(flatField(18), 0, 0)).toBeCloseTo(0, 9);
    expect(heightAt(flatField(18), 10000, 0)).toBeCloseTo(-(10000 ** 2) / (2 * 1737400), 6);
  });

  it('gives the height on the triangles the ground mesh draws, each cell split from its top right to its bottom left', () => {
    // A saddle of 960 m cells, the cap's: corners alternately 0 and 40 m, the site at a cell's middle.
    const saddle = { ...level(10, 10, 960, (c, r) => ((c + r) % 2 === 0 ? 0 : 40)), siteCol: 4.5, siteRow: 4.5 };
    const f = terrainField([saddle], 0, 0);
    const curve = (x: number, z: number) => (x * x + z * z) / (2 * 1737400);
    // The middle lies on the split, between two corners of 40 m: the drawn ground is 40 m there, where the
    // smooth (bilinear) height says 20.
    expect(meshHeightAt(f, 0, 0)).toBeCloseTo(40 - curve(480, 480), 1);
    expect(heightAt(f, 0, 0)).toBeCloseTo(20 - curve(480, 480), 0);
    // At a corner both agree.
    expect(meshHeightAt(f, 480, 480)).toBeCloseTo(heightAt(f, 480, 480), 6);
    // A quarter of the way in from the cell's top-left corner, in the triangle of that corner (0 m) and its two
    // neighbours (40 m each): 0 + 40 x 0.25 + 40 x 0.25 = 20 m, where the smooth height says 15 (the three
    // corners all lie 680 m out, so the curvature between them is theirs).
    const p = { x: -240, z: -240 };
    expect(meshHeightAt(f, p.x, p.z)).toBeCloseTo(20 - curve(480, 480), 1);
    expect(heightAt(f, p.x, p.z)).toBeCloseTo(15 - curve(480, 480), 1);
    // Flat ground: the same as the smooth height.
    expect(meshHeightAt(flatField(18), 3000, 0)).toBeCloseTo(heightAt(flatField(18), 3000, 0), 9);
  });
});
