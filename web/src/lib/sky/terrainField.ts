import { R_MOON_M } from '../engine/constants';
import type { Level } from '../engine/shadow';

/** One height level in the site's frame: metres above the site's ground, with the Moon's curvature dropped. */
export interface FieldLevel { cols: number; rows: number; cell: number; siteCol: number; siteRow: number; heights: Float32Array }
/**
 * The ground around the site, finest level first; `lonDeg` turns the polar grid into the site's compass. `flight`: a
 * finer far level for views from above (the arrival), drawn but never read for a height.
 */
export interface TerrainField { levels: FieldLevel[]; lonDeg: number; flight?: FieldLevel }

const DEG = Math.PI / 180;
const OUTSIDE = -1e6;

/** Map metres (x right, y up on the polar grid) of a world point (x east, z south): the grid is the world turned by the site's longitude. */
export function mapOf(lonDeg: number, x: number, z: number): { mx: number; my: number } {
  const c = Math.cos(lonDeg * DEG), s = Math.sin(lonDeg * DEG), n = -z;
  return { mx: x * c + n * s, my: -x * s + n * c };
}

/** The world point (x east, z south) of map metres. */
export function worldOf(lonDeg: number, mx: number, my: number): { x: number; z: number } {
  const c = Math.cos(lonDeg * DEG), s = Math.sin(lonDeg * DEG);
  return { x: mx * c - my * s, z: -(mx * s + my * c) };
}

/** The shadow levels (coarse to fine, as `shadowLevels` returns them) as site-frame heights, finest first; `flight` converted alike, kept apart. */
export function terrainField(levels: Level[], lonDeg: number, siteHeightM: number, flight: Level | null = null): TerrainField {
  const toField = (l: Level): FieldLevel => {
    const heights = new Float32Array(l.width * l.height);
    for (let r = 0; r < l.height; r++) {
      for (let c = 0; c < l.width; c++) {
        const mx = (c - l.siteCol) * l.pxM, my = -(r - l.siteRow) * l.pxM, z = Number(l.heights[r * l.width + c]);
        heights[r * l.width + c] = Number.isFinite(z) ? z - siteHeightM - (mx * mx + my * my) / (2 * R_MOON_M) : OUTSIDE;
      }
    }
    return { cols: l.width, rows: l.height, cell: l.pxM, siteCol: l.siteCol, siteRow: l.siteRow, heights };
  };
  const out: TerrainField = { levels: levels.map(toField).reverse(), lonDeg };
  if (flight) out.flight = toField(flight);
  return out;
}

/** Flat ground on the curved Moon, for a site without terrain. */
export function flatField(lonDeg: number): TerrainField {
  return { levels: [], lonDeg };
}

/** Bilinear height at map metres, or null outside the level (one cell in from its edges). */
function sample(l: FieldLevel, mx: number, my: number): number | null {
  const c = l.siteCol + mx / l.cell, r = l.siteRow - my / l.cell;
  if (!(c > 1 && r > 1 && c < l.cols - 2 && r < l.rows - 2)) return null;
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, h = l.heights, w = l.cols;
  const a = h[r0 * w + c0], b = h[r0 * w + c0 + 1], d = h[(r0 + 1) * w + c0], e = h[(r0 + 1) * w + c0 + 1];
  return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr;
}

/**
 * Height at map metres on the triangles the ground mesh draws (each cell split from its top-right corner to
 * its bottom-left one), or null outside the level: on 960 m cells it can stand tens of metres off the
 * bilinear height.
 */
function sampleMesh(l: FieldLevel, mx: number, my: number): number | null {
  const c = l.siteCol + mx / l.cell, r = l.siteRow - my / l.cell;
  if (!(c > 1 && r > 1 && c < l.cols - 2 && r < l.rows - 2)) return null;
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, h = l.heights, w = l.cols;
  const a = h[r0 * w + c0], b = h[r0 * w + c0 + 1], d = h[(r0 + 1) * w + c0], e = h[(r0 + 1) * w + c0 + 1];
  return fc + fr <= 1 ? a + (b - a) * fc + (d - a) * fr : e + (d - e) * (1 - fc) + (b - e) * (1 - fr);
}

/** A field's height at a world point (x east, z south) by `at`, from the finest level that holds it; -1e6 outside them all. */
function fieldHeight(f: TerrainField, x: number, z: number, at: (l: FieldLevel, mx: number, my: number) => number | null): number {
  const { mx, my } = mapOf(f.lonDeg, x, z);
  if (f.levels.length === 0) return -(mx * mx + my * my) / (2 * R_MOON_M);
  for (const l of f.levels) {
    const h = at(l, mx, my);
    if (h !== null) return h;
  }
  return OUTSIDE;
}

/** Height of the ground at a world point (x east, z south), bilinear between the grid's heights, as the shadow rule reads it. */
export function heightAt(f: TerrainField, x: number, z: number): number {
  return fieldHeight(f, x, z, sample);
}

/** Height of the drawn ground at a world point: what stands on the ground (the eye, the lander, the rocks) stands on this. */
export function meshHeightAt(f: TerrainField, x: number, z: number): number {
  return fieldHeight(f, x, z, sampleMesh);
}

/** Cell size of the finest level that holds a point (the coarsest's outside them all; 20 m on flat ground). */
export function cellAt(f: TerrainField, x: number, z: number): number {
  if (f.levels.length === 0) return 20;
  const { mx, my } = mapOf(f.lonDeg, x, z);
  for (const l of f.levels) if (sample(l, mx, my) !== null) return l.cell;
  return f.levels[f.levels.length - 1].cell;
}
