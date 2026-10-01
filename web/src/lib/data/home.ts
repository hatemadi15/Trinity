import doc from './home.json';

/** Written by `uv run python -m lunar_pipeline.cli home-assets` (pipeline/lunar_pipeline/home_assets.py). */
export interface HomeDoc {
  generated_utc: string;
  hero: { site_id: string; name: string; image: string; frame_utc: string; window_km: number; sun_bearing_deg: number; lit_fraction: number };
  sky: { start_utc: string; hours: number; sun_az: number[]; sun_el: number[]; hill_el: number[]; lit: number[]; sunlit_pct: number; night: { sunset_hour: number; sunrise_hour: number; hours: number } | null };
  pair: { site_sun_pct: number; rim_site_id: string; rim_sun_pct: number; distance_km: number };
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
}

export const HOME = doc as HomeDoc;

/** A tiny angle with five decimals: 2.7e-5 reads "0.00003°". */
export function degreesText(deg: number): string {
  return `${deg.toFixed(5)}°`;
}

/** A large count rounded to the nearest thousand, with a comma: 19741 reads "20,000". */
export function thousandsText(n: number): string {
  const k = Math.max(1, Math.round(n / 1000));
  return `${k.toLocaleString('en-US')},000`;
}

/** Three real stories; each opens Explore on the site and date where it happened. */
export const MISSIONS: { title: string; outcome: string; tone: 'good' | 'bad' | 'plain'; body: string; href: string }[] = [
  {
    title: 'IM-2 Athena, March 2025',
    outcome: 'Ended after one day',
    tone: 'bad',
    body: 'Landed near a mountain called Mons Mouton and came to rest on its side in a crater. Replay the sky it saw and how little light reached it.',
    href: '/explore?site=im2_athena&start=2025-03-06',
  },
  {
    title: 'Blue Ghost Mission 1, March 2025',
    outcome: 'Worked all 14 days',
    tone: 'good',
    body: 'A site far from the pole: two weeks of sunlight, Earth always in view. Our predicted sunset is within hours of its last signal.',
    href: '/explore?site=blue_ghost_m1&start=2025-03-02',
  },
  {
    title: 'de Gerlache Rim 2',
    outcome: 'Shortlisted for a crewed landing',
    tone: 'plain',
    body: 'One of nine regions NASA shortlisted in 2024 for a crewed Artemis landing. Long days, long nights, and a rim that changes everything.',
    href: '/explore?site=de_gerlache_rim_2',
  },
];
