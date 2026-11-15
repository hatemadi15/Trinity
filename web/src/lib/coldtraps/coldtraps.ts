import { fetchJson } from '../data/loaders';

/**
 * The modelled cold traps near each polar site, written by `pipeline/lunar_pipeline/coldtraps.py` into
 * data/coldtraps/coldtraps.json: from LRO Diviner's polar resource product (Paige et al. 2010) and NASA's adjusted
 * south-pole maps (PGDA product 90), how much ground within 1 and 5 km stays below 110 K all year, where the model
 * would let ice last at the surface or within half a metre, the permanent shadow, and the nearest such ground with
 * the steepest slope on a straight line there. Modelled conditions, never a finding of ice: the words below say so.
 */

export interface ColdTrapAreas {
  /** The share of the circle the model covers (under 1 only at the edge of its square, near 80° S). */
  covered_share: number;
  below_110K_km2: number;
  below_100K_km2: number;
  below_120K_km2: number;
  /** Ice stable to sublimation at the surface: the product's -1 (below 101.3 K all year) or a depth of 0. */
  ice_surface_km2: number;
  ice_surface_all_year_km2: number;
  ice_within_0_5m_km2: number;
  ice_within_1m_km2: number;
  psr_km2: number;
}

export interface ColdTrapNearest {
  km: number;
  /** The steepest 20 m slope crossed on a straight line from the site. */
  slope_max_deg: number | null;
}

export type NearestKind = 'below_110K' | 'ice_surface' | 'ice_within_0_5m' | 'psr';

export interface ColdTrapSite {
  site_id: string;
  name: string;
  label?: string | null;
  lat: number;
  lon: number;
  kind?: string | null;
  /** False for a polar site north of 80° S, which the model does not reach. */
  covered: boolean;
  reason?: string;
  within_km?: Record<string, ColdTrapAreas>;
  nearest?: Record<NearestKind, ColdTrapNearest | null>;
  coldest_within_5km_K?: number | null;
  cold_in_psr_share_5km?: number | null;
  psr_cold_share_5km?: number | null;
  at_site?: { tmax_K: number | null; tavg_K: number | null; ice_depth_m: number | null; ice: string | null };
}

export interface ColdTrapDoc {
  version: 1;
  generated_utc: string;
  thresholds?: { cold_K: number; also_K: number[]; depths_m: number[]; radii_km: number[]; search_km: number };
  sites: ColdTrapSite[];
}

/** A site's cold ground as rows of bits over its terrain window (row 0 at the top, most significant bit first). */
export interface ColdOverlayEntry {
  site_id: string;
  /** The polar stereographic corner of the first cell (its left and top edges), in metres. */
  x0_m: number;
  y0_m: number;
  cell_m: number;
  width: number;
  height: number;
  bits: string;
}

export interface ColdOverlayDoc {
  version: 1;
  cold_K: number;
  sites: ColdOverlayEntry[];
}

export async function loadColdTraps(base: string): Promise<ColdTrapDoc> {
  return fetchJson<ColdTrapDoc>(`${base}/coldtraps/coldtraps.json`);
}

export async function loadColdOverlay(base: string): Promise<ColdOverlayDoc> {
  return fetchJson<ColdOverlayDoc>(`${base}/coldtraps/overlay.json`);
}

export function coldTrapSite(doc: ColdTrapDoc | null, siteId: string): ColdTrapSite | null {
  return doc?.sites.find((s) => s.site_id === siteId) ?? null;
}

export function overlayFor(doc: ColdOverlayDoc | null, siteId: string): ColdOverlayEntry | null {
  return doc?.sites.find((s) => s.site_id === siteId) ?? null;
}

const NBSP = ' ';
/** The ground within 5 km: the circle's whole area, so "all of it" can be said when the model has it all cold. */
const CIRCLE_5_KM2 = Math.PI * 25;
/** Nearer than this, the cold ground is the site's own: the model's triangles are about 500 m across. */
const AT_SITE_KM = 0.05;
const COLD = `below 110${NBSP}K (−163${NBSP}°C) all year`;
const MODEL = 'in NASA’s Diviner temperature model';
const area = (km2: number) => (km2 < 0.05 ? `under 0.1${NBSP}km²` : `${km2.toFixed(1)}${NBSP}km²`);
const away = (km: number) => `${km < 10 ? km.toFixed(1) : Math.round(km)}${NBSP}km away`;

/**
 * One line on the cold traps near a site, where the site is described (Explore's "Where on the Moon", the brief):
 * the ground within 5 km that stays below 110 K all year in Diviner's model, the nearest such ground and the
 * steepest slope on a straight line there. Ice appears only as "conditions where ice could last". With `full`, the
 * ground where ice could last within half a metre of the surface, and what the figures do not show. Null for a site
 * the layer does not list (one away from the pole).
 */
export function coldTrapWords(c: ColdTrapSite | null, { full = false }: { full?: boolean } = {}): string | null {
  if (!c) return null;
  if (!c.covered) return 'NASA’s Diviner model of the polar cold traps ends near 80° S, so it does not reach this site.';
  const w5 = c.within_km?.['5'];
  if (!w5) return null;
  const near = c.nearest?.below_110K ?? null;
  const cold = w5.below_110K_km2;
  let text: string;
  if (cold <= 0) {
    text = near
      ? `Modelled cold traps: no ground within 5${NBSP}km stays ${COLD} ${MODEL}; the nearest that does, with conditions where ice could last, is ${away(near.km)}.`
      : `Modelled cold traps: no ground within 10${NBSP}km stays ${COLD} ${MODEL}, so none has conditions where ice could last on the surface.`;
  } else if (cold >= 0.995 * CIRCLE_5_KM2) {
    text = `Modelled cold traps: all the ground within 5${NBSP}km stays ${COLD} ${MODEL}, conditions where ice could last.`;
  } else {
    text = `Modelled cold traps: within 5${NBSP}km, ${area(cold)} stays ${COLD} ${MODEL}, conditions where ice could last`;
    if (near && near.km >= AT_SITE_KM) {
      const slope = near.slope_max_deg !== null ? `, with slopes up to ${Math.round(near.slope_max_deg)}° on a straight line there` : '';
      text += `; the nearest is ${away(near.km)}${slope}.`;
    } else text += ', the site itself included.';
  }
  if (!full) return text;
  const half = w5.ice_within_0_5m_km2;
  const buried = half > 0 ? `On ${area(half)} within 5${NBSP}km, ice could last at the surface or within half a metre below it.` : `Within 5${NBSP}km, no ground has conditions where ice could last within half a metre of the surface.`;
  return `${text} ${buried} These are modelled conditions where ice could last, not a finding that any is there, how much or how deep.`;
}

/** The cold ground within 5 km in one phrase, for a row of the site list; null where the layer has no figures. */
export function coldTrapShort(c: ColdTrapSite | null): string | null {
  const w5 = c?.covered ? c.within_km?.['5'] : undefined;
  if (!w5) return null;
  const cold = w5.below_110K_km2;
  const tail = cold <= 0 ? `none within 5${NBSP}km` : cold >= 0.995 * CIRCLE_5_KM2 ? `all the ground within 5${NBSP}km` : `${area(cold)} within 5${NBSP}km`;
  return `Modelled cold traps: ${tail}`;
}

/** The mask's cells, row-major: 1 where the model keeps the ground below 110 K all year. */
export function decodeMask(entry: ColdOverlayEntry): Uint8Array {
  const bytes = Uint8Array.from(atob(entry.bits), (ch) => ch.charCodeAt(0));
  const out = new Uint8Array(entry.width * entry.height);
  for (let i = 0; i < out.length; i++) out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  return out;
}

/** The geometry of a terrain window, as its meta file gives it (lib/data/terrain). */
export interface WindowGeo {
  cell_m: number;
  width: number;
  height: number;
  row0: number;
  col0: number;
  line_offset_px: number;
  sample_offset_px: number;
}

/**
 * Where the layer sits on a terrain window's picture, as fractions of its width and height from its top-left
 * corner: window pixel (col, row) is centred at x = (col0 + col - sample_offset) cell, y = (line_offset - row0 - row) cell.
 */
export function overlayRect(entry: ColdOverlayEntry, w: WindowGeo): { left: number; top: number; width: number; height: number } {
  const left = (w.col0 - 0.5 - w.sample_offset_px) * w.cell_m;
  const top = (w.line_offset_px - w.row0 + 0.5) * w.cell_m;
  const across = w.width * w.cell_m;
  const down = w.height * w.cell_m;
  return { left: (entry.x0_m - left) / across, top: (top - entry.y0_m) / down, width: (entry.width * entry.cell_m) / across, height: (entry.height * entry.cell_m) / down };
}
