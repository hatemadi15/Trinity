import { AU_KM } from '../engine/constants';
import { diskFraction, sunRadiusDeg, type Series } from '../engine/metrics';
import doc from './home.json';

/** Written by `uv run python -m lunar_pipeline.cli home-assets` (pipeline/lunar_pipeline/home_assets.py). */
export interface HomeDoc {
  generated_utc: string;
  /** The hero site and its picture. */
  /** `wide_image` is the same hour's shadows `wide_km` across, round the same point: the descent dives through it. */
  hero: { site_id: string; name: string; image: string; frame_utc: string; window_km: number; sun_bearing_deg: number; lit_fraction: number; wide_image: string; wide_km: number };
  sky: {
    start_utc: string;
    hours: number;
    sun_az: number[];
    sun_el: number[];
    hill_el: number[];
    lit: number[];
    sunlit_pct: number;
    earth_az: number[];
    earth_el: number[];
    earth_hill_el: number[];
    earth_visible: number[];
    earth_pct: number;
    night: { sunset_hour: number; sunrise_hour: number; hours: number } | null;
    /** The Sun's distance from the Moon's centre (AU), hour by hour, as the engine's sunAu. */
    sun_au: number[];
  };
  /** The hero site's skyline: the hills' height (degrees, to 0.01°) in each direction from `az0` (north), clockwise, `step` degrees apart. */
  mask: { az0: number; step: number; el: number[] };
  pair: { site_sun_pct: number; rim_site_id: string; rim_sun_pct: number; distance_km: number };
  /**
   * The crater rim's summit beside the hero site (the pair's rim), for the drawing of the hills: the Sun's direction and
   * height there hour by hour over the same month, whether it is sunlit, and its own skyline.
   */
  rim: { site_id: string; sun_az: number[]; sun_el: number[]; lit: number[]; sunlit_pct: number; mask: { az0: number; step: number; el: number[] } };
  facts: {
    horizons_worst_el_deg: number;
    horizons_rows: number;
    sun_disc_ratio: number;
    mazarico_median_points: number;
    mazarico_sites: number;
    mazarico_within5: number;
    mazarico_worst_points: number;
    blue_ghost_end_minus_sunset_h: number;
  };
  relief: { image: string; half_km: number; sites: { id: string; u: number; v: number }[] };
  /** What the default lander's battery does at the hero site over the charted month (pipeline: battery_facts). */
  battery: {
    lander: { panel: string; panel_azimuth_deg: number; area_m2: number; efficiency: number; load_w: number; battery_wh: number; initial_soc_fraction: number };
    now_hours: number;
    best_hour: number | null;
    best_hours: number | null;
    /** The share of the best landing's hours with power that have Earth in view. */
    best_earth_fraction: number | null;
  };
}

export const HOME = doc as HomeDoc;

/**
 * The hero month as the engine's hourly series, from the pipeline's figures (angles to 0.01°): the home page's
 * answer is worked out from it. Whether any of the Sun shows is the pipeline's flag, as it is for Earth: rounded to
 * 0.01°, the angles alone would leave a sliver of the Sun in the hour it goes behind the hills. How much of its
 * disc shows over the hills is the engine's own rule.
 */
export function heroSeries(doc: HomeDoc = HOME): Series {
  const s = doc.sky, n = s.hours;
  const f64 = (a: number[]) => Float64Array.from(a.slice(0, n));
  const sunFraction = new Float64Array(n);
  for (let h = 0; h < n; h++) sunFraction[h] = s.lit[h] === 1 ? diskFraction(s.sun_el[h] - s.hill_el[h], sunRadiusDeg(s.sun_au[h] * AU_KM)) : 0;
  return { i0: 0, hours: n, sunAz: f64(s.sun_az), sunEl: f64(s.sun_el), earthAz: f64(s.earth_az), earthEl: f64(s.earth_el), sunFraction, earthVisible: Uint8Array.from(s.earth_visible.slice(0, n)), sunAu: f64(s.sun_au) };
}

/** The hero site's skyline, 720 directions from north, clockwise. */
export function heroMask(doc: HomeDoc = HOME): Float64Array {
  return Float64Array.from(doc.mask.el);
}

/** A tiny angle with five decimals: 2.7e-5 reads "0.00003°". */
export function degreesText(deg: number): string {
  return `${deg.toFixed(5)}°`;
}

/** A large count rounded to the nearest thousand, with a comma: 19741 reads "20,000". */
export function thousandsText(n: number): string {
  const k = Math.max(1, Math.round(n / 1000));
  return `${k.toLocaleString('en-US')},000`;
}

/**
 * Three real places, in the order of the list on the home page: the ridge in the picture first, then
 * the two landers. Each opens Explore on the site and, for a mission, the first whole hour after it landed.
 */
export const PLACES: { title: string; outcome: string; tone: 'good' | 'bad' | 'plain'; body: string; href: string }[] = [
  {
    title: 'de Gerlache Rim 2',
    outcome: 'Shortlisted for a crewed landing',
    tone: 'plain',
    body: 'One of nine regions NASA shortlisted in 2024 for its first crewed Artemis landing.',
    href: '/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30',
  },
  {
    title: 'Athena lander, March 2025',
    outcome: 'Ended after one day',
    tone: 'bad',
    body: "Intuitive Machines' Athena ended on its side in a crater, short of light.",
    href: '/explore?site=im2_athena&start=2025-03-06T18:00&days=30',
  },
  {
    title: 'Blue Ghost lander, March 2025',
    outcome: 'Worked all 14 days',
    tone: 'good',
    body: "Firefly Aerospace's Blue Ghost, far from the pole: two weeks of sunlight, Earth always in view.",
    href: '/explore?site=blue_ghost_m1&start=2025-03-02T09:00&days=30',
  },
];
