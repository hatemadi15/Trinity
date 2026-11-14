import { spanShort } from '../viz/format';
import type { Outcome } from './outcome';
import { checkedHere, checkRequirements, failedWords, holdUnchecked, midSentence, type Check, type Holds, type Requirements } from './requirements';

/** What every recommendation is ranked by, said where the recommendations are. */
export const OBJECTIVE =
  'Ranked by the longest continuous time with power from landing; ties go to more Earth contact while powered, then to the earlier time or the nearer place.';

/**
 * What a mission weighs once its requirements are counted, each from 0 to 100 and at least one above 0: the time with
 * power from landing, the Earth contact while powered, and shorter gaps without Earth over the stay.
 */
export interface Priorities {
  power: number;
  contact: number;
  gap: number;
}

/** The priorities offered by name; any other weights are the planner's own. */
export const PRIORITY_PROFILES: { id: 'balanced' | 'power' | 'contact' | 'gap'; label: string; priorities: Priorities }[] = [
  { id: 'balanced', label: 'Balanced', priorities: { power: 1, contact: 1, gap: 1 } },
  { id: 'power', label: 'Mostly power', priorities: { power: 5, contact: 1, gap: 1 } },
  { id: 'contact', label: 'Mostly Earth in view', priorities: { power: 1, contact: 5, gap: 1 } },
  { id: 'gap', label: 'Mostly shorter gaps', priorities: { power: 1, contact: 1, gap: 5 } },
];

/** How choices are ranked after the requirements: by the longest time with power (the default), or weighed by priorities. */
export type RankBy = { kind: 'power' } | { kind: 'weighed'; priorities: Priorities };
export const BY_POWER: RankBy = { kind: 'power' };

/** Priorities the rule can use: three numbers from 0 to 100, at least one above 0. */
export function validPriorities(p: unknown): p is Priorities {
  if (!p || typeof p !== 'object') return false;
  const { power, contact, gap } = p as Record<string, unknown>;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
  return ok(power) && ok(contact) && ok(gap) && (power as number) + (contact as number) + (gap as number) > 0;
}

/** The profile whose weights these are, or "custom". */
export function profileOf(p: Priorities): (typeof PRIORITY_PROFILES)[number]['id'] | 'custom' {
  return PRIORITY_PROFILES.find((x) => x.priorities.power === p.power && x.priorities.contact === p.contact && x.priorities.gap === p.gap)?.id ?? 'custom';
}

/** The weights in words: "power 5, Earth in view 1, shorter gaps 1". */
export function priorityWords(p: Priorities): string {
  return `power ${p.power}, Earth in view ${p.contact}, shorter gaps ${p.gap}`;
}

/**
 * How the rule counts a share x of the stay, from 0 to 1: 0.55x + 0.30√x + 0.15x². It rises with x, gives most for the
 * first hours (the square root) and still rewards the last ones (the square), and is 1 for the whole stay.
 */
export function curve(x: number): number {
  const v = Math.min(1, Math.max(0, x));
  return 0.55 * v + 0.3 * Math.sqrt(v) + 0.15 * v * v;
}

/** A weighed score out of 100 and each measure's part of it (the parts add up to the score). */
export interface WeighedScore {
  score: number;
  parts: { power: number; contact: number; gap: number };
}

/**
 * The weighed rule: the three shares of the stay (the time with power in a row from landing, the Earth contact while
 * powered, and one minus the longest stretch of the stay without Earth in view), each counted by `curve`, weighted by
 * its priority and scaled to 100. The gap is over the whole stay, not only while powered, so a lander that loses power
 * early never scores well on gaps for being off. A preference between choices, not a chance that a landing works.
 */
export function weighedScore(o: Outcome, p: Priorities): WeighedScore {
  const stay = o.stayH > 0 ? o.stayH : 1;
  const total = p.power + p.contact + p.gap;
  const part = (w: number, x: number) => (total > 0 ? (100 * w * curve(x)) / total : 0);
  const parts = { power: part(p.power, o.poweredH / stay), contact: part(p.contact, o.poweredContactH / stay), gap: part(p.gap, 1 - o.outageH / stay) };
  return { score: parts.power + parts.contact + parts.gap, parts };
}

/** Scores closer than this are a tie, which the order the choices came in settles. */
const TIE = 1e-9;
const pts = (v: number) => v.toFixed(1);

/** A choice's score in one line, each measure's part after it: "Score 72.4 of 100: power 40.1, Earth in view 20.0, shorter gaps 12.3." */
export function scoreWords(o: Outcome, p: Priorities): string {
  const s = weighedScore(o, p);
  return `Score ${pts(s.score)} of 100: ${partsWords(s)}.`;
}

const GAINS: Record<keyof WeighedScore['parts'], string> = { power: 'more power', contact: 'more Earth in view', gap: 'shorter gaps' };

/**
 * Why a higher weighed score ranks first, with the measure that gains it most: "It scores 58.2 against 51.0 for the
 * next: more Earth in view." Each score's three parts are given with the choice itself (scoreWords).
 */
export function scoreAbove(a: WeighedScore, b: WeighedScore, other: string): string {
  const keys: (keyof WeighedScore['parts'])[] = ['power', 'contact', 'gap'];
  const main = keys.reduce((m, k) => (a.parts[k] - b.parts[k] > a.parts[m] - b.parts[m] ? k : m), keys[0]);
  return `It scores ${pts(a.score)} against ${pts(b.score)} for ${other}: ${GAINS[main]}.`;
}

/** A score's three parts in words: "power 40.1, Earth in view 20.0, shorter gaps 12.3". */
export function partsWords(s: WeighedScore): string {
  return `power ${pts(s.parts.power)}, Earth in view ${pts(s.parts.contact)}, shorter gaps ${pts(s.parts.gap)}`;
}

/** What the recommendations are ranked by, in words, for where they appear; the weighed rule with its formula. */
export function objectiveWords(by: RankBy): string {
  if (by.kind === 'power') return OBJECTIVE;
  return (
    `Ranked by your priorities: ${priorityWords(by.priorities)}. Each measure is a share x of the stay (the time with power from landing, the Earth contact while powered, ` +
    'and one minus the longest time without Earth) counted as 0.55x + 0.30√x + 0.15x², weighted by its priority, out of 100: a preference between choices, not a chance that a landing works. ' +
    'Ties go to the earlier time or the nearer place.'
  );
}

/** How a choice that fails a requirement is treated. */
export const FAIL_RULE = 'A choice that fails a requirement ranks below every choice that meets them all; among those, fewer failures rank first.';

/** How finely a search looked: every hour of the period, every 6 hours of a year, or the catalogue sites nearby. */
export type SearchScope = { kind: 'period'; days: number } | { kind: 'year'; days: number; stepH: number } | { kind: 'place'; days: number; km: number; spots?: number; spotKm?: number };

export function searchWords(s: SearchScope): string {
  const stay = `each for a ${s.days}-day stay`;
  if (s.kind === 'period') return `Landing times tried every hour of these ${s.days} days (UTC), ${stay}.`;
  if (s.kind === 'year') return `Landing times tried every ${s.stepH === 1 ? 'hour' : `${s.stepH} hours`} over the next 12 months (UTC), ${stay}.`;
  if (s.spots) return `Catalogue sites within ${s.km} km and ${s.spots} spots within about ${s.spotKm} km of this one, tried from the same landing hour, ${stay}.`;
  return `Catalogue sites within ${s.km} km tried from the same landing hour, ${stay}.`;
}

/** The 12-month search's note says how finely it looked and what it ranked by. */
export function yearRuleWords(stepH: number, requirements: boolean, by: RankBy = BY_POWER): string {
  const objective = by.kind === 'weighed' ? `your priorities (${priorityWords(by.priorities)})` : 'time with power from landing, then Earth contact while powered';
  return `Landing times tried every ${stepH === 1 ? 'hour' : `${stepH} hours`}, ranked by ${requirements ? 'your requirements, then ' : ''}${objective}.`;
}

/** A choice (a landing time or a place) with its outcome and its requirement checks. */
export interface Option<T> {
  item: T;
  outcome: Outcome;
  checks: Check[];
  /** How many requirements it fails. */
  failed: number;
  /** In how many terrain versions it holds, where they were worked out for it. */
  holds?: Holds | null;
  /** A requirement set was not checked for it: the share of terrain versions, where none were worked out. */
  unchecked?: boolean;
}

/**
 * A choice checked against the requirements. How often it still holds across the terrain versions ranks it only through
 * the optional requirement "holds in at least N % of terrain versions" (Requirements.minHoldPct), which then counts as any
 * other: a choice that holds in fewer versions fails it and ranks below every choice that meets them all. It is a
 * requirement and not a criterion of its own after them so that, unless a planner sets it, the ranking and the better
 * date stay exactly as worked out on the app's own skyline: a share of versions rests on an error model's assumptions.
 */
export function optionOf<T>(item: T, outcome: Outcome, req: Requirements, holds?: Holds | null): Option<T> {
  const checks = checkRequirements(outcome, req, holds);
  return { item, outcome, checks, failed: checks.filter((c) => !c.met).length, holds: holds ?? null, unchecked: holdUnchecked(req, checks) };
}

/**
 * Negative when `a` ranks above `b`: fewer failed requirements first (so every choice that meets them all comes before
 * any that fails one), then the objective: by default the longer time with power in a row, then more Earth contact while
 * powered; or the higher weighed score. Zero for a tie, which the caller's order settles (the earlier time, the nearer place).
 */
export function compareOptions<T>(a: Option<T>, b: Option<T>, by: RankBy = BY_POWER): number {
  if (a.failed !== b.failed) return a.failed - b.failed;
  if (by.kind === 'weighed') {
    const d = weighedScore(b.outcome, by.priorities).score - weighedScore(a.outcome, by.priorities).score;
    return Math.abs(d) < TIE ? 0 : d;
  }
  if (a.outcome.poweredH !== b.outcome.poweredH) return b.outcome.poweredH - a.outcome.poweredH;
  return b.outcome.poweredContactH - a.outcome.poweredContactH;
}

/** The choices best first; a tie keeps the order they came in. */
export function rankOptions<T>(options: Option<T>[], by: RankBy = BY_POWER): Option<T>[] {
  return options
    .map((o, i) => ({ o, i }))
    .sort((x, y) => compareOptions(x.o, y.o, by) || x.i - y.i)
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

/**
 * Why `a` ranks above `b`, in one plain sentence; `other` names `b` ("the next", "landing at the period start"). A
 * requirement set but not checked for `a` is never counted as met: it meets the requirements checked here.
 */
export function whyAbove<T>(a: Option<T>, b: Option<T>, kind: 'time' | 'place', other = 'the next', by: RankBy = BY_POWER): string {
  if (a.failed < b.failed) {
    if (a.failed === 0) {
      const fails = b.checks.filter((c) => !c.met);
      return `It meets ${a.unchecked ? checkedHere(a.checks) : 'every requirement'}; ${other} fails ${fails.length === 1 ? 'one' : fails.length}: ${fails.map(failedWords).join('; ')}.`;
    }
    return `It fails fewer requirements than ${other}: ${a.failed} against ${b.failed}.`;
  }
  if (by.kind === 'weighed') {
    const A = weighedScore(a.outcome, by.priorities);
    const B = weighedScore(b.outcome, by.priorities);
    if (A.score - B.score < TIE) return `It ties with ${other} on your priorities and comes first as the ${kind === 'time' ? 'earlier time' : 'nearer place'}.`;
    return scoreAbove(A, B, other);
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
