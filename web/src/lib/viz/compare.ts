import { siteLabel } from '../data/loaders';
import { timeWithPower } from '../engine/landing';
import { exploreHref } from '../links';
import type { SiteResult } from '../store/explore';
import { dateLong, pct0, spanShort } from './format';

/** One row of the comparison table: what it says about a site, ready to print. */
export interface CompareRow {
  id: string;
  name: string;
  /** Explore on the same site and period. */
  href: string;
  sunlight: string;
  earth: string;
  longestNight: string;
  power: string;
  verdict: string;
  tone: 'good' | 'bad';
}

/** Two pairs the empty page offers, each a lesson in itself. */
export const READY_PAIRS: { title: string; ids: [string, string] }[] = [
  { title: 'A ridge and the summit 12 km away', ids: ['de_gerlache_rim_2', 'de_gerlache_center_rim_high'] },
  { title: 'A rim in sunlight and a floor in shadow', ids: ['shackleton_center_rim_high', 'shackleton_center'] },
];

/** Hours with power for a lander that lands at the period's start, capped at the period. */
const poweredHours = (r: SiteResult, hours: number) => Math.min(hours, timeWithPower(r.power));

/** A compared site as a row: sunlight and Earth in view over the period, its longest night, and its time with power from the period's first day. */
export function compareRow(r: SiteResult, startUtc: string, days: number): CompareRow {
  const hours = days * 24;
  const powered = poweredHours(r, hours);
  const lit = r.summary.illumFraction > 0;
  const all = powered >= hours;
  return {
    id: r.site.id,
    name: siteLabel(r.site),
    href: exploreHref(r.site.id, startUtc, days),
    sunlight: pct0(r.summary.illumFraction),
    earth: pct0(r.summary.earthVisFraction),
    longestNight: r.summary.longestDarkH > 0 ? spanShort(r.summary.longestDarkH) : 'none',
    power: all ? `all ${days} days` : spanShort(powered),
    verdict: !lit ? 'No sunlight' : all ? `Power for all ${days} days` : `Power for ${spanShort(powered)}, then night`,
    tone: lit && all ? 'good' : 'bad',
  };
}

/** "A", "A and B", "A, B and C". */
function list(words: string[]): string {
  return words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The best score among the sites and every site that reaches it. */
function best(results: SiteResult[], score: (r: SiteResult) => number): { top: number; names: string[] } {
  const top = Math.max(...results.map(score));
  return { top, names: results.filter((r) => score(r) === top).map((r) => siteLabel(r.site)) };
}

/**
 * One sentence over the table: for a lander landing on the period's first day, the site with the
 * longest time with power, the most sunlight and the most contact with Earth (ties name every site,
 * compared as the table prints them), each site named once with everything it wins. A measure where
 * every site scores nothing names no site and is said to be missing everywhere.
 */
export function bestSentence(results: SiteResult[], startUtc: string, days: number): string {
  if (results.length === 0) return '';
  if (results.length === 1) return `Add another site to compare it with ${siteLabel(results[0].site)}.`;
  const hours = days * 24;
  const power = best(results, (r) => poweredHours(r, hours));
  const sun = best(results, (r) => Math.round(r.summary.illumFraction * 100));
  const earth = best(results, (r) => Math.round(r.summary.earthVisFraction * 100));
  const wins: { names: string[]; words: string }[] = [];
  if (power.top > 0) wins.push({ names: power.names, words: `the longest time with power (${power.top >= hours ? `all ${days} days` : spanShort(power.top)})` });
  if (sun.top > 0) wins.push({ names: sun.names, words: `the most sunlight (${sun.top} %)` });
  if (earth.top > 0) wins.push({ names: earth.names, words: `the most contact with Earth (${earth.top} %)` });
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
  return `Landing on ${dateLong(startUtc, 0)}, ${clauses.join('; ')}.`;
}
