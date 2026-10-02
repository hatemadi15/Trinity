/**
 * Exact Sun shadows on a height grid, by one sweep along the Sun's direction: the browser's twin of
 * `pipeline/lunar_pipeline/shadow.py`, checked against its fixtures in `data/fixtures/shadow`.
 *
 * A pixel is lit when no terrain further towards the Sun on its line rises above the line from that
 * pixel to the Sun. With heights lowered by r²/2R (r from the site) sight lines over the curved Moon
 * are straight, so along a line towards the Sun the test is a running maximum of
 * g = tangent height − (distance towards the Sun) × tan(elevation). Grids are north-up rasters of the
 * south polar stereographic maps (row 0 at the top, map-up is the longitude 0 direction). Levels are
 * chained from coarse to fine: a fine line starts from the coarse level's running maximum where it
 * enters the fine grid, so hills outside it still cast their shadows into it.
 */
import { R_MOON_M } from './constants';

/** One height grid: heights in metres (row-major, row 0 at the top), the pixel size and the site as a fractional pixel. */
export interface Level {
  heights: ArrayLike<number>;
  width: number;
  height: number;
  pxM: number;
  siteCol: number;
  siteRow: number;
}

const DEG = Math.PI / 180;

/** Map bearing of the Sun, clockwise from map-up, for a site at this longitude (azimuth A maps to bearing lon + A). */
export function sunBearingDeg(lonDeg: number, sunAzDeg: number): number {
  return (((lonDeg + sunAzDeg) % 360) + 360) % 360;
}

/** g per pixel; a missing height counts as −∞, so it neither raises a line's maximum nor falls under it. */
function lineValues(level: Level, bearingDeg: number, elDeg: number): Float64Array {
  const { width: w, height: h, pxM, siteCol, siteRow, heights } = level;
  const sx = Math.sin(bearingDeg * DEG);
  const sy = Math.cos(bearingDeg * DEG);
  const t = Math.tan(elDeg * DEG);
  const g = new Float64Array(w * h);
  for (let r = 0; r < h; r++) {
    const y = (siteRow - r) * pxM;
    for (let c = 0; c < w; c++) {
      const x = (c - siteCol) * pxM;
      const z = heights[r * w + c];
      g[r * w + c] = Number.isFinite(z) ? z - (x * x + y * y) / (2 * R_MOON_M) - (x * sx + y * sy) * t : -Infinity;
    }
  }
  return g;
}

/**
 * The lit mask, the running maximum before each pixel and the shadow margin (m) for one grid. Lines
 * follow the Sun's bearing with one pixel per step along the major axis; every pixel belongs to exactly
 * one line. `seed(x, y)` gives the starting maximum of a line that enters the grid at that map position
 * (its first pixel on the sunward side); without it lines start at −∞.
 */
export function sweep(level: Level, bearingDeg: number, elDeg: number, seed?: (x: number, y: number) => number): { lit: Uint8Array; mBefore: Float64Array; margin: Float64Array } {
  const { width: w, height: h, pxM, siteCol, siteRow } = level;
  const g = lineValues(level, bearingDeg, elDeg);
  const mBefore = new Float64Array(w * h).fill(-Infinity);
  const ux = Math.sin(bearingDeg * DEG); // towards the Sun in grid steps: columns to the right
  const uy = -Math.cos(bearingDeg * DEG); // and rows downwards
  const xOf = (c: number) => (c - siteCol) * pxM;
  const yOf = (r: number) => (siteRow - r) * pxM;
  if (Math.abs(ux) >= Math.abs(uy)) {
    const slope = uy / ux; // rows per column
    const start = ux > 0 ? w - 1 : 0;
    const span = Math.ceil(Math.abs(slope) * (w - 1)) + 1;
    const m = new Float64Array(h + 2 * span).fill(-Infinity);
    const entered = new Uint8Array(h + 2 * span);
    for (let k = 0; k < w; k++) {
      const c = ux > 0 ? w - 1 - k : k;
      const lo = span - Math.floor(slope * (c - start) + 0.5); // line index of row 0 in this column
      for (let r = 0; r < h; r++) {
        const line = lo + r;
        if (seed && !entered[line]) m[line] = seed(xOf(c), yOf(r));
        entered[line] = 1;
        const i = r * w + c;
        mBefore[i] = m[line];
        if (g[i] > m[line]) m[line] = g[i];
      }
    }
  } else {
    const slope = ux / uy; // columns per row
    const start = uy > 0 ? h - 1 : 0;
    const span = Math.ceil(Math.abs(slope) * (h - 1)) + 1;
    const m = new Float64Array(w + 2 * span).fill(-Infinity);
    const entered = new Uint8Array(w + 2 * span);
    for (let k = 0; k < h; k++) {
      const r = uy > 0 ? h - 1 - k : k;
      const lo = span - Math.floor(slope * (r - start) + 0.5);
      for (let c = 0; c < w; c++) {
        const line = lo + c;
        if (seed && !entered[line]) m[line] = seed(xOf(c), yOf(r));
        entered[line] = 1;
        const i = r * w + c;
        mBefore[i] = m[line];
        if (g[i] > m[line]) m[line] = g[i];
      }
    }
  }
  const margin = new Float64Array(w * h);
  const lit = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    margin[i] = mBefore[i] - g[i];
    // A missing height (g = −∞) is drawn lit: nothing is known that could shade it.
    lit[i] = margin[i] <= 0 || g[i] === -Infinity ? 1 : 0;
  }
  return { lit, mBefore, margin };
}

/** Starting maxima for a finer grid: the coarse running maximum at the coarse pixel under each entry point. */
function seedFrom(level: Level, mBefore: Float64Array): (x: number, y: number) => number {
  return (x, y) => {
    const col = Math.floor(x / level.pxM + level.siteCol + 0.5);
    const row = Math.floor(level.siteRow - y / level.pxM + 0.5);
    if (col < 0 || col >= level.width || row < 0 || row >= level.height) return -Infinity;
    return mBefore[row * level.width + col];
  };
}

/** Sweeps the levels from coarse to fine, each seeded from the one before; returns the finest level's lit mask and margin. */
export function cast(levels: Level[], bearingDeg: number, elDeg: number): { lit: Uint8Array; margin: Float64Array } {
  if (levels.length === 0) throw new Error('cast needs at least one level');
  let seed: ((x: number, y: number) => number) | undefined;
  let out: { lit: Uint8Array; margin: Float64Array } | null = null;
  for (const level of levels) {
    const { lit, mBefore, margin } = sweep(level, bearingDeg, elDeg, seed);
    seed = seedFrom(level, mBefore);
    out = { lit, margin };
  }
  return out!;
}

/** numpy's default percentile (linear between ranks) of values sorted in place. */
function percentileSorted(sorted: Float64Array, q: number): number {
  const at = (q / 100) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/**
 * A north-up 8-bit picture: sunlit slopes by the angle to the Sun, shadows with a faint fixed fill so
 * that their shape survives; the edge of a shadow softens over `softM` metres of margin.
 */
export function shade(level: Level, margin: ArrayLike<number>, bearingDeg: number, elDeg: number, softM = 6): Uint8Array {
  const { width: w, height: h, pxM, heights } = level;
  const n = w * h;
  const z = (r: number, c: number) => heights[r * w + c];
  const b = bearingDeg * DEG;
  const el = elDeg * DEG;
  const lx = Math.sin(b) * Math.cos(el);
  const ly = Math.cos(b) * Math.cos(el);
  const lz = Math.sin(el);
  const fb = 40 * DEG;
  const fx = Math.sin(fb) * 0.5;
  const fy = Math.cos(fb) * 0.5;
  const direct = new Float64Array(n);
  const fill = new Float64Array(n);
  const litShare = new Float64Array(n);
  const sunlit: number[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      // np.gradient: central differences inside, one-sided at the edges; gy runs down the rows.
      const gx = w < 2 ? 0 : c === 0 ? (z(r, 1) - z(r, 0)) / pxM : c === w - 1 ? (z(r, w - 1) - z(r, w - 2)) / pxM : (z(r, c + 1) - z(r, c - 1)) / (2 * pxM);
      const gy = h < 2 ? 0 : r === 0 ? (z(1, c) - z(0, c)) / pxM : r === h - 1 ? (z(h - 1, c) - z(h - 2, c)) / pxM : (z(r + 1, c) - z(r - 1, c)) / (2 * pxM);
      const nx = -gx;
      const ny = gy;
      const norm = Math.sqrt(nx * nx + ny * ny + 1);
      const i = r * w + c;
      direct[i] = Math.max(0, (nx * lx + ny * ly + lz) / norm);
      fill[i] = Math.min(1, Math.max(0, (nx * fx + ny * fy + 0.866) / norm));
      const s = 0.5 - margin[i] / softM;
      litShare[i] = Number.isNaN(s) ? 0 : Math.min(1, Math.max(0, s));
      if (litShare[i] > 0.5) sunlit.push(direct[i]);
    }
  }
  let k = 1;
  if (sunlit.length > 0) {
    const sorted = Float64Array.from(sunlit).sort();
    k = 1 / Math.max(percentileSorted(sorted, 92), 1e-3);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const tone = 1 - Math.exp(-1.9 * Math.min(1.6, Math.max(0, direct[i] * k)) * litShare[i]);
    const v = 255 * (0.035 + 0.085 * fill[i] + 0.9 * tone);
    out[i] = Number.isNaN(v) ? 0 : Math.trunc(Math.min(255, Math.max(0, v)));
  }
  return out;
}
