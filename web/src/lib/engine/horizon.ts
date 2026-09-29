import { R_MOON_M } from './constants';
import { enuBasis, siteVectorKm } from './geometry';
import type { LevelSampler } from './tiles';

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

/** How much of the ray-march found DEM data: `missing` samples fell outside a grid or in an absent/failed tile. */
export interface Coverage {
  samples: number;
  missing: number;
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
  for (const s of samplers) {
    const h = await s.valueAt(latDeg, lonDeg);
    if (!Number.isNaN(h)) return h;
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
  let samples = 0, missing = 0;
  for (const band of bands) {
    const marcher = new RingMarcher(latDeg, lonDeg, arange(band.rMinM, band.rMaxM, band.stepM));
    const k = marcher.d.length;
    const { cosD, sinD } = marcher;
    for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
      const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
      const n = marcher.project(band.sampler, azChunk);
      const cols = view(marcher.cols, n), rows = view(marcher.rows, n), hs = view(marcher.heights, n);
      await band.sampler.ensureForPixels(cols, rows);
      band.sampler.valueBilinearInto(cols, rows, hs);
      samples += n;
      for (let a = 0; a < azChunk.length; a++) {
        let best = mask[a0 + a];
        const base = a * k;
        for (let j = 0; j < k; j++) {
          const ht = hs[base + j];
          if (ht !== ht) { missing++; continue; } // NaN
          const rT = R_MOON_M + ht;
          const el = Math.atan2(rT * cosD[j] - rO, rT * sinD[j]) * RAD;
          if (el > best) best = el;
        }
        mask[a0 + a] = best;
      }
    }
  }
  return { mask, coverage: { samples, missing } };
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

/** Full per-site computation: primary bands, fallback bands, site height, mask, coverage and failed tiles. */
export async function computeSiteMask(
  latDeg: number,
  lonDeg: number,
  samplers: Samplers,
  opts: { nAz?: number; mastM?: number } = {},
): Promise<{ mask: Float64Array; siteHeightM: number; bands: BandInfo[]; fallbackBands: BandInfo[]; coverage: Coverage; failedTiles: string[] }> {
  const nAz = opts.nAz ?? 720;
  const bands = bandsForSite(latDeg, samplers);
  const fallback = await fallbackBands(latDeg, lonDeg, bands, samplers, nAz);
  const h = await siteHeightM(latDeg, lonDeg, bands.map((b) => b.sampler));
  const { mask, coverage } = await horizonMaskWithStats(latDeg, lonDeg, [...bands, ...fallback], { nAz, mastM: opts.mastM ?? 2, siteHeightM: h });
  const failedTiles = LEVEL_ORDER.flatMap((key) => samplers[key].failedTiles().map((t) => `${key}/${t}`));
  return {
    mask,
    siteHeightM: h,
    bands: bands.map((b) => info(b, samplers)),
    fallbackBands: fallback.map((b) => info(b, samplers)),
    coverage,
    failedTiles: [...new Set(failedTiles)],
  };
}
