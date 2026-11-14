import { fetchJson } from '../data/loaders';

/**
 * Terrain versions written by `pipeline/lunar_pipeline/ensemble.py` into data/ensemble/<site>.json: the ground at a polar
 * site drawn many times from the error model fitted to two generations of NASA's south-pole heights, each version traced
 * to a skyline (720 directions from north, clockwise) with the pipeline's own march, as int16 thousandths of a degree.
 */
export interface VersionsDoc {
  site_id: string;
  n_versions: number;
  n_az: number;
  az0_deg: number;
  az_step_deg: number;
  mast_m: number;
  scale_deg: number;
  site_height_adjusted_m: number;
  /** Product 90's own skyline, the versions' centre, one row. */
  adjusted: string;
  /** Every version, one row of `n_az` after another. */
  versions: string;
}

/** A site's versions ready for the engine: one skyline per version, and product 90's own. */
export interface SiteVersions {
  siteId: string;
  mastM: number;
  adjusted: Float64Array;
  masks: Float64Array[];
}

/** Rows of int16 numbers in base64 (little-endian), each `nAz` long, times `scale`. */
export function decodeRows(b64: string, nAz: number, scale: number): Float64Array[] {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const n = bin.length >> 1;
  const rows: Float64Array[] = [];
  for (let r = 0; r * nAz < n; r++) {
    const row = new Float64Array(nAz);
    for (let i = 0; i < nAz; i++) {
      const k = 2 * (r * nAz + i);
      let v = bin.charCodeAt(k) | (bin.charCodeAt(k + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      row[i] = v * scale;
    }
    rows.push(row);
  }
  return rows;
}

export function versionsFrom(doc: VersionsDoc): SiteVersions {
  return {
    siteId: doc.site_id,
    mastM: doc.mast_m,
    adjusted: decodeRows(doc.adjusted, doc.n_az, doc.scale_deg)[0],
    masks: decodeRows(doc.versions, doc.n_az, doc.scale_deg),
  };
}

/** The index beside the versions: the fitted error model and, for each site, how widely its versions spread. */
export interface EnsembleIndex {
  version: 1;
  generated_utc: string;
  versions_per_site: number;
  mast_m: number;
  source: string;
  model: Record<string, {
    scale_m: number;
    sigma: { a_m: number; b_m: number; c: number };
    length_m: number;
    within_1_sigma: number;
    within_2_sigma: number;
    difference_rms_m: { median: number; min: number; max: number };
    stated_error_rms_m: { median: number; min: number; max: number };
    difference_over_stated_error: { median: number };
    slow_rise: number | null;
  }>;
  method: string;
  not_captured: string;
  bytes: number;
  sites: {
    site_id: string;
    file: string;
    bytes: number;
    sd_deg: { median: number; p95: number; max: number };
    p05_p95_width_deg: { median: number; p95: number };
    mean_minus_adjusted_deg: { median: number; p95_abs: number };
    adjusted_inside_p05_p95: number;
    app_inside_p05_p95?: number;
    app_inside_min_max?: number;
    app_minus_adjusted_p95_abs_deg?: number;
    stated_sigma_deg?: { median: number; p95: number };
    sd_over_stated_sigma?: { median: number };
    site_height_sd_m: number;
  }[];
}

/** The sites that have versions, by id: only the polar catalogue sites do. */
export function hasVersions(index: EnsembleIndex | null, siteId: string): boolean {
  return !!index?.sites.some((s) => s.site_id === siteId);
}

export async function loadEnsembleIndex(base: string): Promise<EnsembleIndex> {
  return fetchJson<EnsembleIndex>(`${base}/ensemble/index.json`);
}

/** One load per site and page view; a failed load is tried again next time. */
const loaded = new Map<string, Promise<SiteVersions>>();
export function loadVersions(base: string, siteId: string): Promise<SiteVersions> {
  const key = `${base}|${siteId}`;
  let p = loaded.get(key);
  if (!p) {
    p = fetchJson<VersionsDoc>(`${base}/ensemble/${siteId}.json`).then(versionsFrom);
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}
