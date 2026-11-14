import { pointKind } from '../data/kind';
import { siteLabel } from '../data/loaders';
import { timeWithPower } from '../engine/landing';
import { exploreHref } from '../links';
import type { SiteResult } from '../store/explore';
import { contactPlan, outageWords, poweredContactWords } from './contact';
import { dateLong, dayMonth, pct0, spanShort } from './format';
import { withheldNote } from './terrain';

/** One row of the comparison table: what it says about a site, ready to print. */
export interface CompareRow {
  id: string;
  name: string;
  /** What kind of point the site is, in a few words: "Surveyed point, ±20 m". */
  kind: string;
  /** Explore on the same site and period. */
  href: string;
  sunlight: string;
  earth: string;
  longestNight: string;
  /** What happens to a lander that lands on the first day: "all 30 days", or "3 d 4 h, then off until 20 Jan". */
  power: string;
  /** Radio contact while it has power: hours with Earth in view from landing until the battery first runs out, or "none". */
  contact: string;
  /** The longest time without Earth in view: "at least 9 d 3 h" when the period's start or end cuts it, or "none". */
  longestOutage: string;
  tone: 'good' | 'bad';
}

/** Two pairs the empty page offers, each a lesson in itself. */
export const READY_PAIRS: { title: string; ids: [string, string] }[] = [
  { title: 'A ridge and the summit 12 km away', ids: ['de_gerlache_rim_2', 'de_gerlache_center_rim_high'] },
  { title: 'A rim in sunlight and a floor in shadow', ids: ['shackleton_center_rim_high', 'shackleton_center'] },
];

/** Hours with power for a lander that lands at the period's start, capped at the period. */
const poweredHours = (r: SiteResult, hours: number) => Math.min(hours, timeWithPower(r.power));

/** How long the power lasts and what follows: "3 d 4 h, then off until 20 Jan", "10 h, then off to the end", "all 30 days". */
function powerWords(r: SiteResult, startUtc: string, days: number, powered: number): string {
  const hours = days * 24;
  if (r.summary.illumFraction === 0) return powered >= hours ? `all ${days} days on the battery; no sunlight` : powered > 0 ? `${spanShort(powered)} on the battery; no sunlight` : 'none; no sunlight';
  if (powered >= hours) return `all ${days} days`;
  let back = powered;
  while (back < hours && r.power.powered[back] === 0) back++;
  if (powered === 0) return back < hours ? `none at landing; on from ${dayMonth(startUtc, back)}` : 'none';
  return `${spanShort(powered)}, then off ${back < hours ? `until ${dayMonth(startUtc, back)}` : 'to the end'}`;
}

/**
 * A compared site as a row: sunlight and Earth in view over the period, its longest night, its time with power from the
 * period's first day, the radio contact in that time, and the longest time without Earth.
 */
export function compareRow(r: SiteResult, startUtc: string, days: number): CompareRow {
  const hours = days * 24;
  const powered = poweredHours(r, hours);
  const lit = r.summary.illumFraction > 0;
  const all = powered >= hours;
  // The radio windows over the period, as Explore counts them.
  const plan = contactPlan(r.series, r.power);
  return {
    id: r.site.id,
    name: siteLabel(r.site),
    kind: pointKind(r.site).short,
    href: exploreHref(r.site.id, startUtc, days),
    sunlight: pct0(r.summary.illumFraction),
    // On the far side Earth never rises: no period gives it a share.
    earth: r.site.far_side ? 'never: far side' : pct0(r.summary.earthVisFraction),
    longestNight: r.summary.longestDarkH > 0 ? spanShort(r.summary.longestDarkH) : 'none',
    power: powerWords(r, startUtc, days, powered),
    contact: poweredContactWords(plan).value,
    longestOutage: outageWords(plan.longestOutage),
    tone: lit && all ? 'good' : 'bad',
  };
}

/** "A", "A and B", "A, B and C". */
function list(words: string[]): string {
  return words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The best score among the sites and every site that reaches it. */
function best(results: SiteResult[], score: (r: SiteResult) => number): { top: number; names: string[]; winners: SiteResult[] } {
  const top = Math.max(...results.map(score));
  const winners = results.filter((r) => score(r) === top);
  return { top, names: winners.map((r) => siteLabel(r.site)), winners };
}

/** A site may win a measure unless its terrain is incomplete: then its figures can only be too high. */
const trustedTerrain = (r: SiteResult) => r.terrain?.quality !== 'incomplete';

/**
 * One sentence over the table: for a lander landing on the period's first day, the site with the
 * longest time with power, the most sunlight and the most contact with Earth (ties name every site,
 * compared as the table prints them), each site named once with everything it wins. A measure where
 * every site scores nothing names no site and is said to be missing everywhere.
 */
export function bestSentence(results: SiteResult[], startUtc: string, days: number, trusted: (r: SiteResult) => boolean = trustedTerrain): string {
  if (results.length === 0) return '';
  if (results.length === 1) return `Add another site to compare it with ${siteLabel(results[0].site)}.`;
  const hours = days * 24;
  const power = best(results, (r) => poweredHours(r, hours));
  const sun = best(results, (r) => Math.round(r.summary.illumFraction * 100));
  const earth = best(results, (r) => Math.round(r.summary.earthVisFraction * 100));
  const wins: { names: string[]; words: string }[] = [];
  // An incomplete terrain can only overstate a figure, so a site with one never wins a measure. A trusted site that
  // reaches the top still wins (an incomplete one level with it is truly level or lower); a measure whose top only
  // incomplete sites reach names no site, and the sentence says why.
  const withheld: { names: string[]; measures: string[] } = { names: [], measures: [] };
  const win = (m: { top: number; names: string[]; winners: SiteResult[] }, measure: string, figure: string) => {
    if (m.top <= 0) return;
    const sure = m.winners.filter(trusted);
    if (sure.length > 0) {
      wins.push({ names: sure.map((r) => siteLabel(r.site)), words: `${measure} (${figure})` });
      return;
    }
    for (const r of m.winners) if (!withheld.names.includes(siteLabel(r.site))) withheld.names.push(siteLabel(r.site));
    withheld.measures.push(measure);
  };
  win(power, 'the longest time with power', power.top >= hours ? `all ${days} days` : spanShort(power.top));
  win(sun, 'the most sunlight', `${sun.top} %`);
  win(earth, 'the most contact with Earth', `${earth.top} %`);
  const bySites = new Map<string, { names: string[]; words: string[] }>();
  for (const w of wins) {
    const key = w.names.join('\n');
    const group = bySites.get(key) ?? { names: w.names, words: [] };
    group.words.push(w.words);
    bySites.set(key, group);
  }
  const clauses = [...bySites.values()].map((g) => `${list(g.names)} ${g.names.length > 1 ? 'have' : 'has'} ${list(g.words)}`);
  const lacks: string[] = [];
  if (power.top === 0) lacks.push('has power at landing');
  if (sun.top === 0 && earth.top === 0) lacks.push('sees the Sun or Earth');
  else if (sun.top === 0) lacks.push('sees the Sun');
  else if (earth.top === 0) lacks.push('sees Earth');
  if (lacks.length > 0) clauses.push(`none of these sites ${lacks.join(' or ')}`);
  const note = withheld.measures.length > 0 ? withheldNote(withheld.names, withheld.measures) : '';
  if (clauses.length === 0) return note;
  return `Landing on ${dateLong(startUtc, 0)}, ${clauses.join('; ')}.${note ? ` ${note}` : ''}`;
}
