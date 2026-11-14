import { spanShort } from '../viz/format';
import type { Outcome } from './outcome';

/**
 * What a mission needs from a landing, set by a planner. Each is in hours, and null means no requirement: with none
 * set, a recommendation is ranked by the objective alone.
 */
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

/** One requirement checked against one outcome: met or not, the value reached, the limit and the margin, in hours. */
export interface Check {
  id: RequirementId;
  /** The requirement in words: "Power for at least 5 d". */
  label: string;
  met: boolean;
  /** The value reached; null when Earth never comes into the stay at all (contact at landing). */
  value: number | null;
  limit: number;
  /** Hours inside the limit (positive) or outside it (negative); null where the value is. */
  margin: number | null;
  /** The check in one line, with its numbers: "Power for at least 5 d: 3 d 4 h, 1 d 20 h short". */
  words: string;
}

/** How many requirements are set. */
export function requirementCount(r: Requirements): number {
  return [r.minPoweredH, r.contactWithinH, r.maxOutageH, r.minPoweredContactH].filter((v) => v !== null).length;
}

function atLeast(id: RequirementId, label: string, value: number, limit: number): Check {
  const margin = value - limit;
  return { id, label, met: margin >= 0, value, limit, margin, words: `${label}: ${spanShort(value)}, ${margin >= 0 ? `${spanShort(margin)} to spare` : `${spanShort(-margin)} short`}` };
}

/** Each requirement set, checked against the outcome, always in the same order: power, contact at landing, outage, contact while powered. */
export function checkRequirements(o: Outcome, r: Requirements): Check[] {
  const checks: Check[] = [];
  if (r.minPoweredH !== null) checks.push(atLeast('power', `Power for at least ${spanShort(r.minPoweredH)}`, o.poweredH, r.minPoweredH));
  if (r.contactWithinH !== null) {
    const limit = r.contactWithinH;
    const label = limit === 0 ? 'Earth in view at landing' : `Earth in view within ${spanShort(limit)} of landing`;
    const v = o.firstContactH;
    if (v === null) {
      checks.push({ id: 'contact-at-landing', label, met: false, value: null, limit, margin: null, words: `${label}: no, Earth stays out of view all ${spanShort(o.stayH)}` });
    } else {
      const margin = limit - v;
      const words = margin < 0 ? `${label}: not until ${spanShort(v)} after landing, ${spanShort(-margin)} late` : v === 0 ? `${label}: yes` : `${label}: after ${spanShort(v)}, ${spanShort(margin)} to spare`;
      checks.push({ id: 'contact-at-landing', label, met: margin >= 0, value: v, limit, margin, words });
    }
  }
  if (r.maxOutageH !== null) {
    const label = `Longest time without Earth while powered at most ${spanShort(r.maxOutageH)}`;
    const v = o.poweredOutageH;
    const margin = r.maxOutageH - v;
    checks.push({ id: 'outage', label, met: margin >= 0, value: v, limit: r.maxOutageH, margin, words: `${label}: ${spanShort(v)}, ${margin >= 0 ? `${spanShort(margin)} to spare` : `${spanShort(-margin)} too long`}` });
  }
  if (r.minPoweredContactH !== null) checks.push(atLeast('powered-contact', `Earth contact while powered at least ${spanShort(r.minPoweredContactH)}`, o.poweredContactH, r.minPoweredContactH));
  return checks;
}

/** A label as the middle of a sentence has it: the first letter small, but Earth and the Sun keep their capitals. */
export function midSentence(label: string): string {
  return /^(Earth|Sun)\b/.test(label) ? label : `${label[0].toLowerCase()}${label.slice(1)}`;
}

/** A failed check as a sentence names it: "longest time without Earth while powered at most 3 d (16 d 12 h)". */
export function failedWords(c: Check): string {
  const value = c.value === null ? 'never in view' : c.id === 'contact-at-landing' ? `not until ${spanShort(c.value)} after landing` : spanShort(c.value);
  return `${midSentence(c.label)} (${value})`;
}

/** The checks summed up in one sentence; null when no requirement is set. */
export function checksWords(checks: Check[]): string | null {
  if (checks.length === 0) return null;
  const failed = checks.filter((c) => !c.met);
  if (failed.length === 0) return checks.length === 1 ? 'Meets your requirement.' : `Meets all ${checks.length} of your requirements.`;
  const of = checks.length === 1 ? 'your requirement' : `${failed.length} of your ${checks.length} requirements`;
  return `Fails ${of}: ${failed.map(failedWords).join('; ')}.`;
}
