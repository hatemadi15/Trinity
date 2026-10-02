import { cast, shade, type Level } from './shadow';

/** What the shadow worker is asked: hold a site's levels, or draw them for one Sun. */
export type ShadowRequest =
  | { id: number; type: 'levels'; key: string; levels: Level[] }
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

/**
 * The worker's whole job, as a pure function so it can run inline and in tests: it keeps each site's
 * levels (and their half-resolution copies, made on first use) and draws the finest level for a Sun.
 */
export function createShadowHandler(): (req: ShadowRequest) => ShadowResponse {
  const full = new Map<string, Level[]>();
  const half = new Map<string, Level[]>();
  return (req) => {
    try {
      if (req.type === 'levels') {
        full.set(req.key, req.levels);
        half.delete(req.key);
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
        pixels: shade(finest, margin, req.bearingDeg, req.elDeg),
        siteLit: lit[site] === 1,
      };
    } catch (err) {
      return { id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  };
}
