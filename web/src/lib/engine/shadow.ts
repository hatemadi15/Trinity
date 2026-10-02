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
    // Line index of row 0 in each column; a line is the pixels lo[c] + r = line.
    const lo = new Int32Array(w);
    for (let c = 0; c < w; c++) lo[c] = span - Math.floor(slope * (c - start) + 0.5);
    // Walking away from the Sun a line's row only grows (or only shrinks), so the grid is visited in
    // memory order: rows in that direction, and in each row the columns from the Sun's side first.
    const c0 = ux > 0 ? w - 1 : 0;
    const dc = ux > 0 ? -1 : 1;
    const rowsDown = slope * dc >= 0;
    for (let k = 0; k < h; k++) {
      const r = rowsDown ? k : h - 1 - k;
      const y = yOf(r);
      for (let j = 0, c = c0; j < w; j++, c += dc) {
        const line = lo[c] + r;
        if (seed && !entered[line]) m[line] = seed(xOf(c), y);
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

/** The k-th smallest of values[0, n) (k from 0), found by partitioning in place: values are reordered. */
function select(values: Float64Array, n: number, k: number): number {
  let left = 0;
  let right = n - 1;
  while (right > left) {
    // Median of three as the pivot keeps sorted or uniform runs from going quadratic.
    const mid = (left + right) >>> 1;
    const a = values[left];
    const b = values[mid];
    const c = values[right];
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b;
    let i = left;
    let j = right;
    while (i <= j) {
      while (values[i] < pivot) i++;
      while (values[j] > pivot) j--;
      if (i <= j) {
        const t = values[i];
        values[i] = values[j];
        values[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) right = j;
    else if (k >= i) left = i;
    else return values[k];
  }
  return values[k];
}

/** numpy's default percentile (linear between ranks) of values[0, count), without a full sort; values are reordered. */
export function percentile(values: Float64Array, count: number, q: number): number {
  const at = (q / 100) * (count - 1);
  const lo = Math.floor(at);
  const low = select(values, count, lo);
  if (at === lo) return low;
  // After selecting rank lo, every value from lo + 1 on is at least as large: the next rank is their smallest.
  let next = Infinity;
  for (let i = lo + 1; i < count; i++) if (values[i] < next) next = values[i];
  return low + (next - low) * (at - lo);
}

/**
 * A north-up 8-bit picture: sunlit slopes by the angle to the Sun, shadows with a faint fixed fill so
 * that their shape survives; the edge of a shadow softens over `softM` metres of margin.
 */
export function shade(level: Level, margin: ArrayLike<number>, bearingDeg: number, elDeg: number, softM = 6): Uint8Array {
  const { width: w, height: h, pxM, heights } = level;
  const n = w * h;
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
  const sunlit = new Float64Array(n);
  let lit = 0;
  for (let r = 0; r < h; r++) {
    // np.gradient: central differences inside, one-sided at the edges; gy runs down the rows.
    const up = (r > 0 ? r - 1 : r) * w;
    const down = (r < h - 1 ? r + 1 : r) * w;
    const dy = ((down - up) / w) * pxM;
    for (let c = 0; c < w; c++) {
      const left = c > 0 ? c - 1 : c;
      const right = c < w - 1 ? c + 1 : c;
      const gx = right === left ? 0 : (heights[r * w + right] - heights[r * w + left]) / ((right - left) * pxM);
      const gy = dy === 0 ? 0 : (heights[down + c] - heights[up + c]) / dy;
      const nx = -gx;
      const ny = gy;
      const norm = Math.sqrt(nx * nx + ny * ny + 1);
      const i = r * w + c;
      direct[i] = Math.max(0, (nx * lx + ny * ly + lz) / norm);
      fill[i] = Math.min(1, Math.max(0, (nx * fx + ny * fy + 0.866) / norm));
      const s = 0.5 - margin[i] / softM;
      litShare[i] = Number.isNaN(s) ? 0 : Math.min(1, Math.max(0, s));
      if (litShare[i] > 0.5) sunlit[lit++] = direct[i];
    }
  }
  const k = lit > 0 ? 1 / Math.max(percentile(sunlit, lit, 92), 1e-3) : 1;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const tone = 1 - Math.exp(-1.9 * Math.min(1.6, Math.max(0, direct[i] * k)) * litShare[i]);
    const v = 255 * (0.035 + 0.085 * fill[i] + 0.9 * tone);
    out[i] = Number.isNaN(v) ? 0 : Math.trunc(Math.min(255, Math.max(0, v)));
  }
  return out;
}
