import { fetchJson } from './loaders';

/** Shapes written by `pipeline/lunar_pipeline/validate.py` into data/validation/. */

export interface HorizonsCompareRow {
  utc: string;
  az_jpl: number;
  el_jpl: number;
  az_ours: number;
  el_ours: number;
}

export interface HorizonsSiteDoc {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  body: 'SUN' | 'EARTH';
  query_url: string;
  n_rows: number;
  max_abs_delta_el_deg: number;
  max_abs_delta_az_cos_el_deg: number;
  rows: HorizonsCompareRow[];
}

export interface HorizonsDoc {
  generated_utc: string;
  n_rows: number;
  max_abs_delta_el_deg: number;
  max_abs_delta_az_cos_el_deg: number;
  sites: HorizonsSiteDoc[];
}

export interface MazaricoRow {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  covered: boolean;
  ours_fraction?: number;
  map_fraction?: number;
  delta_points?: number;
}

export interface MazaricoDoc {
  generated_utc: string;
  period: [string, string];
  product: string;
  rows: MazaricoRow[];
}

export interface BackcastRow {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  landed_utc: string;
  mission_end_utc: string | null;
  mission_end_source: string | null;
  mission_note: string | null;
  skyline: 'lola' | 'flat';
  sun_el_at_landing_deg: number;
  sunset_utc: string | null;
  sunrise_utc: string | null;
  daylight_hours_after_landing: number | null;
  end_minus_sunset_h: number | null;
}

export interface BackcastsDoc {
  generated_utc: string;
  rows: BackcastRow[];
}

export interface ValidationDocs {
  horizons: HorizonsDoc;
  mazarico: MazaricoDoc;
  backcasts: BackcastsDoc;
}

export async function loadValidation(base: string): Promise<ValidationDocs> {
  const [horizons, mazarico, backcasts] = await Promise.all([
    fetchJson<HorizonsDoc>(`${base}/validation/horizons.json`),
    fetchJson<MazaricoDoc>(`${base}/validation/mazarico.json`),
    fetchJson<BackcastsDoc>(`${base}/validation/backcasts.json`),
  ]);
  return { horizons, mazarico, backcasts };
}
