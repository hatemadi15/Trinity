import { interpVectors, type Ephemeris } from '../engine/ephemeris';
import { azElFromBodyVector } from '../engine/geometry';
import { utcToEt } from '../engine/time';
import type { HorizonsBody, HorizonsRow } from './query';

export type RecheckResult =
  | { ok: true; worstEl: number; worstAzCosEl: number; n: number; ms: number }
  | { ok: false; message: string };

const D2R = Math.PI / 180;

/**
 * Asks the Horizons proxy for the given epochs (one query: first epoch to last, `epochs − 1`
 * intervals) and compares every returned row with our ephemeris. Never throws: an unreachable or
 * failing service comes back as `{ ok: false, message }` so the page can fall back to the stored table.
 */
export async function recheckSite(
  site: { lat: number; lon: number },
  body: HorizonsBody,
  epochsUtc: string[],
  eph: Ephemeris,
  fetchImpl: typeof fetch = fetch,
): Promise<RecheckResult> {
  const t0 = Date.now();
  try {
    if (epochsUtc.length < 2) return { ok: false, message: 'at least two epochs are needed' };
    const query = new URLSearchParams({
      lat: String(site.lat),
      lon: String(site.lon),
      body,
      start: epochsUtc[0],
      stop: epochsUtc[epochsUtc.length - 1],
      step: String(epochsUtc.length - 1),
    });
    const res = await fetchImpl(`/api/horizons?${query.toString()}`);
    const json = (await res.json().catch(() => ({}))) as { rows?: HorizonsRow[]; error?: string };
    if (!res.ok || !json.rows) return { ok: false, message: json.error ?? `HTTP ${res.status}` };
    let worstEl = 0;
    let worstAz = 0;
    let n = 0;
    for (const row of json.rows) {
      const v = interpVectors(eph, utcToEt(row.utc));
      const { az, el } = azElFromBodyVector(body === 'SUN' ? v.sun : v.earth, site.lat, site.lon, 0);
      const daz = ((az - row.az + 540) % 360) - 180;
      worstAz = Math.max(worstAz, Math.abs(daz * Math.cos(row.el * D2R)));
      worstEl = Math.max(worstEl, Math.abs(el - row.el));
      n++;
    }
    if (n === 0) return { ok: false, message: 'JPL returned no rows' };
    return { ok: true, worstEl, worstAzCosEl: worstAz, n, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
