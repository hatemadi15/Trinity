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

/** Great-circle sample points for azimuths [az0, az1) at distances d (m): lat/lon arrays of length nAzChunk*k. */
function ringPoints(latDeg: number, lonDeg: number, azDeg: Float64Array, d: Float64Array): { lat: Float64Array; lon: Float64Array } {
  const p = siteVectorKm(latDeg, lonDeg);
  const pn = Math.hypot(p[0], p[1], p[2]);
  const px = p[0] / pn, py = p[1] / pn, pz = p[2] / pn;
  const { east, north } = enuBasis(latDeg, lonDeg);
  const k = d.length, n = azDeg.length;
  const lat = new Float64Array(n * k), lon = new Float64Array(n * k);
  const cosD = new Float64Array(k), sinD = new Float64Array(k);
  for (let j = 0; j < k; j++) { const delta = d[j] / R_MOON_M; cosD[j] = Math.cos(delta); sinD[j] = Math.sin(delta); }
  for (let a = 0; a < n; a++) {
    const az = azDeg[a] * DEG, ca = Math.cos(az), sa = Math.sin(az);
    const tx = ca * north[0] + sa * east[0], ty = ca * north[1] + sa * east[1], tz = ca * north[2] + sa * east[2];
    for (let j = 0; j < k; j++) {
      const qx = cosD[j] * px + sinD[j] * tx, qy = cosD[j] * py + sinD[j] * ty, qz = cosD[j] * pz + sinD[j] * tz;
      const i = a * k + j;
      lat[i] = Math.asin(Math.max(-1, Math.min(1, qz))) * RAD;
      lon[i] = Math.atan2(qy, qx) * RAD;
    }
  }
  return { lat, lon };
}

function pixelsFor(sampler: LevelSampler, lat: Float64Array, lon: Float64Array): { cols: Float64Array; rows: Float64Array } {
  const cols = new Float64Array(lat.length), rows = new Float64Array(lat.length);
  for (let i = 0; i < lat.length; i++) {
    const p = sampler.pixelFromLatLon(lat[i], lon[i]);
    cols[i] = p.col; rows[i] = p.row;
  }
  return { cols, rows };
}

function azimuths(nAz: number): Float64Array {
  const az = new Float64Array(nAz);
  for (let i = 0; i < nAz; i++) az[i] = (i * 360) / nAz;
  return az;
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
  const nAz = opts.nAz ?? 720;
  const mastM = opts.mastM ?? 2;
  const h = opts.siteHeightM ?? (await siteHeightM(latDeg, lonDeg, bands.map((b) => b.sampler)));
  const rO = R_MOON_M + h + mastM;
  const mask = new Float64Array(nAz).fill(-90);
  const az = azimuths(nAz);
  for (const band of bands) {
    const d = arange(band.rMinM, band.rMaxM, band.stepM);
    const k = d.length;
    const cosD = new Float64Array(k), sinD = new Float64Array(k);
    for (let j = 0; j < k; j++) { const delta = d[j] / R_MOON_M; cosD[j] = Math.cos(delta); sinD[j] = Math.sin(delta); }
    for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
      const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
      const { lat, lon } = ringPoints(latDeg, lonDeg, azChunk, d);
      const { cols, rows } = pixelsFor(band.sampler, lat, lon);
      await band.sampler.ensureForPixels(cols, rows);
      const hs = band.sampler.valueBilinear(cols, rows);
      for (let a = 0; a < azChunk.length; a++) {
        let best = mask[a0 + a];
        for (let j = 0; j < k; j++) {
          const ht = hs[a * k + j];
          if (Number.isNaN(ht)) continue;
          const rT = R_MOON_M + ht;
          const el = Math.atan2(rT * cosD[j] - rO, rT * sinD[j]) * RAD;
          if (el > best) best = el;
        }
        mask[a0 + a] = best;
      }
    }
  }
  return mask;
}

/** Distance just before the first ring sample of `band` that lies outside its grid (null when fully covered). */
export async function firstMissingDistanceM(latDeg: number, lonDeg: number, band: Band, nAz: number, probeStepM: number): Promise<number | null> {
  const d = arange(band.rMinM, band.rMaxM, probeStepM);
  const k = d.length;
  const missing = new Uint8Array(k);
  const az = azimuths(nAz);
  for (let a0 = 0; a0 < nAz; a0 += AZ_CHUNK) {
    const azChunk = az.subarray(a0, Math.min(nAz, a0 + AZ_CHUNK));
    const { lat, lon } = ringPoints(latDeg, lonDeg, azChunk, d);
    const { cols, rows } = pixelsFor(band.sampler, lat, lon);
    await band.sampler.ensureForPixels(cols, rows);
    const hs = band.sampler.valueBilinear(cols, rows);
    for (let a = 0; a < azChunk.length; a++)
      for (let j = 0; j < k; j++) if (Number.isNaN(hs[a * k + j])) missing[j] = 1;
  }
  const first = missing.indexOf(1);
  if (first < 0) return null;
  return d[Math.max(first - 1, 0)];
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

/** Full per-site computation: primary bands, fallback bands, site height, mask. */
export async function computeSiteMask(
  latDeg: number,
  lonDeg: number,
  samplers: Samplers,
  opts: { nAz?: number; mastM?: number } = {},
): Promise<{ mask: Float64Array; siteHeightM: number; bands: BandInfo[]; fallbackBands: BandInfo[] }> {
  const nAz = opts.nAz ?? 720;
  const bands = bandsForSite(latDeg, samplers);
  const fallback = await fallbackBands(latDeg, lonDeg, bands, samplers, nAz);
  const h = await siteHeightM(latDeg, lonDeg, bands.map((b) => b.sampler));
  const mask = await horizonMask(latDeg, lonDeg, [...bands, ...fallback], { nAz, mastM: opts.mastM ?? 2, siteHeightM: h });
  return { mask, siteHeightM: h, bands: bands.map((b) => info(b, samplers)), fallbackBands: fallback.map((b) => info(b, samplers)) };
}
