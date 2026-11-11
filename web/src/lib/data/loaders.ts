import { loadEphemeris, type Ephemeris, type EphemerisHeader } from '../engine/ephemeris';
import type { TileManifest } from '../engine/tiles';

export interface Site {
  id: string;
  name: string;
  /** Short display name for lists, titles and map pins; `name` stays the formal catalogue name. */
  label?: string;
  /** One plain line that says what the place is. */
  blurb?: string;
  lat: number;
  lon: number;
  category: string;
  polar: boolean;
  source: string;
  /** True when the coordinate is a digitised region centre, not a surveyed point. */
  approximate?: boolean;
  landed_utc?: string;
  /** Reported end of a landed mission (UTC) and where the date comes from. */
  mission_end_utc?: string;
  mission_end_source?: string;
  /** One or two sentences on how the mission ended, for the backcast table. */
  mission_note?: string;
}

/** The name to show: the short label when the catalogue has one. */
export function siteLabel(site: Pick<Site, 'name' | 'label'>): string {
  return site.label ?? site.name;
}

export interface MaskDoc {
  site_id: string;
  lat: number;
  lon: number;
  mast_m: number;
  site_height_m: number;
  elevation_deg: number[];
  bands: { grid: string; r_min_m: number; r_max_m: number; step_m: number }[];
  fallback_bands: { grid: string; r_min_m: number; r_max_m: number; step_m: number }[];
}

export class DataError extends Error {
  readonly name = 'DataError';
  constructor(readonly url: string, readonly status: number) {
    super(`could not load ${url} (HTTP ${status})`);
  }
}

// The data base lives in ./base; re-exported so importers keep the '@/lib/data/loaders' path.
export { dataBase } from './base';

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new DataError(url, res.status);
  return res;
}

export async function fetchJson<T>(url: string): Promise<T> {
  return (await get(url)).json() as Promise<T>;
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await get(url)).arrayBuffer());
}

export async function loadSites(base: string): Promise<Site[]> {
  // Both lists are asked for at once, so the page waits for one round trip, not two. The derived list may be
  // missing (a 404 leaves it out); any other failure of either list is reported.
  const [featured, derived] = await Promise.all([
    fetchJson<{ sites: Site[] }>(`${base}/sites.json`),
    fetchJson<{ sites: Site[] }>(`${base}/sites_derived.json`).then(
      (doc) => doc.sites,
      (err: unknown) => {
        if (err instanceof DataError && err.status === 404) return [];
        throw err;
      },
    ),
  ]);
  return [...featured.sites, ...derived];
}

export async function loadEphemerisFromUrl(base: string): Promise<Ephemeris> {
  // The header and the table are asked for at once; the table is checked against the header once both are in.
  const [header, bytes] = await Promise.all([
    fetchJson<EphemerisHeader>(`${base}/ephemeris/moon_me_2024_2036_1h.json`),
    fetchBytes(`${base}/ephemeris/moon_me_2024_2036_1h.f32`),
  ]);
  return loadEphemeris(bytes, header);
}

export async function loadMask(base: string, siteId: string): Promise<MaskDoc> {
  return fetchJson<MaskDoc>(`${base}/masks/${siteId}.json`);
}

export async function loadManifest(base: string): Promise<TileManifest> {
  return fetchJson<TileManifest>(`${base}/tiles/manifest.json`);
}
