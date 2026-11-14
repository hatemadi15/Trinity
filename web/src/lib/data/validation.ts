import { fetchJson } from './loaders';

/** Shapes written by `pipeline/lunar_pipeline/validate.py` into data/validation/. */

/**
 * What a piece of evidence establishes, the rule it is held to, what it was tested on and what it leaves out, in the
 * pipeline's technical words (the Accuracy page says the same in plain words). Context has no rule: `criteria` is null.
 */
export interface Evidence<C = Record<string, unknown>> {
  kind: 'check' | 'context';
  title: string;
  establishes: string;
  criteria: ({ rule: string } & Record<string, string | number>) | null;
  limitations: string[];
  coverage: C;
  meets_criteria?: boolean;
  command: string;
  can_tell?: string[];
  cannot_tell?: string[];
  /** The assumptions the comparison could not match, one sentence each (the LOLA maps). */
  unmatched?: string[];
}

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

export interface HorizonsCoverage {
  rows: number;
  sites: string[];
  bodies: string[];
  epochs: number;
  first_utc: string;
  last_utc: string;
  step: string;
  on_whole_hours: boolean;
}

export interface HorizonsDoc {
  generated_utc: string;
  n_rows: number;
  max_abs_delta_el_deg: number;
  max_abs_delta_az_cos_el_deg: number;
  evidence: Evidence<HorizonsCoverage> & {
    reference: { name: string; url: string; settings: string };
    ours: { table: string; frame: string; abcorr: string; kernels: string[]; interpolation: string };
  };
  sites: HorizonsSiteDoc[];
}

/** One site against the LOLA Sun map, step by step from the app's own share to the map's definitions (shares of hours, 0 to 1). */
export interface SunCompare {
  /** As the app computes: 2 m mast, 20 to 240 m terrain, hourly 2024 to 2036, any part of the disc. */
  app: number;
  /** The observer on the ground. */
  surface: number;
  /** And hourly over one 18.6-year cycle. */
  cycle: number;
  /** And on 60 m terrain at the map's four pixel centres: the equivalent of the map. */
  matched: number;
  /** The mean visible fraction of the disc, matched otherwise: the other reading of "average illumination". */
  matched_disc_mean: number;
  map: number;
  /** matched minus map, in percentage points. */
  gap_points: number;
  /** app minus map, in percentage points. */
  app_gap_points: number;
  map_pixels: number[];
  matched_pixels: number[];
}

/** One site against the LOLA Earth map: the app's rule (Earth's centre) and the map's (any part of Earth's disc). */
export interface EarthCompare {
  app_centre: number;
  matched_any: number;
  matched_centre: number;
  map: number;
  gap_points: number;
  app_gap_points: number;
  map_pixels: number[];
  matched_pixels: number[];
}

export interface MazaricoRow {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  covered: boolean;
  /** The app's own share and the map's at the site, and their gap in points (the home page's figure). */
  ours_fraction?: number;
  map_fraction?: number;
  delta_points?: number;
  sun?: SunCompare;
  earth?: EarthCompare;
  note?: string;
}

export interface MapLabel {
  file: string;
  url: string;
  product_id: string;
  product_version_id: string;
  product_creation_time: string;
  start_time: string;
  stop_time: string;
  description: string;
  map_scale: string;
  map_projection_type: string;
  coordinate_system_name: string;
  label_sha256: string;
  [key: string]: string | null;
}

export interface MazaricoCoverage {
  sites: number;
  polar_sites: number;
  outside_map: string[];
  app_span: [string, string];
  app_hours: number;
  matched_span: [string, string];
  matched_hours: number;
  points_per_site: number;
}

export interface BodySummary {
  median_abs_gap_points: number | null;
  within_agreement: number;
  within_2_points: number;
  worst_site_id: string | null;
  worst_gap_points: number | null;
  app_median_abs_gap_points: number | null;
  disc_mean_median_gap_points?: number | null;
  centre_median_gap_points?: number | null;
  span_effect_max_points?: number | null;
  mast_effect_median_points?: number | null;
}

export interface MazaricoDoc {
  generated_utc: string;
  /** The app's own span, hourly. */
  period: [string, string];
  product: string;
  evidence: Evidence<MazaricoCoverage>;
  reference: { sun: MapLabel; earth: MapLabel; definition: string; averaging: string; observer: string; terrain: string; method: string; sources: string[] };
  summary: { sites: number; sun: BodySummary; earth: BodySummary; meets_criteria: boolean };
  rows: MazaricoRow[];
}

export interface PowerCaseInputs {
  hours: number;
  sun_az: number[];
  sun_el: number[];
  sun_fraction: number[];
  sun_au: number[];
  config: { panel: 'horizontal' | 'vertical' | 'vertical_tracking' | 'full_tracking'; panel_azimuth_deg: number; area_m2: number; efficiency: number; load_w: number; battery_wh: number; initial_soc_fraction: number };
}

export interface PowerAnswer {
  power_w: number[];
  energy_wh: number[];
  brownout_hours: number;
  first_brownout_hour: number | null;
  soc_min: number;
}

/** A worked case: its inputs, the answer by hand formula and the pipeline's; the app's own is worked out in the browser. */
export interface PowerCase {
  id: string;
  words: string;
  hand: string;
  inputs: PowerCaseInputs;
  expected: PowerAnswer;
  pipeline: PowerAnswer;
  max_abs_diff_w: number;
  max_abs_diff_wh: number;
  agrees: boolean;
}

export interface RecordedRun {
  file: string;
  site_id: string;
  start_utc: string;
  days: number;
  hours: number;
  panel: string;
  sample_hours: number;
  max_abs_diff_w: number;
  max_abs_diff_wh: number;
  agrees: boolean;
}

export interface PowerCoverage {
  cases: number;
  case_hours: number;
  panels: string[];
  recorded_runs: number;
  recorded_sites: string[];
  recorded_hours: number;
}

export interface PowerDoc {
  generated_utc: string;
  evidence: Evidence<PowerCoverage> & { criteria: { rule: string; tolerance_w: number; tolerance_wh: number } };
  summary: { cases_agreeing: number; runs_agreeing: number; max_abs_diff_w: number; max_abs_diff_wh: number };
  cases: PowerCase[];
  recorded_runs: RecordedRun[];
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
  evidence: Evidence<{ missions: number; landed_utc: Record<string, string> }>;
  rows: BackcastRow[];
}

/** The share of a picture's ground called lit or dark alike, and how much of each kind the app found; null where the picture has none of that kind. */
export interface PictureScores {
  agree: number;
  light_found: number | null;
  shadow_found: number | null;
  shadow_confirmed: number | null;
  app_lit: number;
}

/** One picture against the app's shadows at the moment it was taken (`pipeline/lunar_pipeline/images.py`). */
export interface PictureRow extends PictureScores {
  site_id: string;
  camera: 'WAC' | 'NAC';
  picture: string;
  observation: string;
  start_utc: string;
  stop_utc: string;
  mid_utc: string;
  sun_az_deg: number;
  sun_el_deg: number;
  data_share: number;
  bearing_deg: number;
  picture_px_m: number;
  app_px_m: number;
  picture_pixels: number;
  pixels: number;
  km2: number;
  brightness_scale: number;
  brightness_scale_picture_alone: number;
  seen_lit: number;
  majority: number;
  disagree_on_edges: number | null;
  agree_away_from_edges: number;
  away_from_edges_share: number;
  agree_at_quarter_sunlight: number;
  agree_at_three_quarters_sunlight: number;
  best_offset_m: [number, number];
  agree_at_best_offset: number;
  agree_sun_turned_90: number;
  /** The same picture against the same sweep over product 90's adjusted terrain. */
  product90: PictureScores;
}

/** How the frames were picked at one site. */
export interface PictureSite {
  site_id: string;
  name: string;
  lat: number;
  lon: number;
  app_px_m: number;
  map_km: number;
  candidates: number;
  covered: number;
  sun_high_enough: number;
  rejected_for_gaps: string[];
  pictures: number;
}

export interface PicturesCoverage {
  sites: string[];
  pictures: number;
  wac_pictures: number;
  nac_pictures: number;
  pixels: number;
  km2: number;
  first_utc: string | null;
  last_utc: string | null;
  sun_el_deg: [number, number] | null;
  period: [string, string];
  min_sun_el_deg: number;
  min_data_share: number;
}

export interface PicturesDoc {
  generated_utc: string;
  evidence: Evidence<PicturesCoverage> & { criteria: { rule: string; min_agree: number; min_found: number } };
  method: Record<string, string>;
  sources: string[];
  downloads: Record<string, number | string[]>;
  summary: Record<string, number | null>;
  rows: PictureRow[];
  sites: PictureSite[];
}

export interface ValidationDocs {
  horizons: HorizonsDoc;
  mazarico: MazaricoDoc;
  power: PowerDoc;
  backcasts: BackcastsDoc;
  /** Shadows against camera pictures; absent from a data folder made before that check. */
  images?: PicturesDoc;
}

export async function loadValidation(base: string): Promise<ValidationDocs> {
  const [horizons, mazarico, power, backcasts, images] = await Promise.all([
    fetchJson<HorizonsDoc>(`${base}/validation/horizons.json`),
    fetchJson<MazaricoDoc>(`${base}/validation/mazarico.json`),
    fetchJson<PowerDoc>(`${base}/validation/power.json`),
    fetchJson<BackcastsDoc>(`${base}/validation/backcasts.json`),
    // The pictures' check came later: a folder without it still shows the other four.
    fetchJson<PicturesDoc>(`${base}/validation/images.json`).catch(() => undefined),
  ]);
  return images ? { horizons, mazarico, power, backcasts, images } : { horizons, mazarico, power, backcasts };
}
