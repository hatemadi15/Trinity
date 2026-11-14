import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { spanShort } from '../viz/format';

/**
 * The radio figures a comparison reads: powered contact, the longest time without Earth and the first setting of the
 * Sun and Earth after landing. The communications part of the app owns these figures; this small adapter gives them
 * that part's names and shapes, so its own module can take this one's place in one line.
 *
 * Earth "in view" is the series' own flag: the centre of Earth's disc over the site's skyline by the clearance set. It is
 * geometric direct-to-Earth visibility only, a clear line to Earth, not a working link.
 */

/** The longest stretch without Earth in view; `fromStart` or `toEnd` when an edge of the period cuts it, so it may be longer. */
export interface Outage {
  start: number;
  end: number;
  hours: number;
  fromStart: boolean;
  toEnd: boolean;
}

export interface ContactPlan {
  hours: number;
  /** Hours with Earth in view. */
  totalHours: number;
  longestOutage: Outage | null;
  /** Hours with Earth in view and the lander powered, by the battery walk. */
  poweredHours: number;
  /** Of those, the ones before the first power cut: the radio contact while it has power that the answer gives. */
  sureHours: number;
}

/** The period's contact with Earth and what the lander can make of it. */
export function contactPlan(series: Series, power: Pick<PowerResult, 'powered' | 'firstBrownoutHour'> | null): ContactPlan {
  const n = series.hours;
  const cut = power?.firstBrownoutHour ?? n;
  let totalHours = 0;
  let poweredHours = 0;
  let sureHours = 0;
  let longestOutage: Outage | null = null;
  let gapFrom = -1;
  for (let h = 0; h <= n; h++) {
    const seen = h < n && series.earthVisible[h] === 1;
    if (h < n && seen) {
      totalHours++;
      if (power?.powered[h] === 1) {
        poweredHours++;
        if (h < cut) sureHours++;
      }
    }
    if (!seen && h < n && gapFrom < 0) gapFrom = h;
    if ((seen || h === n) && gapFrom >= 0) {
      const hours = h - gapFrom;
      if (!longestOutage || hours > longestOutage.hours) longestOutage = { start: gapFrom, end: h, hours, fromStart: gapFrom === 0, toEnd: h === n };
      gapFrom = -1;
    }
  }
  return { hours: n, totalHours, longestOutage, poweredHours, sureHours };
}

export type Body = 'sun' | 'earth';

/** A change to come: `at` is the first hour with the new state, null when none comes before the period ends. */
export interface Change {
  at: number | null;
  inHours: number | null;
  leftHours: number;
}

const isUp = (s: Series, body: Body, hour: number) => (body === 'sun' ? s.sunFraction[hour] > 0 : s.earthVisible[hour] === 1);

/** The first hour after landing at which the body sets (up the hour before, not at it); null when none comes in the period. */
export function firstSetAfter(s: Series, body: Body, landing: number): Change {
  for (let h = landing + 1; h < s.hours; h++) {
    if (isUp(s, body, h - 1) && !isUp(s, body, h)) return { at: h, inHours: h - landing, leftHours: s.hours - landing };
  }
  return { at: null, inHours: null, leftHours: s.hours - landing };
}

/** The longest time without Earth for a card: "16 d 12 h", "at least 9 d 3 h" when an edge of the period cuts it, or "none". */
export function outageWords(o: Outage | null): string {
  if (!o) return 'none';
  return o.fromStart || o.toEnd ? `at least ${spanShort(o.hours)}` : spanShort(o.hours);
}
