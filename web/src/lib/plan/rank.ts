import { spanShort } from '../viz/format';
import type { Outcome } from './outcome';
import { checkRequirements, failedWords, midSentence, type Check, type Requirements } from './requirements';

/** What every recommendation is ranked by, said where the recommendations are. */
export const OBJECTIVE =
  'Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier time or the nearer place.';

/** How a choice that fails a requirement is treated. */
export const FAIL_RULE = 'A choice that fails a requirement ranks below every choice that meets them all; among those, fewer failures rank first.';

/** How finely a search looked: every hour of the period, every 6 hours of a year, or the catalogue sites nearby. */
export type SearchScope = { kind: 'period'; days: number } | { kind: 'year'; days: number; stepH: number } | { kind: 'place'; days: number; km: number };

export function searchWords(s: SearchScope): string {
  const stay = `each for a ${s.days}-day stay`;
  if (s.kind === 'period') return `Landing times tried every hour of these ${s.days} days (UTC), ${stay}.`;
  if (s.kind === 'year') return `Landing times tried every ${s.stepH === 1 ? 'hour' : `${s.stepH} hours`} over the next 12 months (UTC), ${stay}.`;
  return `Catalogue sites within ${s.km} km tried from the same landing hour, ${stay}.`;
}

/** A choice (a landing time or a place) with its outcome and its requirement checks. */
export interface Option<T> {
  item: T;
  outcome: Outcome;
  checks: Check[];
  /** How many requirements it fails. */
  failed: number;
}

export function optionOf<T>(item: T, outcome: Outcome, req: Requirements): Option<T> {
  const checks = checkRequirements(outcome, req);
  return { item, outcome, checks, failed: checks.filter((c) => !c.met).length };
}

/**
 * Negative when `a` ranks above `b`: fewer failed requirements first (so every choice that meets them all comes before
 * any that fails one), then the longer time with power in a row, then more Earth contact while powered; zero for a tie,
 * which the caller's order settles (the earlier time, the nearer place).
 */
export function compareOptions<T>(a: Option<T>, b: Option<T>): number {
  if (a.failed !== b.failed) return a.failed - b.failed;
  if (a.outcome.poweredH !== b.outcome.poweredH) return b.outcome.poweredH - a.outcome.poweredH;
  return b.outcome.poweredContactH - a.outcome.poweredContactH;
}

/** The choices best first; a tie keeps the order they came in. */
export function rankOptions<T>(options: Option<T>[]): Option<T>[] {
  return options
    .map((o, i) => ({ o, i }))
    .sort((x, y) => compareOptions(x.o, y.o) || x.i - y.i)
    .map((x) => x.o);
}

/**
 * The best `top` of ranked landing times, each at least `apartH` hours from every one taken before it: a time a few
 * hours from a better one is the same choice, not an alternative.
 */
export function pickApart<T>(ranked: Option<T>[], apartH: number, top: number): Option<T>[] {
  const out: Option<T>[] = [];
  for (const o of ranked) {
    if (out.length >= top) break;
    if (out.every((p) => Math.abs(p.outcome.hour - o.outcome.hour) >= apartH)) out.push(o);
  }
  return out;
}

/** Why `a` ranks above `b`, in one plain sentence; `other` names `b` ("the next", "landing at the period start"). */
export function whyAbove<T>(a: Option<T>, b: Option<T>, kind: 'time' | 'place', other = 'the next'): string {
  if (a.failed < b.failed) {
    if (a.failed === 0) {
      const fails = b.checks.filter((c) => !c.met);
      return `It meets every requirement; ${other} fails ${fails.length === 1 ? 'one' : fails.length}: ${fails.map(failedWords).join('; ')}.`;
    }
    return `It fails fewer requirements than ${other}: ${a.failed} against ${b.failed}.`;
  }
  const dp = a.outcome.poweredH - b.outcome.poweredH;
  if (dp > 0) return `Power lasts ${spanShort(dp)} longer than ${other}.`;
  const dc = a.outcome.poweredContactH - b.outcome.poweredContactH;
  if (dp === 0 && dc > 0) return `Power lasts as long as ${other}, with ${spanShort(dc)} more Earth contact while powered.`;
  return `It ties with ${other} and comes first as the ${kind === 'time' ? 'earlier time' : 'nearer place'}.`;
}

export type TradeOffId = 'power' | 'sunlight' | 'contact' | 'powered-contact' | 'outage';

/** One figure of a choice against the current one: the signed change in hours and whether it is for the better (null: no change). */
export interface TradeOff {
  id: TradeOffId;
  label: string;
  delta: number;
  better: boolean | null;
  /** "Power +9 d 11 h", "longest time without Earth −4 d", "sunlight same". */
  text: string;
}

/** A signed span: "+9 d 11 h", "−20 h", "same". */
export function signedSpan(h: number): string {
  if (h === 0) return 'same';
  return `${h > 0 ? '+' : '−'}${spanShort(Math.abs(h))}`;
}

const FIGURES: [TradeOffId, string, (o: Outcome) => number, 1 | -1][] = [
  ['power', 'Power', (o) => o.poweredH, 1],
  ['sunlight', 'Sunlight', (o) => o.sunH, 1],
  ['contact', 'Earth in view', (o) => o.contactH, 1],
  ['powered-contact', 'Contact while powered', (o) => o.poweredContactH, 1],
  ['outage', 'Longest time without Earth while powered', (o) => o.poweredOutageH, -1],
];

/** What a choice gains and loses against the current one: power, sunlight, Earth in view, contact while powered and the longest time without Earth while powered. */
export function tradeOffs(o: Outcome, base: Outcome): TradeOff[] {
  return FIGURES.map(([id, label, get, sense]) => {
    const delta = get(o) - get(base);
    return { id, label, delta, better: delta === 0 ? null : delta * sense > 0, text: `${label} ${signedSpan(delta)}` };
  });
}

/** The trade-offs in one line, the first figure capitalised: "Power +9 d 11 h, sunlight same, …". */
export function tradeOffWords(t: TradeOff[]): string {
  return t.map((x, i) => (i === 0 ? x.text : `${midSentence(x.label)} ${signedSpan(x.delta)}`)).join(', ');
}
