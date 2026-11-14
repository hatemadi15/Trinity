import { R_MOON_KM } from '../engine/constants';
import { normalizeLon } from '../engine/geometry';
import type { Site } from '../data/loaders';
import { spanShort } from '../viz/format';
import type { Outcome } from './outcome';

const DEG = Math.PI / 180;

/** A point round a site: where it is, how far and in which direction (degrees clockwise from north). */
export interface RingPoint {
  lat: number;
  lon: number;
  km: number;
  bearingDeg: number;
}

/** The point `km` from `from` in the direction `bearingDeg`, on the Moon's sphere. */
function destination(from: { lat: number; lon: number }, km: number, bearingDeg: number): { lat: number; lon: number } {
  const d = km / R_MOON_KM;
  const p1 = from.lat * DEG;
  const t = bearingDeg * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = from.lon * DEG + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / DEG, lon: normalizeLon(l2 / DEG) };
}

/** 8 points round a site: 4 at half the radius (north, east, south, west) and 4 at the radius, between them. */
export function ringPoints(site: { lat: number; lon: number }, radiusKm: number): RingPoint[] {
  const out: RingPoint[] = [];
  for (const [km, bearings] of [
    [radiusKm / 2, [0, 90, 180, 270]],
    [radiusKm, [45, 135, 225, 315]],
  ] as const) {
    for (const b of bearings) out.push({ ...destination(site, km, b), km, bearingDeg: b });
  }
  return out;
}

/**
 * How far from its coordinate a site may really be, in km, as the catalogue states it: a stated radius when the site
 * has one, else the "about ±5 km" of a region centre digitised from NASA's map; null for a surveyed or landed point,
 * and for a derived point that states none (no range is better than a guessed one).
 */
export function positionRadiusKm(site: Site): number | null {
  const stated = (site as unknown as Record<string, unknown>).uncertainty_km;
  if (typeof stated === 'number' && stated > 0) return stated;
  const m = /about ±\s*(\d+(?:\.\d+)?)\s*km/.exec(site.source);
  return m ? Number(m[1]) : null;
}

/** One point's result: the outcome of landing at the period start there, or why it could not be worked out. */
export interface PointResult extends RingPoint {
  outcome: Outcome | null;
  /** Why there is no outcome, completing "points have …": "no elevation data here"; null when there is one. */
  missing: string | null;
}

type Span = [number, number];

/** The least and the most of each figure over the centre and every point worked out, with how many there were. */
export interface NeighbourhoodRange {
  /** Points worked out, the centre among them. */
  points: number;
  /** Points round it with no result. */
  missing: number;
  reasons: string[];
  stayH: number;
  poweredH: Span;
  sunH: Span;
  contactH: Span;
  poweredContactH: Span;
  poweredOutageH: Span;
}

export function neighbourhoodRange(centre: Outcome, around: PointResult[]): NeighbourhoodRange {
  const all = [centre, ...around.flatMap((p) => (p.outcome ? [p.outcome] : []))];
  const span = (f: (o: Outcome) => number): Span => [Math.min(...all.map(f)), Math.max(...all.map(f))];
  const gone = around.filter((p) => !p.outcome);
  return {
    points: all.length,
    missing: gone.length,
    reasons: [...new Set(gone.map((p) => p.missing ?? 'no result'))],
    stayH: centre.stayH,
    poweredH: span((o) => o.poweredH),
    sunH: span((o) => o.sunH),
    contactH: span((o) => o.contactH),
    poweredContactH: span((o) => o.poweredContactH),
    poweredOutageH: span((o) => o.poweredOutageH),
  };
}

/** Days to a tenth for the first screen's line: "3.2", "30". */
const days = (h: number) => String(Math.round((h / 24) * 10) / 10);
const spanText = ([lo, hi]: Span) => (lo === hi ? spanShort(lo) : `${spanShort(lo)} to ${spanShort(hi)}`);

/**
 * The range in words: a short line for the first screen, next to the result ("Within about 5 km (9 points): power for
 * 3.2 to 30 days."), and the detail for planners, with every figure's range in hours, how it was found and what the
 * terrain cannot show.
 */
export function rangeWords(r: NeighbourhoodRange, { radiusKm, ms, mastM }: { radiusKm: number; /** The time the points' skylines took to work out. */ ms: number; mastM: number }): { words: string; detail: string } {
  if (r.points === 1) {
    const why = `the points round this one have ${r.reasons.join(' or ')}`;
    return { words: `No range within about ${radiusKm} km: ${why}.`, detail: `Tried at ${r.missing} points ${radiusKm / 2} and ${radiusKm} km away: ${why}.` };
  }
  const total = r.points + r.missing;
  const count = r.missing > 0 ? `${r.points} of ${total} points` : `${r.points} points`;
  const [lo, hi] = r.poweredH;
  const stay = days(r.stayH);
  const power = lo === hi ? (lo >= r.stayH ? `all ${stay} days at every one` : `${days(lo)} days at every one`) : `${days(lo)} to ${hi >= r.stayH ? stay : days(hi)} days`;
  const around = r.missing > 0 ? `${r.points - 1} of ${total - 1}` : `${r.points - 1}`;
  const missing = r.missing > 0 ? ` ${r.missing} ${r.missing === 1 ? 'point has' : 'points have'} ${r.reasons.join(' or ')}, so ${r.missing === 1 ? 'it is' : 'they are'} left out.` : '';
  return {
    words: `Within about ${radiusKm} km (${count}): power for ${power}.`,
    detail:
      `Worked out here and at ${around} points round it, ${radiusKm / 2} and ${radiusKm} km away, with the same lander, period and ${mastM} m mast; their skylines took ${(ms / 1000).toFixed(1)} s to work out. ` +
      `Power ${spanText(r.poweredH)}; sunlight ${spanText(r.sunH)}; Earth in view ${spanText(r.contactH)}; contact while powered ${spanText(r.poweredContactH)}; longest time without Earth while powered ${spanText(r.poweredOutageH)}.${missing} ` +
      'Each point’s hills come from the same NASA elevation grids, which do not show a hill narrower than one grid cell.',
  };
}
