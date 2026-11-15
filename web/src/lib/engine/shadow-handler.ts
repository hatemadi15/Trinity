import { cast, shade, SOFT_M, type Level } from './shadow';

/** What the shadow worker is asked: hold a site's levels, or draw them for one Sun. */
export type ShadowRequest =
  | { id: number; type: 'levels'; key: string; levels: Level[]; minPx?: number }
  | { id: number; type: 'shade'; key: string; bearingDeg: number; elDeg: number; half: boolean };

export interface ShadowPicture {
  id: number;
  type: 'picture';
  key: string;
  width: number;
  height: number;
  /** The finest level's 8-bit picture, row-major, row 0 at the top (map-up is the lon 0 direction). */
  pixels: Uint8Array;
  /** Whether the site's own pixel is in sunlight. */
  siteLit: boolean;
}

export type ShadowResponse = { id: number; type: 'ok' } | ShadowPicture | { id: number; type: 'error'; message: string };

/** A level at half resolution: 2 by 2 cells averaged (an odd last row or column dropped), the pixel twice as large, the site at the same place. */
export function halfLevel(level: Level): Level {
  const w = Math.floor(level.width / 2);
  const h = Math.floor(level.height / 2);
  const heights = new Float32Array(w * h);
  const src = level.heights;
  const W = level.width;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = 2 * r * W + 2 * c;
      heights[r * w + c] = (src[i] + src[i + 1] + src[i + W] + src[i + W + 1]) / 4;
    }
  }
  // Half cell c covers full cells 2c and 2c + 1, whose middle is at full column 2c + 0.5.
  return { heights, width: w, height: h, pxM: level.pxM * 2, siteCol: (level.siteCol - 0.5) / 2, siteRow: (level.siteRow - 0.5) / 2 };
}

/** The shadow picture's least side, in pixels: a 20 m window's own 1024 cells. A coarser window is refined up to it. */
export const PICTURE_MIN_PX = 1024;

/**
 * A level is never drawn more than this many times finer than its own cells: past it the picture would be
 * mostly surface made up between the cells (the cap's 960 m cells around a clicked point with no window get 4).
 */
export const MAX_REFINE = 4;

/** How many times finer than its own cells a level is drawn: the least whole number that brings its longer side to `minPx`, at most MAX_REFINE (1 for a 20 m window, 2 for 80 m, 4 for 240 m). */
export function refineFactor(level: Pick<Level, 'width' | 'height'>, minPx = PICTURE_MIN_PX): number {
  const side = Math.max(level.width, level.height);
  return side > 0 ? Math.min(MAX_REFINE, Math.max(1, Math.ceil(minPx / side))) : 1;
}

/** Catmull-Rom weights of the four cells around a point a fraction t past the second of them. */
function catmullRom(t: number, out: Float64Array, at: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  out[at] = (-t3 + 2 * t2 - t) / 2;
  out[at + 1] = (3 * t3 - 5 * t2 + 2) / 2;
  out[at + 2] = (-3 * t3 + 4 * t2 + t) / 2;
  out[at + 3] = (t3 - t2) / 2;
}

/** For each of the n·k fine cells along one axis: the four coarse cells it is read from (clamped at the edges), their weights and how far past the second it lies. */
function axisTaps(n: number, k: number): { cells: Int32Array; weights: Float64Array; frac: Float64Array } {
  const m = n * k;
  const cells = new Int32Array(4 * m);
  const weights = new Float64Array(4 * m);
  const frac = new Float64Array(m);
  for (let j = 0; j < m; j++) {
    // Fine cell j's centre, in coarse cells: k fine cells share each coarse one, so the ground's edges stay put.
    const u = (j + 0.5) / k - 0.5;
    const i = Math.floor(u);
    frac[j] = u - i;
    for (let d = 0; d < 4; d++) cells[4 * j + d] = Math.min(n - 1, Math.max(0, i - 1 + d));
    catmullRom(u - i, weights, 4 * j);
  }
  return { cells, weights, frac };
}

/**
 * One Catmull-Rom value from four samples, held between the middle two so a steep step never rings into a
 * rim or a pit the data does not have; next to a missing height (NaN), the nearer middle sample's own.
 */
function between(a: number, b: number, c: number, d: number, taps: Float64Array, at: number, t: number): number {
  let v = taps[at] * a + taps[at + 1] * b + taps[at + 2] * c + taps[at + 3] * d;
  const lo = b < c ? b : c;
  const hi = b < c ? c : b;
  if (v < lo) v = lo;
  else if (v > hi) v = hi;
  return v === v ? v : t < 0.5 ? b : c;
}

/**
 * The same ground in cells k times smaller: each cell split k by k, its heights read off a smooth
 * (Catmull-Rom, bicubic) surface through the cell centres. The picture gets smoother, not more
 * detailed: no height is measured at the new cells, and none rises above, or sinks below, the two
 * cells either side of it. The ground's edges stay where they were, so fine cell j is centred on coarse
 * column (j + 0.5) / k − 0.5 and the site moves to k · siteCol + (k − 1) / 2; `halfLevel` of a level
 * refined by 2 has the original's cells again.
 */
export function refineLevel(level: Level, k: number): Level {
  if (!Number.isInteger(k) || k < 1) throw new Error(`refineLevel needs a whole factor of at least 1, got ${k}`);
  if (k === 1) return level;
  const { width: w, height: h, heights } = level;
  const W = w * k;
  const H = h * k;
  const across = axisTaps(w, k);
  const down = axisTaps(h, k);
  // Along the rows first (h coarse rows by W fine columns), then down the columns a whole fine row at a time.
  const rows = new Float64Array(h * W);
  const cells = across.cells;
  for (let r = 0; r < h; r++) {
    const from = r * w;
    const to = r * W;
    for (let j = 0; j < W; j++) {
      const q = 4 * j;
      rows[to + j] = between(heights[from + cells[q]], heights[from + cells[q + 1]], heights[from + cells[q + 2]], heights[from + cells[q + 3]], across.weights, q, across.frac[j]);
    }
  }
  const out = new Float32Array(W * H);
  for (let R = 0; R < H; R++) {
    const q = 4 * R;
    const r0 = down.cells[q] * W;
    const r1 = down.cells[q + 1] * W;
    const r2 = down.cells[q + 2] * W;
    const r3 = down.cells[q + 3] * W;
    const t = down.frac[R];
    const to = R * W;
    for (let c = 0; c < W; c++) out[to + c] = between(rows[r0 + c], rows[r1 + c], rows[r2 + c], rows[r3 + c], down.weights, q, t);
  }
  return { heights: out, width: W, height: H, pxM: level.pxM / k, siteCol: level.siteCol * k + (k - 1) / 2, siteRow: level.siteRow * k + (k - 1) / 2 };
}

/**
 * A site's levels as the worker sweeps them: as given, coarse to fine, then the finest again refined to
 * a picture at least `minPx` across (an 80 m window twice, a 240 m window four times; a 20 m window is
 * left as it is), but never more than MAX_REFINE times finer than its own cells. The refined level covers the same ground in finer cells, so the sweep seeds it from
 * the window's own level as it seeds the window from the coarser ones.
 */
export function withRefinedFinest(levels: Level[], minPx = PICTURE_MIN_PX): Level[] {
  if (levels.length === 0) return levels;
  const finest = levels[levels.length - 1];
  const k = refineFactor(finest, minPx);
  return k > 1 ? [...levels, refineLevel(finest, k)] : levels;
}

/**
 * A refined level's margin, held within ±`bound` metres and averaged over the 3 by 3 cells around each
 * (weights 1-2-1 each way, the edge cells repeated): the sweep takes one cell per step along the Sun, so
 * where the ground meets the light at a grazing angle neighbouring lines differ by a step's worth of
 * height and draw streaks along the Sun; averaged over one fine cell (still finer than the data's own),
 * those steps blend and the shadow's edge is smoothed. Held to the soft edge's own width, a deep shadow
 * does not darken the lit cell beside it.
 */
export function smoothMargin(margin: ArrayLike<number>, w: number, h: number, bound = SOFT_M): Float64Array {
  const held = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = margin[i];
    held[i] = v > bound ? bound : v < -bound ? -bound : v;
  }
  const across = new Float64Array(w * h);
  for (let r = 0; r < h; r++) {
    const o = r * w;
    for (let c = 0; c < w; c++) across[o + c] = (held[o + (c > 0 ? c - 1 : c)] + 2 * held[o + c] + held[o + (c < w - 1 ? c + 1 : c)]) / 4;
  }
  const out = new Float64Array(w * h);
  for (let r = 0; r < h; r++) {
    const up = (r > 0 ? r - 1 : r) * w;
    const me = r * w;
    const down = (r < h - 1 ? r + 1 : r) * w;
    for (let c = 0; c < w; c++) out[me + c] = (across[up + c] + 2 * across[me + c] + across[down + c]) / 4;
  }
  return out;
}

/** Sets of levels the worker holds at once: the site on screen and the one before it. */
const HELD = 2;

/**
 * The worker's whole job, as a pure function so it can run inline and in tests: it keeps the levels of
 * the last two sites (the finest refined once, as they arrive, to a picture at least the request's
 * `minPx` across, by default PICTURE_MIN_PX, and their half-resolution copies, made on first use) and
 * draws the finest level for a Sun, a refined one with its shadow edges smoothed.
 */
export function createShadowHandler(): (req: ShadowRequest) => ShadowResponse {
  const full = new Map<string, Level[]>();
  const half = new Map<string, Level[]>();
  /** The sites whose finest level was refined: their shadow edges are smoothed over one fine cell (`smoothMargin`). */
  const refined = new Set<string>();
  return (req) => {
    try {
      if (req.type === 'levels') {
        const levels = withRefinedFinest(req.levels, req.minPx ?? PICTURE_MIN_PX);
        full.delete(req.key);
        full.set(req.key, levels);
        half.delete(req.key);
        if (levels.length > req.levels.length) refined.add(req.key);
        else refined.delete(req.key);
        while (full.size > HELD) {
          const oldest = full.keys().next().value!;
          full.delete(oldest);
          half.delete(oldest);
          refined.delete(oldest);
        }
        return { id: req.id, type: 'ok' };
      }
      const levels = full.get(req.key);
      if (!levels || levels.length === 0) return { id: req.id, type: 'error', message: `no terrain held for ${req.key}` };
      let use = levels;
      if (req.half) {
        if (!half.has(req.key)) half.set(req.key, levels.map(halfLevel));
        use = half.get(req.key)!;
      }
      const finest = use[use.length - 1];
      const { lit, margin } = cast(use, req.bearingDeg, req.elDeg);
      const site = Math.min(finest.height - 1, Math.max(0, Math.round(finest.siteRow))) * finest.width + Math.min(finest.width - 1, Math.max(0, Math.round(finest.siteCol)));
      return {
        id: req.id,
        type: 'picture',
        key: req.key,
        width: finest.width,
        height: finest.height,
        pixels: shade(finest, refined.has(req.key) ? smoothMargin(margin, finest.width, finest.height) : margin, req.bearingDeg, req.elDeg),
        siteLit: lit[site] === 1,
      };
    } catch (err) {
      return { id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  };
}
