import { poweredFrom } from '../engine/landing';
import type { Series } from '../engine/metrics';
import { powerSeries, type PowerConfig } from '../engine/power';
import { spanShort } from '../viz/format';

/**
 * The requirements model the planner judges each landing by: a small local stand-in, with the same names and meaning as
 * the objectives part's model (lib/plan/requirements, outcome and rank on its branch). When that lands, this file becomes
 * three re-exports of it and nothing else changes.
 */

/** What a mission needs from a landing, in hours; null means no requirement. */
export interface Requirements {
  /** The least time with power in a row from landing. */
  minPoweredH: number | null;
  /** Earth in view at the landing hour (0), or within this many hours of it. */
  contactWithinH: number | null;
  /** The longest time without Earth in view the mission accepts while the lander has power. */
  maxOutageH: number | null;
  /** The least time with Earth in view while the lander has power. */
  minPoweredContactH: number | null;
}

export const NO_REQUIREMENTS: Requirements = { minPoweredH: null, contactWithinH: null, maxOutageH: null, minPoweredContactH: null };

export type RequirementId = 'power' | 'contact-at-landing' | 'outage' | 'powered-contact';

/** What a lander gets from one landing hour over its stay, in hours counted on the series' hours. */
export interface Outcome {
  hour: number;
  stayH: number;
  /** Hours with power in a row from landing, at most the stay. */
  poweredH: number;
  sunH: number;
  contactH: number;
  /** Hours with Earth in view before the first power cut. */
  poweredContactH: number;
  /** The longest stretch without Earth in view from landing to the first power cut. */
  poweredOutageH: number;
  /** Hours from landing to the first hour with Earth in view; null when Earth never is in the stay. */
  firstContactH: number | null;
  sunlitAtLanding: boolean;
}

/** One requirement checked against one outcome: met or not, the value, the limit and the margin, in hours. */
export interface Check {
  id: RequirementId;
  label: string;
  met: boolean;
  value: number | null;
  limit: number;
  margin: number | null;
  /** The check in one line with its numbers: "Power for at least 5 d: 3 d 4 h, 1 d 20 h short". */
  words: string;
}

/** A choice with its outcome and checks. */
export interface Option<T> {
  item: T;
  outcome: Outcome;
  checks: Check[];
  failed: number;
}

/** The outcome of any landing hour of a series for a stay, with the engine's battery walk (`poweredFrom`). */
export function outcomeScanner(series: Series, cfg: PowerConfig): (hour: number, stayH: number) => Outcome {
  const n = series.hours;
  const vis = new Int32Array(n + 1);
  const lit = new Int32Array(n + 1);
  for (let h = 0; h < n; h++) {
    vis[h + 1] = vis[h] + series.earthVisible[h];
    lit[h + 1] = lit[h] + (series.sunFraction[h] > 0 ? 1 : 0);
  }
  const nextVis = new Int32Array(n + 1).fill(-1);
  for (let h = n - 1; h >= 0; h--) nextVis[h] = series.earthVisible[h] === 1 ? h : nextVis[h + 1];
  const powerW = powerSeries(series, cfg);
  const longestGap = (from: number, to: number) => {
    let best = 0;
    let run = 0;
    for (let h = from; h < to; h++) {
      run = series.earthVisible[h] === 1 ? 0 : run + 1;
      if (run > best) best = run;
    }
    return best;
  };
  return (hour, stay) => {
    const end = Math.min(n, hour + Math.max(0, stay));
    const stayH = Math.max(0, end - hour);
    const poweredH = Math.min(stayH, poweredFrom(powerW, cfg, hour, stayH));
    const first = hour < n ? nextVis[hour] : -1;
    return {
      hour,
      stayH,
      poweredH,
      sunH: lit[end] - lit[hour],
      contactH: vis[end] - vis[hour],
      poweredContactH: vis[hour + poweredH] - vis[hour],
      poweredOutageH: poweredH > 0 ? longestGap(hour, hour + poweredH) : 0,
      firstContactH: first >= 0 && first < end ? first - hour : null,
      sunlitAtLanding: hour < n && series.sunFraction[hour] > 0,
    };
  };
}

function atLeast(id: RequirementId, label: string, value: number, limit: number): Check {
  const margin = value - limit;
  return { id, label, met: margin >= 0, value, limit, margin, words: `${label}: ${spanShort(value)}, ${margin >= 0 ? `${spanShort(margin)} to spare` : `${spanShort(-margin)} short`}` };
}

/** Each requirement set, checked against the outcome, in the same order: power, contact at landing, outage, contact while powered. */
export function checkRequirements(o: Outcome, r: Requirements): Check[] {
  const checks: Check[] = [];
  if (r.minPoweredH !== null) checks.push(atLeast('power', `Power for at least ${spanShort(r.minPoweredH)}`, o.poweredH, r.minPoweredH));
  if (r.contactWithinH !== null) {
    const limit = r.contactWithinH;
    const label = limit === 0 ? 'Earth in view at landing' : `Earth in view within ${spanShort(limit)} of landing`;
    const v = o.firstContactH;
    if (v === null) checks.push({ id: 'contact-at-landing', label, met: false, value: null, limit, margin: null, words: `${label}: no, Earth stays out of view all ${spanShort(o.stayH)}` });
    else {
      const margin = limit - v;
      const words = margin < 0 ? `${label}: not until ${spanShort(v)} after landing, ${spanShort(-margin)} late` : v === 0 ? `${label}: yes` : `${label}: after ${spanShort(v)}, ${spanShort(margin)} to spare`;
      checks.push({ id: 'contact-at-landing', label, met: margin >= 0, value: v, limit, margin, words });
    }
  }
  if (r.maxOutageH !== null) {
    const label = `Longest time without Earth while powered at most ${spanShort(r.maxOutageH)}`;
    const margin = r.maxOutageH - o.poweredOutageH;
    checks.push({ id: 'outage', label, met: margin >= 0, value: o.poweredOutageH, limit: r.maxOutageH, margin, words: `${label}: ${spanShort(o.poweredOutageH)}, ${margin >= 0 ? `${spanShort(margin)} to spare` : `${spanShort(-margin)} too long`}` });
  }
  if (r.minPoweredContactH !== null) checks.push(atLeast('powered-contact', `Earth contact while powered at least ${spanShort(r.minPoweredContactH)}`, o.poweredContactH, r.minPoweredContactH));
  return checks;
}

export function optionOf<T>(item: T, outcome: Outcome, req: Requirements): Option<T> {
  const checks = checkRequirements(outcome, req);
  return { item, outcome, checks, failed: checks.filter((c) => !c.met).length };
}

/** Negative when `a` ranks above `b`: fewer failed requirements, then longer time with power, then more contact while powered. */
export function compareOptions<T>(a: Option<T>, b: Option<T>): number {
  if (a.failed !== b.failed) return a.failed - b.failed;
  if (a.outcome.poweredH !== b.outcome.poweredH) return b.outcome.poweredH - a.outcome.poweredH;
  return b.outcome.poweredContactH - a.outcome.poweredContactH;
}

/** A failed check as a sentence names it: "longest time without Earth while powered at most 3 d (16 d 12 h)". */
export function failedWords(c: Check): string {
  const value = c.value === null ? 'never in view' : c.id === 'contact-at-landing' ? `not until ${spanShort(c.value)} after landing` : spanShort(c.value);
  const label = /^(Earth|Sun)\b/.test(c.label) ? c.label : `${c.label[0].toLowerCase()}${c.label.slice(1)}`;
  return `${label} (${value})`;
}

/** What every recommendation is ranked by. */
export const OBJECTIVE = 'Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier time.';
