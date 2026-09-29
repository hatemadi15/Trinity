import { loadEphemeris, type Ephemeris, type EphemerisHeader } from '../engine/ephemeris';
import type { TileManifest } from '../engine/tiles';

export interface Site {
  id: string;
  name: string;
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

export function dataBase(): string {
  return process.env.NEXT_PUBLIC_DATA_BASE ?? '/data';
}

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
  const featured = await fetchJson<{ sites: Site[] }>(`${base}/sites.json`);
  let derived: Site[] = [];
  try {
    derived = (await fetchJson<{ sites: Site[] }>(`${base}/sites_derived.json`)).sites;
  } catch (err) {
    if (!(err instanceof DataError && err.status === 404)) throw err;
  }
  return [...featured.sites, ...derived];
}

export async function loadEphemerisFromUrl(base: string): Promise<Ephemeris> {
  const header = await fetchJson<EphemerisHeader>(`${base}/ephemeris/moon_me_2024_2036_1h.json`);
  const bytes = await fetchBytes(`${base}/ephemeris/moon_me_2024_2036_1h.f32`);
  return loadEphemeris(bytes, header);
}

export async function loadMask(base: string, siteId: string): Promise<MaskDoc> {
  return fetchJson<MaskDoc>(`${base}/masks/${siteId}.json`);
}

export async function loadManifest(base: string): Promise<TileManifest> {
  return fetchJson<TileManifest>(`${base}/tiles/manifest.json`);
}
