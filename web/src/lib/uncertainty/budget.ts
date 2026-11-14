import { fetchJson } from '../data/loaders';
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { clockUtc, dayMonth } from '../viz/format';

/**
 * The uncertainty budget written by `pipeline/lunar_pipeline/uncertainty.py` into data/uncertainty/budget.json:
 * for each featured site and each kind of event, how far the app's hourly time can be off, with the three
 * sources kept apart (the hourly sampling, the terrain data, the planets' positions) and their sum.
 */

export type EventKind = 'sunset' | 'sunrise' | 'earthset' | 'earthrise' | 'battery_out' | 'power_back';
export const EVENT_KINDS: EventKind[] = ['sunset', 'sunrise', 'earthset', 'earthrise', 'battery_out', 'power_back'];

/** Offsets in hours over the measured span: count, median, 5th and 95th percentiles, and the 95th percentile and largest of their size. */
export interface OffsetStats {
  n: number;
  median_h: number | null;
  p05_h: number | null;
  p95_h: number | null;
  p95_abs_h: number | null;
  max_abs_h: number | null;
}

export interface EventBudget {
  /** The hourly time minus the one-minute time. */
  sampling: OffsetStats;
  /**
   * The terrain spread: each event's larger shift under the adjusted terrain model raised and lowered by its stated error,
   * or over the terrain versions, and how many events those lose; null on a flat horizon. `skylines` and `versions` keep
   * the two apart where the site has versions.
   */
  terrain: (OffsetStats & { lost: number; skylines?: OffsetStats & { lost: number }; versions?: OffsetStats & { lost: number } }) | null;
  /** The largest gap to JPL Horizons, as time at each crossing. */
  ephemeris: { n: number; p95_s: number | null; max_s: number | null };
  /** The three 95th percentiles added (hours); null when the event never happens in the span. */
  plus_minus_h: number | null;
  /** The same, rounded up to the half hour: what the app shows. */
  shown_h: number | null;
}

/** The ground at a site from NASA's adjusted south-pole maps (PGDA product 90). */
export interface TerrainQuality {
  height_error_m: number | null;
  effective_resolution_m: number | null;
  slope_deg: number | null;
  slope_error_deg: number | null;
  roughness_100m_m: number | null;
  nearest_psr_km: number | null;
  psr_search_km: number;
}

export interface SkylineCheck {
  adjusted_minus_app?: { mean_deg: number; p95_abs_deg: number; max_abs_deg: number };
  error_1sigma_deg?: { median: number; p95: number; max: number };
  skyline_distance_km?: { median: number; min: number };
  site_height_app_m?: number;
  site_height_adjusted_m?: number;
  site_height_error_m?: number;
  flat?: boolean;
  allowance_h?: number;
  allowance_source?: string;
}

export interface Durations {
  sunlit_pct: number;
  earth_pct: number;
  powered_pct: number;
  longest_night_h: number;
  longest_earth_gap_h: number;
}

export interface SiteBudget {
  site_id: string;
  name: string;
  label: string | null;
  lat: number;
  lon: number;
  polar: boolean;
  /** The condition this site stands for in the review, when it is one of the four representative sites. */
  condition: string | null;
  skyline: SkylineCheck | null;
  terrain_quality: TerrainQuality | null;
  events: Record<EventKind, EventBudget>;
  durations?: {
    hourly: Durations;
    fine: Durations;
    terrain_max_abs?: Durations;
    /** Each duration over the terrain versions (data/ensemble): its 5th, 50th and 95th percentiles and the 95th of its change from the app's. */
    versions?: Record<keyof Durations, { p05: number; median: number; p95: number; p95_abs_change: number }>;
    versions_count?: number;
  };
  /** How many terrain versions the terrain part took (0 where the site has none). */
  terrain_versions?: number;
}

export interface UncertaintyDoc {
  version: 1;
  generated_utc: string;
  span: { start_utc: string; days: number; fine_step_s: number; hourly_step_s: number };
  method?: Record<string, string>;
  ephemeris?: { sun: { angle_deg: number }; earth: { angle_deg: number }; table_rounding_deg: { sun: number; earth: number } };
  lander?: Record<string, number | string>;
  product90?: { citation: string; sources: { name: string; url: string; access: string; use: string; listed_size?: string }[] };
  sites: SiteBudget[];
  pooled: { polar: Record<EventKind, { sites: number; largest_shown_h: number | null; median_plus_minus_h: number | null }> };
}

export async function loadUncertainty(base: string): Promise<UncertaintyDoc> {
  return fetchJson<UncertaintyDoc>(`${base}/uncertainty/budget.json`);
}

export function siteBudget(doc: UncertaintyDoc | null, siteId: string): SiteBudget | null {
  return doc?.sites.find((s) => s.site_id === siteId) ?? null;
}

/** Where a margin comes from: the site's own measurement, the largest at the featured polar sites, or the flat-horizon site's. */
export type Basis = 'site' | 'polar-sites' | 'flat';

/**
 * The margin to show for an event: the site's own when the budget measured it; for a point it did not measure,
 * the largest found at the featured polar sites near the pole and the flat-horizon site's far from it.
 */
export function plusMinusFor(doc: UncertaintyDoc, site: { id: string; polar: boolean }, kind: EventKind): { hours: number; basis: Basis } | null {
  const own = siteBudget(doc, site.id);
  if (own) return own.events[kind]?.shown_h != null ? { hours: own.events[kind].shown_h!, basis: 'site' } : null;
  if (site.polar) {
    const h = doc.pooled.polar[kind]?.largest_shown_h;
    return h != null ? { hours: h, basis: 'polar-sites' } : null;
  }
  const flat = doc.sites.find((s) => !s.polar);
  const h = flat?.events[kind]?.shown_h;
  return h != null ? { hours: h, basis: 'flat' } : null;
}

/** A margin in words: minutes under an hour, hours above. */
export function withinWords(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

/**
 * The events the verdict speaks of, hours from the period start: the night the battery first runs out in (or the
 * first night), when it runs out, the sunrise that ends that night, the power back, and Earth's first change.
 */
export function keyEvents(series: Series, power: PowerResult): { kind: EventKind; hour: number }[] {
  const n = series.hours;
  const lit = (h: number) => series.sunFraction[h] > 0;
  const out: { kind: EventKind; hour: number }[] = [];
  const first = power.firstBrownoutHour;
  // The night: the one the battery runs out in, else the period's first.
  let sunset = -1;
  if (first !== null && !lit(first)) {
    sunset = first;
    while (sunset > 0 && !lit(sunset - 1)) sunset--;
    if (sunset === 0) sunset = -1;
  } else {
    for (let h = 1; h < n; h++) if (lit(h - 1) && !lit(h)) {
      sunset = h;
      break;
    }
  }
  if (sunset > 0) out.push({ kind: 'sunset', hour: sunset });
  if (first !== null && first > 0) out.push({ kind: 'battery_out', hour: first });
  const from = sunset > 0 ? sunset : first ?? -1;
  if (from >= 0) {
    let rise = from;
    while (rise < n && !lit(rise)) rise++;
    if (rise < n && rise > from) out.push({ kind: 'sunrise', hour: rise });
  }
  if (first !== null) {
    let back = first;
    while (back < n && power.powered[back] === 0) back++;
    if (back < n) out.push({ kind: 'power_back', hour: back });
  }
  for (let h = 1; h < n; h++) {
    if (series.earthVisible[h] !== series.earthVisible[h - 1]) {
      out.push({ kind: series.earthVisible[h] ? 'earthrise' : 'earthset', hour: h });
      break;
    }
  }
  return out.sort((a, b) => a.hour - b.hour || EVENT_KINDS.indexOf(a.kind) - EVENT_KINDS.indexOf(b.kind));
}

/** Each event as the verdict and the brief name it. */
export const EVENT_NAMES: Record<EventKind, string> = {
  sunset: 'Sunset',
  sunrise: 'Sunrise',
  earthset: 'Earth sets',
  earthrise: 'Earth rises',
  battery_out: 'Battery runs out',
  power_back: 'Power back',
};

const BASIS_WORDS: Record<Basis, string> = {
  site: 'Measured at this site: the hourly steps against one-minute steps, the elevation data against NASA’s adjusted south-pole model and its stated height error, and the planets’ positions against JPL Horizons.',
  'polar-sites': 'Not measured at this point: each margin is the largest found at the featured sites near the pole.',
  flat: 'A flat horizon is assumed here: at Blue Ghost’s site the Sun set about 2.5 h before a flat horizon’s sunset, and the margin allows for that.',
};

/** The verdict's times with their margins, where those come from, and the widest margin among them (hours). */
export interface SureLines {
  lines: string[];
  basis: string | null;
  widest: number | null;
}

/**
 * The events of the period with their supported margins, one sentence each ("Sunset 3 Jan 14:00 UTC, within about
 * 2 h."), and one sentence on where the margins come from; nothing without a budget or an event.
 */
export function sureLines({
  doc,
  site,
  series,
  power,
  startUtc,
}: {
  doc: UncertaintyDoc | null;
  site: { id: string; polar: boolean };
  series: Series;
  power: PowerResult;
  startUtc: string;
}): SureLines {
  if (!doc) return { lines: [], basis: null, widest: null };
  let basis: Basis | null = null;
  let widest: number | null = null;
  let battery = false;
  const lines: string[] = [];
  for (const { kind, hour } of keyEvents(series, power)) {
    const pm = plusMinusFor(doc, site, kind);
    if (!pm) continue;
    basis = pm.basis;
    widest = Math.max(widest ?? 0, pm.hours);
    battery ||= kind === 'battery_out' || kind === 'power_back';
    lines.push(`${EVENT_NAMES[kind]} ${dayMonth(startUtc, hour)} ${clockUtc(startUtc, hour)} UTC, within about ${withinWords(pm.hours)}.`);
  }
  // The budget walked the battery of one lander, the app's default: its margins say so.
  const words = basis ? `${BASIS_WORDS[basis]}${battery ? ' The battery’s margins were measured for the small lander.' : ''}` : null;
  return { lines, basis: words, widest };
}
