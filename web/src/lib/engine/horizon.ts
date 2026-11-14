import { R_MOON_M } from './constants';
import { enuBasis, siteVectorKm } from './geometry';
import { newTally, type LevelSampler, type TileTally } from './tiles';

export interface Band {
  sampler: LevelSampler;
  rMinM: number;
  rMaxM: number;
  stepM: number;
}

export interface BandInfo {
  grid: string;
  rMinM: number;
  rMaxM: number;
  stepM: number;
}

/** The highest ground on the Moon above the 1737.4 km reference sphere (LOLA: 10,786 m): no hill a map lacks can stand taller. */
export const HIGHEST_TERRAIN_M = 10_786;
/** Rays are counted in steps of this length, the 240 m grid's half pixel: a step has terrain when any grid gave a height in it. */
export const COVERAGE_CELL_M = 120;
/** The distances coverage is told in: the reach of the 20 m grid near the pole, of the 80 m grid, and of the 240 m grid. */
export const COVERAGE_RANGES: readonly (readonly [number, number])[] = [
  [0, 6_000],
  [6_000, 100_000],
  [100_000, 220_000],
];

/** Steps of rays, and steps without terrain, at distances from `fromM` to `toM` from the site. */
export interface CoverageRange {
  fromM: number;
  toM: number;
  samples: number;
  missing: number;
}

/**
 * How much of the ray-march found terrain. Each of the `nAz` rays is counted in 120 m steps (`samples`); a step is
 * `missing` when no band, primary or fallback, gave a height in it: it lies outside every grid, or in a tile that was
 * absent or failed to load. A missing step can only lower the skyline (it counts as no hill at all), so it matters
 * only where a hill there could stand above the skyline found: `openAzimuths` counts the rays where the highest ground
 * on the Moon, standing at a missing step, would. On those rays the skyline is not established.
 */
export interface Coverage {
  samples: number;
  missing: number;
  /** The same counts by distance from the site (COVERAGE_RANGES; a step farther out than the last range counts in it). */
  ranges: CoverageRange[];
  /** Distance of the nearest missing step (m), or null when every step has terrain. */
  nearestMissingM: number | null;
  openAzimuths: number;
  nAz: number;
  /** Tiles the march needed that the source does not have (HTTP 404, a missing file), as "L1/ty_tx". */
  absentTiles: string[];
  /** Tiles the march needed whose load failed (a network error, any other HTTP error), as "L1/ty_tx". */
  failedTiles: string[];
}

export type Samplers = { L0: LevelSampler; L1: LevelSampler; L2: LevelSampler };

export const NATIVE_STEP_M: Record<'L0' | 'L1' | 'L2', number> = { L0: 10, L1: 40, L2: 120 };
const LEVEL_ORDER: ('L0' | 'L1' | 'L2')[] = ['L0', 'L1', 'L2'];
const AZ_CHUNK = 60;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** numpy.arange(start, stop, step): length = ceil((stop - start) / step). */
function arange(start: number, stop: number, step: number): Float64Array {
  const n = Math.max(0, Math.ceil((stop - start) / step));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = start + i * step;
  return out;
}

export function bandsForSite(latDeg: number, samplers: Samplers): Band[] {
  if (latDeg > -60) throw new Error(`no DEM coverage north of 60S (lat ${latDeg})`);
  if (latDeg <= -87.55) {
    return [
      { sampler: samplers.L0, rMinM: 40, rMaxM: 6_000, stepM: 10 },
      { sampler: samplers.L1, rMinM: 6_000, rMaxM: 100_000, stepM: 40 },
      { sampler: samplers.L2, rMinM: 100_000, rMaxM: 220_000, stepM: 120 },
    ];
  }
  return [
    { sampler: samplers.L1, rMinM: 40, rMaxM: 100_000, stepM: 20 },
    { sampler: samplers.L2, rMinM: 100_000, rMaxM: 220_000, stepM: 120 },
  ];
}

export async function siteHeightM(latDeg: number, lonDeg: number, samplers: LevelSampler[]): Promise<number> {
  return (await siteHeightFrom(latDeg, lonDeg, samplers)).heightM;
}

/** The site's height from the first sampler with data there, and which sampler that was (0 is the finest asked for). */
export async function siteHeightFrom(latDeg: number, lonDeg: number, samplers: LevelSampler[]): Promise<{ heightM: number; index: number }> {
  for (let index = 0; index < samplers.length; index++) {
    const h = await samplers[index].valueAt(latDeg, lonDeg);
    if (!Number.isNaN(h)) return { heightM: h, index };
  }
  throw new Error(`no grid covers site (${latDeg}, ${lonDeg})`);
}

function azimuths(nAz: number): Float64Array {
  const az = new Float64Array(nAz);
  for (let i = 0; i < nAz; i++) az[i] = (i * 360) / nAz;
  return az;
}

/** Reusable per-band march buffers (ring pixels + heights) sized for AZ_CHUNK azimuths × k distances. */
class RingMarcher {
  private readonly px: number;
  private readonly py: number;
  private readonly pz: number;
  private readonly east: number[];
  private readonly north: number[];
  readonly cosD: Float64Array;
  readonly sinD: Float64Array;
  readonly cols: Float64Array;
  readonly rows: Float64Array;
  readonly heights: Float64Array;

  constructor(latDeg: number, lonDeg: number, readonly d: Float64Array) {
    const p = siteVectorKm(latDeg, lonDeg);
    const pn = Math.hypot(p[0], p[1], p[2]);
    this.px = p[0] / pn; this.py = p[1] / pn; this.pz = p[2] / pn;
    const { east, north } = enuBasis(latDeg, lonDeg);
    this.east = east; this.north = north;
    const k = d.length;
    this.cosD = new Float64Array(k);
    this.sinD = new Float64Array(k);
    for (let j = 0; j < k; j++) {
      const delta = d[j] / R_MOON_M;
      this.cosD[j] = Math.cos(delta);
      this.sinD[j] = Math.sin(delta);
    }
    this.cols = new Float64Array(AZ_CHUNK * k);
    this.rows = new Float64Array(AZ_CHUNK * k);
    this.heights = new Float64Array(AZ_CHUNK * k);
  }

  /**
   * Fill cols/rows for azimuths azDeg (length ≤ AZ_CHUNK) on `sampler`'s grid; returns the used length.
   * The unit vector q is projected directly: for a point south of the equator the south polar
   * stereographic coordinates are x = 2R·qy/(1 − qz), y = 2R·qx/(1 − qz) (identical to
   * ρ sin λ / ρ cos λ with ρ = 2R tan((90° + lat)/2), without any trigonometric call per sample).
   */
  project(sampler: LevelSampler, azDeg: Float64Array): number {
    const k = this.d.length, n = azDeg.length;
    const { east, north, px, py, pz, cosD, sinD, cols, rows } = this;
    const level = sampler.level;
    const twoR = 2 * R_MOON_M, scale = level.map_scale_m;
    const colOff = level.sample_offset_px, rowOff = level.line_offset_px;
    for (let a = 0; a < n; a++) {
      const az = azDeg[a] * DEG, ca = Math.cos(az), sa = Math.sin(az);
      const tx = ca * north[0] + sa * east[0], ty = ca * north[1] + sa * east[1], tz = ca * north[2] + sa * east[2];
      const base = a * k;
      for (let j = 0; j < k; j++) {
        const qx = cosD[j] * px + sinD[j] * tx, qy = cosD[j] * py + sinD[j] * ty, qz = cosD[j] * pz + sinD[j] * tz;
        const f = twoR / (1 - qz) / scale;
        cols[base + j] = colOff + qy * f;
        rows[base + j] = rowOff - qx * f;
      }
    }
    return n * k;
  }
}

/** Sub-views without allocation: typed-array subarrays of the marcher buffers. */
function view(arr: Float64Array, n: number): Float64Array {
  return arr.length === n ? arr : arr.subarray(0, n);
}

export async function horizonMaskWithStats(
  latDeg: number,
  lonDeg: number,
  bands: Band[],
  opts: { nAz?: number; mastM?: number; siteHeightM?: number } = {},
): Promise<{ mask: Float64Array; coverage: Coverage }> {
  const nAz = opts.nAz ?? 720;
  const mastM = opts.mastM ?? 2;
  const h = opts.siteHeightM ?? (await siteHeightM(latDeg, lonDeg, bands.map((b) => b.sampler)));
  const rO = R_MOON_M + h + mastM;
  const mask = new Float64Array(nAz).fill(-90);
  const az = azimuths(nAz);
  // One flag per ray and 120 m step: asked by some band, and given a height by some band.
  const nCells = Math.max(1, Math.ceil(bands.reduce((m, b) => Math.max(m, b.rMaxM), 0) / COVERAGE_CELL_M));
  const asked = new Uint8Array(nAz * nCells), found = new Uint8Array(nAz * nCells);
  const tallies = new Map<LevelSampler, TileTally>();
  for (const band of bands) {
    const marcher = new RingMarcher(latDeg, lonDeg, arange(band.rMinM, band.rMaxM, band.stepM));
    const k = marcher.d.length;
    const { cosD, sinD } = marcher;
    const cellOf = new Int32Array(k);
    for (let j = 0; j < k; j++) cellOf[j] = Math.min(nCells - 1, Math.floor(marcher.d[j] / COVERAGE_CELL_M));
    let tally = tallies.get(band.sampler);
    if (!tally) tallies.set(band.sampler, (tally = newTally()));
    for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
      const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
      const n = marcher.project(band.sampler, azChunk);
      const cols = view(marcher.cols, n), rows = view(marcher.rows, n), hs = view(marcher.heights, n);
      await band.sampler.ensureForPixels(cols, rows);
      band.sampler.valueBilinearInto(cols, rows, hs, tally);
      for (let a = 0; a < azChunk.length; a++) {
        let best = mask[a0 + a];
        const base = a * k, row = (a0 + a) * nCells;
        for (let j = 0; j < k; j++) {
          const cell = row + cellOf[j];
          asked[cell] = 1;
          const ht = hs[base + j];
          if (ht !== ht) continue; // NaN: no terrain here on this grid
          found[cell] = 1;
          const rT = R_MOON_M + ht;
          const el = Math.atan2(rT * cosD[j] - rO, rT * sinD[j]) * RAD;
          if (el > best) best = el;
        }
        mask[a0 + a] = best;
      }
    }
  }
  return { mask, coverage: coverageOf(mask, asked, found, nCells, rO, tallies) };
}

/** Counts the steps, the missing ones by distance, and the rays where a hill at a missing step could stand above the skyline. */
function coverageOf(mask: Float64Array, asked: Uint8Array, found: Uint8Array, nCells: number, rO: number, tallies: Map<LevelSampler, TileTally>): Coverage {
  const nAz = mask.length;
  // The highest elevation any hill could have at the near edge of each step: the highest ground on the Moon placed there.
  const rB = R_MOON_M + HIGHEST_TERRAIN_M;
  const bound = new Float64Array(nCells);
  const rangeOf = new Uint8Array(nCells);
  const ranges: CoverageRange[] = COVERAGE_RANGES.map(([fromM, toM]) => ({ fromM, toM, samples: 0, missing: 0 }));
  for (let b = 0; b < nCells; b++) {
    const d = b * COVERAGE_CELL_M, delta = d / R_MOON_M;
    bound[b] = Math.atan2(rB * Math.cos(delta) - rO, rB * Math.sin(delta)) * RAD;
    const i = ranges.findIndex((r) => d < r.toM);
    rangeOf[b] = i < 0 ? ranges.length - 1 : i;
  }
  let samples = 0, missing = 0, open = 0, nearest = Infinity;
  for (let a = 0; a < nAz; a++) {
    let worst = -Infinity;
    const row = a * nCells;
    for (let b = 0; b < nCells; b++) {
      if (!asked[row + b]) continue;
      samples++;
      ranges[rangeOf[b]].samples++;
      if (found[row + b]) continue;
      missing++;
      ranges[rangeOf[b]].missing++;
      nearest = Math.min(nearest, b * COVERAGE_CELL_M);
      if (bound[b] > worst) worst = bound[b];
    }
    if (worst > mask[a]) open++;
  }
  const absent: string[] = [], failed: string[] = [];
  for (const [sampler, tally] of tallies) {
    const keys = sampler.tallyKeys(tally);
    absent.push(...keys.absent);
    failed.push(...keys.failed);
  }
  return { samples, missing, ranges, nearestMissingM: nearest === Infinity ? null : nearest, openAzimuths: open, nAz, absentTiles: [...new Set(absent)], failedTiles: [...new Set(failed)] };
}

/**
 * Terrain skyline elevation (deg) for nAz azimuths (0 = north, clockwise): max over all bands and
 * distances of atan2(r_t cos δ − r_o, r_t sin δ). Samples with no DEM data count as −90.
 */
export async function horizonMask(
  latDeg: number,
  lonDeg: number,
  bands: Band[],
  opts: { nAz?: number; mastM?: number; siteHeightM?: number } = {},
): Promise<Float64Array> {
  return (await horizonMaskWithStats(latDeg, lonDeg, bands, opts)).mask;
}

/** Distance just before the first ring sample of `band` that lies outside its grid (null when fully covered). */
export async function firstMissingDistanceM(latDeg: number, lonDeg: number, band: Band, nAz: number, probeStepM: number): Promise<number | null> {
  const marcher = new RingMarcher(latDeg, lonDeg, arange(band.rMinM, band.rMaxM, probeStepM));
  const k = marcher.d.length;
  const missing = new Uint8Array(k);
  const az = azimuths(nAz);
  for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
    const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
    const n = marcher.project(band.sampler, azChunk);
    const cols = view(marcher.cols, n), rows = view(marcher.rows, n), hs = view(marcher.heights, n);
    await band.sampler.ensureForPixels(cols, rows);
    band.sampler.valueBilinearInto(cols, rows, hs);
    for (let a = 0; a < azChunk.length; a++) {
      const base = a * k;
      for (let j = 0; j < k; j++) if (hs[base + j] !== hs[base + j]) missing[j] = 1;
    }
  }
  const first = missing.indexOf(1);
  if (first < 0) return null;
  return marcher.d[Math.max(first - 1, 0)];
}

function levelKey(sampler: LevelSampler, samplers: Samplers): 'L0' | 'L1' | 'L2' {
  for (const key of LEVEL_ORDER) if (samplers[key] === sampler) return key;
  throw new Error('band sampler is not one of the L0/L1/L2 samplers');
}

/** Coarser-grid bands covering the distances where a primary band runs off its own grid (mirrors Python). */
export async function fallbackBands(latDeg: number, lonDeg: number, bands: Band[], samplers: Samplers, nAz = 720): Promise<Band[]> {
  const out: Band[] = [];
  for (const band of bands) {
    let probe = band;
    const start = LEVEL_ORDER.indexOf(levelKey(band.sampler, samplers)) + 1;
    for (const coarser of LEVEL_ORDER.slice(start)) {
      const step = Math.max(band.stepM, NATIVE_STEP_M[coarser]);
      const d0 = await firstMissingDistanceM(latDeg, lonDeg, probe, nAz, step);
      if (d0 === null) break;
      probe = { sampler: samplers[coarser], rMinM: d0, rMaxM: band.rMaxM, stepM: step };
      out.push(probe);
    }
  }
  return out;
}

function info(b: Band, samplers: Samplers): BandInfo {
  return { grid: levelKey(b.sampler, samplers), rMinM: b.rMinM, rMaxM: b.rMaxM, stepM: b.stepM };
}

/**
 * Full per-site computation: primary bands, fallback bands, site height, mask and coverage. `failedTiles` and
 * `absentTiles` name only the tiles this march needed and could not use; `siteGrid` is the grid the site's own height
 * came from, the first band's unless its tile there was missing.
 */
export async function computeSiteMask(
  latDeg: number,
  lonDeg: number,
  samplers: Samplers,
  opts: { nAz?: number; mastM?: number } = {},
): Promise<{ mask: Float64Array; siteHeightM: number; siteGrid: string; bands: BandInfo[]; fallbackBands: BandInfo[]; coverage: Coverage; failedTiles: string[]; absentTiles: string[] }> {
  const nAz = opts.nAz ?? 720;
  const bands = bandsForSite(latDeg, samplers);
  const fallback = await fallbackBands(latDeg, lonDeg, bands, samplers, nAz);
  const site = await siteHeightFrom(latDeg, lonDeg, bands.map((b) => b.sampler));
  const { mask, coverage } = await horizonMaskWithStats(latDeg, lonDeg, [...bands, ...fallback], { nAz, mastM: opts.mastM ?? 2, siteHeightM: site.heightM });
  return {
    mask,
    siteHeightM: site.heightM,
    siteGrid: levelKey(bands[site.index].sampler, samplers),
    bands: bands.map((b) => info(b, samplers)),
    fallbackBands: fallback.map((b) => info(b, samplers)),
    coverage,
    failedTiles: coverage.failedTiles,
    absentTiles: coverage.absentTiles,
  };
}
