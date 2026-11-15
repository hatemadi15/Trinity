import type { Site } from '../data/loaders';
import { checksShort, type Check } from '../plan/requirements';
import { pointKind } from '../data/kind';
import type { TerrainReport } from '../engine/completeness';
import { landerName } from '../lander';
import { outageWords, type Outage } from '../scenario/contact';
import { rankOutcomes as rank } from '../scenario/nearby';
import type { Outcome } from '../scenario/outcome';
import { startWords } from '../scenario/period';
import type { Scenario } from '../scenario/scenario';
import { pct0, spanShort, spanWords } from './format';
import { distanceKm } from './relief';

/** Two pairs the empty page offers, each a lesson in itself. */
export const READY_PAIRS: { title: string; ids: [string, string] }[] = [
  { title: 'A ridge vs the summit 12 km away', ids: ['de_gerlache_rim_2', 'de_gerlache_center_rim_high'] },
  { title: 'A sunlit rim vs a crater floor in shadow', ids: ['shackleton_center_rim_high', 'shackleton_center'] },
];

/** One scenario of a comparison as the page reads it: its settings, its site and its figures once worked out. */
export interface Column {
  scenario: Scenario;
  site: Site;
  siteName: string;
  /** Null while it is worked out, or when it cannot be. */
  outcome: Outcome | null;
  /** What was found of the terrain behind its skyline, once worked out. */
  terrain?: TerrainReport;
  /** The planner's requirements checked against its figures (lib/plan); empty or absent when none is set. */
  checks?: Check[];
  /** A requirement set was not checked against it: the share of terrain versions, which Compare does not work out. */
  unchecked?: boolean;
}

export type Tone = 'better' | 'worse' | 'same';
export interface Cell {
  value: string;
  /** The change from the baseline in words with its sign and units; null for the baseline itself. */
  change: string | null;
  /** Whether that change is better or worse for the lander; null for the baseline. */
  tone: Tone | null;
  /** In the row of your requirements: each requirement met or failed, with its value and margin in words. */
  checks?: { met: boolean; words: string }[];
  /** The best value of its row, among landings whose figures differ: marked in the table. */
  best?: boolean;
}
export interface FigureRow {
  id: 'power' | 'sun' | 'earth' | 'contact' | 'outage' | 'sunset' | 'earthset' | 'night' | 'verdict' | 'requirements';
  name: string;
  /** What the figure means, for the fold under the table. */
  means: string;
  /** One per column; null for a column still being worked out. */
  cells: (Cell | null)[];
}

const MINUS = '−';

/** A change of hours, signed, with its units: "+2 d 2 h", "−2 d 18 h", or "no change". */
export function signedSpan(dh: number): string {
  const h = Math.round(dh);
  if (h === 0) return 'no change';
  return `${h > 0 ? '+' : MINUS}${spanShort(Math.abs(h))}`;
}

/** A change of share in percentage points, from the whole percentages the table shows: "+55 points", "−4 points". */
export function signedPoints(x: number, base: number): string {
  const d = Math.round(x * 100) - Math.round(base * 100);
  if (d === 0) return 'no change';
  return `${d > 0 ? '+' : MINUS}${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'}`;
}

const toneOf = (d: number, moreIsBetter: boolean): Tone => (d === 0 ? 'same' : d > 0 === moreIsBetter ? 'better' : 'worse');

const powerValue = (o: Outcome) => (o.allPeriod ? `all ${o.days} days` : spanShort(o.poweredH));
const powerWords = (o: Outcome) => (o.allPeriod ? `all ${o.days} days` : spanWords(o.poweredH));
const spanOrNone = (h: number) => (h > 0 ? spanShort(h) : 'none');
const wordsOrNone = (h: number) => (h > 0 ? spanWords(h) : 'none');
const outageHours = (o: Outage | null) => o?.hours ?? 0;
const outageSentence = (o: Outage | null) => (!o ? 'none' : `${o.fromStart || o.toEnd ? 'at least ' : ''}${spanWords(o.hours)}`);

/** A first setting after landing: when the body is not there at landing, it says so; with no setting in the period, it says that. */
function setValue(o: Outcome, body: 'sun' | 'earth'): { text: string; rank: number; rise?: number } {
  const there = body === 'sun' ? o.sunAtLanding : o.earthAtLanding;
  const c = body === 'sun' ? o.firstSunset : o.firstEarthset;
  // For the lander a later setting is better, a body missing at landing worst of all; when it is missing, when it first comes.
  if (!there) {
    const rise = body === 'sun' ? o.firstSunriseH : o.firstEarthriseH;
    const lead = body === 'sun' ? 'night at landing' : 'out of view at landing';
    return { text: rise === null ? `${lead}, all the period` : `${lead}, rises after ${spanShort(rise)}`, rank: -1, rise: rise ?? Infinity };
  }
  if (c.inHours === null) return { text: 'none in the period', rank: Infinity };
  return { text: spanShort(c.inHours), rank: c.inHours };
}

function setCell(o: Outcome, b: Outcome, body: 'sun' | 'earth'): Cell {
  const x = setValue(o, body);
  const y = setValue(b, body);
  // Missing at landing in both: the one that rises sooner is better.
  if (x.rise !== undefined && y.rise !== undefined) {
    const sooner = y.rise - x.rise;
    const known = Number.isFinite(sooner);
    const change = x.text === y.text ? 'no change' : known ? `${spanShort(Math.abs(sooner))} ${sooner > 0 ? 'sooner' : 'later'}` : `was ${y.text}`;
    return { value: x.text, change, tone: toneOf(known ? sooner : x.rise === y.rise ? 0 : x.rise < y.rise ? 1 : -1, true) };
  }
  const both = Number.isFinite(x.rank) && Number.isFinite(y.rank) && x.rank >= 0 && y.rank >= 0;
  const d = both ? x.rank - y.rank : x.rank === y.rank ? 0 : x.rank > y.rank ? 1 : -1;
  const change = x.text === y.text ? 'no change' : both ? `${spanShort(Math.abs(d))} ${d > 0 ? 'later' : 'sooner'}` : x.rank === y.rank ? 'changed' : `was ${y.text}`;
  return { value: x.text, change, tone: toneOf(d, true) };
}

/** The figures of each scenario, the change from the baseline (the first column) beside each, better or worse for the lander. */
export function figureRows(cols: Column[]): FigureRow[] {
  const b = cols[0]?.outcome ?? null;
  const row = (id: FigureRow['id'], name: string, means: string, cell: (o: Outcome, b: Outcome, c: Column) => Cell, value: (o: Outcome, c: Column) => string): FigureRow => ({
    id,
    name,
    means,
    cells: cols.map((c, i) => (!c.outcome ? null : i === 0 || !b ? { value: value(c.outcome, c), change: null, tone: null } : cell(c.outcome, b, c))),
  });
  // On the far side Earth never rises: no period gives it a share.
  const FAR = 'never: far side';
  const farSide = (cell: (o: Outcome, b: Outcome) => Cell) => (o: Outcome, base: Outcome, c: Column): Cell => (c.site.far_side ? { ...cell(o, base), value: FAR } : cell(o, base));
  const hoursCell = (get: (o: Outcome) => number, value: (o: Outcome) => string, moreIsBetter: boolean) => (o: Outcome, base: Outcome): Cell => {
    const d = get(o) - get(base);
    return { value: value(o), change: signedSpan(d), tone: toneOf(Math.round(d), moreIsBetter) };
  };
  const shareCell = (get: (o: Outcome) => number) => (o: Outcome, base: Outcome): Cell => ({
    value: pct0(get(o)),
    change: signedPoints(get(o), get(base)),
    tone: toneOf(Math.round(get(o) * 100) - Math.round(get(base) * 100), true),
  });
  const rows: FigureRow[] = [
    row('power', 'Time with power', 'From landing until the battery first runs out, by the power model: the panel, the load and the battery, hour by hour.', hoursCell((o) => o.poweredH, powerValue, true), powerValue),
    row('sun', 'Sunlight', 'The share of the period with any part of the Sun above the hills.', shareCell((o) => o.sunFraction), (o) => pct0(o.sunFraction)),
    row('earth', 'Earth in view', 'The share of the period with the centre of Earth above the hills by the height set: a clear line to Earth, not a working radio link.', farSide(shareCell((o) => o.earthFraction)), (o, c) => (c.site.far_side ? FAR : pct0(o.earthFraction))),
    row('contact', 'Radio contact while it has power', 'Hours with Earth in view while the lander has power, before the battery first runs out: a clear line to Earth, not a booked antenna.', hoursCell((o) => o.poweredContactH, (o) => spanOrNone(o.poweredContactH), true), (o) => spanOrNone(o.poweredContactH)),
    row('outage', 'Longest time without Earth', 'The longest stretch of the period without Earth in view; "at least" when the start or end of the period cuts it.', hoursCell((o) => outageHours(o.outage), (o) => outageWords(o.outage), false), (o) => outageWords(o.outage)),
    row('sunset', 'First sunset after landing', 'How long after landing the Sun first sets behind the hills.', (o, base) => setCell(o, base, 'sun'), (o) => setValue(o, 'sun').text),
    row('earthset', 'Earth first sets after landing', 'How long after landing Earth first sets behind the hills.', (o, base) => setCell(o, base, 'earth'), (o) => setValue(o, 'earth').text),
    row('night', 'Longest night', 'The longest stretch of the period with no Sun at all.', hoursCell((o) => o.longestNightH, (o) => spanOrNone(o.longestNightH), false), (o) => spanOrNone(o.longestNightH)),
    row(
      'verdict',
      'What happens',
      'What happens to the lander, in the words of the forecast.',
      (o, base) => ({ value: o.verdict, change: null, tone: o.verdict === base.verdict ? 'same' : toneOf(o.poweredH - base.poweredH, true) }),
      (o) => o.verdict,
    ),
    ...requirementsRow(cols),
  ];
  const failed = (c: Column) => (c.checks ?? []).filter((x) => !x.met).length;
  /** What makes a figure better, as a number that is larger when it is: the row's best cell is marked by it. The longest time without Earth is left out: the period's ends cut it ("at least"), so it cannot be ordered surely. */
  const score: Partial<Record<FigureRow['id'], (c: Column) => number | null>> = {
    power: (c) => Math.round(c.outcome!.poweredH),
    sun: (c) => Math.round(c.outcome!.sunFraction * 100),
    earth: (c) => Math.round(c.outcome!.earthFraction * 100),
    contact: (c) => Math.round(c.outcome!.poweredContactH),
    night: (c) => -Math.round(c.outcome!.longestNightH),
    requirements: (c) => (c.checks && c.checks.length > 0 ? -failed(c) : null),
  };
  for (const r of rows) markBest(r, cols, score[r.id]);
  return rows;
}

/**
 * Marks the best cell or cells of a row: only when every landing has its figure and they are not all level. A landing
 * on incomplete terrain is never marked, as its figures may be too good; when it shows the best value, none is marked.
 */
function markBest(row: FigureRow, cols: Column[], score: ((c: Column) => number | null) | undefined): void {
  if (!score || cols.length < 2 || cols.some((c) => !c.outcome)) return;
  const values = cols.map(score);
  if (values.some((v) => v === null)) return;
  const v = values as number[];
  if (v.every((x) => x === v[0])) return;
  const sure = cols.map((c) => c.terrain?.quality !== 'incomplete');
  const top = Math.max(...v.filter((_, i) => sure[i]));
  if (!Number.isFinite(top) || v.some((x, i) => !sure[i] && x > top)) return;
  row.cells.forEach((cell, i) => {
    if (cell && sure[i] && v[i] === top) cell.best = true;
  });
}

/**
 * The planner's requirements: how many of them each scenario fails, how many fewer or more than the baseline, and each
 * check met or failed with its value and margin; no row when none is set.
 */
function requirementsRow(cols: Column[]): FigureRow[] {
  if (!cols.some((c) => c.checks && c.checks.length > 0)) return [];
  const failed = (c: Column) => (c.checks ?? []).filter((x) => !x.met).length;
  const base = cols[0];
  return [
    {
      id: 'requirements',
      name: 'Your requirements',
      means: 'The mission requirements set on Explore (Options), or carried by the link or file, checked against each landing at its own period start: how many it fails and, one tap on the row’s name away, each one met or failed with the value reached and the margin.',
      cells: cols.map((c, i) => {
        if (!c.outcome || !c.checks || c.checks.length === 0) return null;
        const value = checksShort(c.checks, c.unchecked) ?? '';
        const checks = c.checks.map((x) => ({ met: x.met, words: x.words }));
        if (i === 0) return { value, change: null, tone: null, checks };
        const d = failed(c) - failed(base);
        return { value, change: d === 0 ? 'same' : d < 0 ? `${-d} fewer failed` : `${d} more failed`, tone: d === 0 ? 'same' : d < 0 ? 'better' : 'worse', checks };
      }),
    },
  ];
}

export interface SettingCell {
  value: string;
  /** How it differs from the baseline, in words; null where it is the same, and for the baseline. */
  change: string | null;
  /** For the site: what kind of point it is, in a few words ("Centre of a region, ±5 km"). */
  kind?: string;
}
export interface SettingRow {
  id: 'site' | 'landing' | 'period' | 'lander' | 'mast' | 'clearance';
  name: string;
  cells: SettingCell[];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A landing for a table cell: "6 Jan 2027, 00:00 UTC". */
export function landingShort(startUtc: string): string {
  const d = new Date(`${startUtc}Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${startUtc.slice(11, 16)} UTC`;
}
const hoursBetween = (a: string, b: string) => Math.round((Date.parse(`${a}Z`) - Date.parse(`${b}Z`)) / 3_600_000);

/** The settings of each scenario, each marked where it differs from the baseline's. */
export function settingRows(cols: Column[]): SettingRow[] {
  const b = cols[0];
  const cells = (value: (c: Column) => string, change: (c: Column) => string | null) => cols.map((c, i) => ({ value: value(c), change: i === 0 || !b ? null : change(c) }));
  const differs = (value: (c: Column) => string) => (c: Column) => (value(c) === value(b) ? null : 'changed');
  const lander = (c: Column) => landerName(c.scenario.power);
  return [
    {
      id: 'site',
      name: 'Site',
      cells: cells(
        (c) => c.siteName,
        (c) => (c.scenario.siteId === b.scenario.siteId ? null : `${Math.round(distanceKm(b.site, c.site))} km from ${b.siteName}`),
      ).map((cell, i) => ({ ...cell, kind: pointKind(cols[i].site).short })),
    },
    {
      id: 'landing',
      name: 'Landing (UTC)',
      cells: cells(
        (c) => landingShort(c.scenario.startUtc),
        (c) => {
          const d = hoursBetween(c.scenario.startUtc, b.scenario.startUtc);
          return d === 0 ? null : `${spanWords(Math.abs(d))} ${d > 0 ? 'later' : 'earlier'}`;
        },
      ),
    },
    { id: 'period', name: 'Stay', cells: cells((c) => `${c.scenario.days} days`, differs((c) => String(c.scenario.days))) },
    { id: 'lander', name: 'Lander', cells: cells(lander, (c) => (JSON.stringify(c.scenario.power) === JSON.stringify(b.scenario.power) ? null : 'changed')) },
    { id: 'mast', name: 'Mast', cells: cells((c) => `${c.scenario.mastM} m`, differs((c) => String(c.scenario.mastM))) },
    { id: 'clearance', name: 'Earth counts from', cells: cells((c) => `${c.scenario.minEarthElDeg}° above the hills`, differs((c) => String(c.scenario.minEarthElDeg))) },
  ];
}

/** A point the app worked out from NASA's heights (a rim's highest ground), not one checked as a safe place to land. */
function unchecked(site: Site): boolean {
  return (site as Site & { kind?: string }).kind === 'derived' || site.source.startsWith('derived');
}

/** A scenario's label in sentences, in quotation marks. */
const quoted = (c: Column) => `“${c.scenario.label}”`;

/** The first sentence of the answer's reasons that is not about Earth: why the power lasts as long as it does. */
function powerReason(o: Outcome): string | null {
  return o.answer.sentences.find((s) => !/^(No radio contact|Earth is in view)/.test(s)) ?? null;
}

/** The comparison in words, top to bottom: what changed at the original site, then the alternative that works better and its trade-offs. */
export interface Story {
  /** One paragraph per scenario at the baseline's site: what changed, and why. */
  atOriginal: string[];
  /** The best scenario at another site, against the scenario it was made from (the baseline when none). */
  alternative: { lead: string; tradeoffs: string[] } | null;
}

function againstWords(name: string, x: string, y: string, better: number): string {
  return `${name}: ${x} against ${y}: ${better === 0 ? 'the same' : better > 0 ? 'better' : 'worse'}.`;
}

export function story(cols: Column[]): Story {
  const b = cols[0];
  if (!b?.outcome) return { atOriginal: [], alternative: null };
  const bo = b.outcome;
  const atOriginal = cols.slice(1).flatMap((c) => {
    const o = c.outcome;
    if (!o || c.scenario.siteId !== b.scenario.siteId) return [];
    // The date is the table's Landing row: the sentence keeps to the label.
    const head = c.scenario.label;
    const power = o.poweredH === bo.poweredH ? `power as before: ${o.verdict}.` : `power for ${powerWords(o)} instead of ${powerWords(bo)}.`;
    const reason = o.poweredH === bo.poweredH ? null : powerReason(o);
    // Sunlight and radio contact are the table's rows: the sentence keeps to the power and its reason.
    return [[`${head}: ${power}`, reason].filter(Boolean).join(' ')];
  });

  const byId = new Map(cols.map((c) => [c.scenario.id, c]));
  const others = cols.filter((c, i) => i > 0 && c.outcome && c.scenario.siteId !== b.scenario.siteId).sort((x, y) => rank(x.outcome!, y.outcome!));
  const best = others[0];
  if (!best?.outcome) return { atOriginal, alternative: null };
  const ref = (best.scenario.from && byId.get(best.scenario.from)?.outcome ? byId.get(best.scenario.from)! : b) as Column;
  const o = best.outcome;
  const r = ref.outcome!;
  // An incomplete terrain can only overstate a figure, so a site with one is never named as working better.
  if (best.terrain?.quality === 'incomplete' && rank(o, r) < 0) {
    return { atOriginal, alternative: { lead: `The terrain at ${best.siteName} is incomplete, so it is not named as working better than ${quoted(ref)}: its figures may be too high.`, tradeoffs: [] } };
  }
  const works = rank(o, r) < 0;
  const km = Math.round(distanceKm(b.site, best.site));
  const when =
    best.scenario.startUtc === ref.scenario.startUtc
      ? ' at the same landing time'
      : `, landing ${startWords(best.scenario.startUtc)} against ${startWords(ref.scenario.startUtc)}`;
  // A high point worked out from the heights is said to be one, as the forecast's nearby advice says it: never a checked place to land.
  const where = `${km} km${unchecked(best.site) ? ', not checked for landing' : ''}`;
  const lead = `${best.siteName} (${where}) ${works ? 'works better' : 'does not work better'} than ${quoted(ref)}${when}: power for ${powerWords(o)} instead of ${powerWords(r)}.`;
  const tradeoffs = [
    againstWords('Sunlight', pct0(o.sunFraction), pct0(r.sunFraction), Math.round(o.sunFraction * 100) - Math.round(r.sunFraction * 100)),
    againstWords('Radio contact while it has power', wordsOrNone(o.poweredContactH), wordsOrNone(r.poweredContactH), o.poweredContactH - r.poweredContactH),
    againstWords('Earth in view', pct0(o.earthFraction), pct0(r.earthFraction), Math.round(o.earthFraction * 100) - Math.round(r.earthFraction * 100)),
    againstWords('Longest time without Earth', outageSentence(o.outage), outageSentence(r.outage), outageHours(r.outage) - outageHours(o.outage)),
  ];
  return { atOriginal, alternative: { lead, tradeoffs } };
}

/**
 * Whether the scenarios share a landing time, in one sentence: a same-day comparison says so, one across dates says so
 * too, and a scenario at its site's own best time is named, so the two kinds of comparison are never mixed silently.
 */
export function timingLine(cols: Column[]): string {
  if (cols.length === 0) return '';
  if (cols.length === 1) return `Your landing is ${startWords(cols[0].scenario.startUtc)}.`;
  const same = cols.every((c) => c.scenario.startUtc === cols[0].scenario.startUtc);
  const lead = same ? `Every landing here is at the same time: ${startWords(cols[0].scenario.startUtc)}.` : 'Landing times differ: dates change as well as places.';
  const best = cols.filter((c) => c.scenario.timing === 'site-best').map((c) => `${quoted(c)} lands at ${c.siteName}’s own best time in its period, not a time it shares by choice.`);
  return [lead, ...best].join(' ');
}

/** A landing as the summary names it: the first is the visitor's own, the others go by their label. */
const named = (c: Column, cols: Column[]) => (cols[0] === c ? 'Your landing' : quoted(c));

/** Which landing works best, and why, in one line; null until two or more are worked out. */
export interface Verdict {
  /** The column that works best; null when the best are level, or cannot be named. */
  index: number | null;
  line: string;
}

/**
 * The one-line summary over the comparison: the landing with the longest time with power, then the most radio contact
 * while it has power, then the most sunlight (the order the nearby search ranks by), with the figure that decided it.
 * Landings that are level are said to be level, and a landing on incomplete terrain is never named: its figures may be
 * too high.
 */
export function verdictLine(cols: Column[]): Verdict | null {
  if (cols.length < 2 || cols.some((c) => !c.outcome)) return null;
  const order = [...cols].sort((x, y) => rank(x.outcome!, y.outcome!));
  const [top, next] = order;
  const o = top.outcome!;
  const n = next.outcome!;
  if (top.terrain?.quality === 'incomplete') {
    return { index: null, line: `The terrain at ${top.siteName} is incomplete, so no landing is named as working best: its figures may be too high.` };
  }
  const contact = o.poweredContactH > 0 ? `${spanWords(o.poweredContactH)} of radio contact while it has power` : 'no radio contact while it has power';
  if (rank(o, n) === 0) {
    const level = order.filter((c) => rank(c.outcome!, o) === 0).map((c) => named(c, cols));
    const names = level.length === cols.length ? 'All of these landings' : `${level.slice(0, -1).join(', ')} and ${level[level.length - 1]}`;
    return { index: null, line: `${names} work equally well: power for ${powerWords(o)}, with ${contact}.` };
  }
  const why =
    o.poweredH !== n.poweredH
      ? `power for ${powerWords(o)}, the longest here, with ${contact}`
      : o.poweredContactH !== n.poweredContactH
        ? `power for ${powerWords(o)}, as long as any here, with the most radio contact while it has power: ${wordsOrNone(o.poweredContactH)}`
        : `power for ${powerWords(o)}, as long as any here, with the most sunlight: ${pct0(o.sunFraction)}`;
  const caveat = unchecked(top.site) ? ` ${top.siteName} is a high point worked out from the heights, not checked for landing.` : '';
  return { index: cols.indexOf(top), line: `${named(top, cols)} works best of these ${cols.length} landings: ${why}.${caveat}` };
}
