import { normalizeLon } from '../engine/geometry';

export type PickResult = { ok: true; lat: number; lon: number } | { ok: false; message: string };

/** Validates a clicked lat/lon before any tile fetch: the LOLA polar grids stop at 60°S. */
export function checkPick(lat: number, lon: number): PickResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, message: 'pick a point on the Moon' };
  if (lat > -60) return { ok: false, message: `no DEM coverage north of 60S (lat ${lat.toFixed(2)})` };
  return { ok: true, lat, lon: normalizeLon(lon) };
}
