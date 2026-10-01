import type { Site } from '../data/loaders';
import { R_MOON_KM } from '../engine/constants';

const DEG = Math.PI / 180;

/**
 * Where a point falls on the relief picture of the south pole, as fractions of its width and height
 * from the top left: south polar stereographic, the pole at the centre, longitude 0 straight up,
 * `halfKm` from the centre to an edge. The same projection as `pipeline/lunar_pipeline/home_assets.py`.
 */
export function reliefUV(lat: number, lon: number, halfKm: number): { u: number; v: number } {
  const rho = 2 * R_MOON_KM * Math.tan(((90 + lat) / 2) * DEG);
  return { u: 0.5 + (rho * Math.sin(lon * DEG)) / (2 * halfKm), v: 0.5 - (rho * Math.cos(lon * DEG)) / (2 * halfKm) };
}

/** Great-circle distance on the Moon, in kilometres. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MOON_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The catalogue sites nearest to a site, nearest first; never the site itself, never a custom place. */
export function nearestSites(site: Site, sites: Site[], count: number): { site: Site; km: number }[] {
  return sites
    .filter((s) => s.id !== site.id && s.category !== 'custom')
    .map((s) => ({ site: s, km: distanceKm(site, s) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
