import type { Site } from '../data/loaders';
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
  { title: 'A ridge and the summit 12 km away', ids: ['de_gerlache_rim_2', 'de_gerlache_center_rim_high'] },
  { title: 'A rim in sunlight and a floor in shadow', ids: ['shackleton_center_rim_high', 'shackleton_center'] },
];

/** One scenario of a comparison as the page reads it: its settings, its site and its figures once worked out. */
export interface Column {
  scenario: Scenario;
  site: Site;
  siteName: string;
  /** Null while it is worked out, or when it cannot be. */
  outcome: Outcome | null;
}

export type Tone = 'better' | 'worse' | 'same';
export interface Cell {
  value: string;
  /** The change from the baseline in words with its sign and units; null for the baseline itself. */
  change: string | null;
  /** Whether that change is better or worse for the lander; null for the baseline. */
  tone: Tone | null;
}
export interface FigureRow {
  id: 'power' | 'sun' | 'earth' | 'contact' | 'outage' | 'sunset' | 'earthset' | 'night' | 'verdict';
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
function setValue(o: Outcome, body: 'sun' | 'earth'): { text: string; rank: number } {
  const there = body === 'sun' ? o.sunAtLanding : o.earthAtLanding;
  const c = body === 'sun' ? o.firstSunset : o.firstEarthset;
  // For the lander a later setting is better, a body missing at landing worst of all.
  if (!there) return { text: body === 'sun' ? 'night at landing' : 'not in view at landing', rank: -1 };
  if (c.inHours === null) return { text: 'none in the period', rank: Infinity };
  return { text: `${spanShort(c.inHours)} after landing`, rank: c.inHours };
}

function setCell(o: Outcome, b: Outcome, body: 'sun' | 'earth'): Cell {
  const x = setValue(o, body);
  const y = setValue(b, body);
  const both = Number.isFinite(x.rank) && Number.isFinite(y.rank) && x.rank >= 0 && y.rank >= 0;
  const d = both ? x.rank - y.rank : x.rank === y.rank ? 0 : x.rank > y.rank ? 1 : -1;
  const change = x.text === y.text ? 'no change' : both ? `${spanShort(Math.abs(d))} ${d > 0 ? 'later' : 'sooner'}` : `was ${y.text}`;
  return { value: x.text, change, tone: toneOf(d, true) };
}

/** The figures of each scenario, the change from the baseline (the first column) beside each, better or worse for the lander. */
export function figureRows(cols: Column[]): FigureRow[] {
  const b = cols[0]?.outcome ?? null;
  const row = (id: FigureRow['id'], name: string, means: string, cell: (o: Outcome, b: Outcome) => Cell, value: (o: Outcome) => string): FigureRow => ({
    id,
    name,
    means,
    cells: cols.map((c, i) => (!c.outcome ? null : i === 0 || !b ? { value: value(c.outcome), change: null, tone: null } : cell(c.outcome, b))),
  });
  const hoursCell = (get: (o: Outcome) => number, value: (o: Outcome) => string, moreIsBetter: boolean) => (o: Outcome, base: Outcome): Cell => {
    const d = get(o) - get(base);
    return { value: value(o), change: signedSpan(d), tone: toneOf(Math.round(d), moreIsBetter) };
  };
  const shareCell = (get: (o: Outcome) => number) => (o: Outcome, base: Outcome): Cell => ({
    value: pct0(get(o)),
    change: signedPoints(get(o), get(base)),
    tone: toneOf(Math.round(get(o) * 100) - Math.round(get(base) * 100), true),
  });
  return [
    row('power', 'Time with power', 'From landing until the battery first runs out, by the power model: the panel, the load and the battery, hour by hour.', hoursCell((o) => o.poweredH, powerValue, true), powerValue),
    row('sun', 'Sunlight', 'The share of the period with any part of the Sun above the hills.', shareCell((o) => o.sunFraction), (o) => pct0(o.sunFraction)),
    row('earth', 'Earth in view', 'The share of the period with the centre of Earth above the hills by the height set: a clear line to Earth, not a working radio link.', shareCell((o) => o.earthFraction), (o) => pct0(o.earthFraction)),
    row('contact', 'Earth in view with power', 'Hours with Earth in view while the lander has power, before the battery first runs out.', hoursCell((o) => o.poweredContactH, (o) => spanOrNone(o.poweredContactH), true), (o) => spanOrNone(o.poweredContactH)),
    row('outage', 'Longest time without Earth', 'The longest stretch of the period without Earth in view; "at least" when the start or end of the period cuts it.', hoursCell((o) => outageHours(o.outage), (o) => outageWords(o.outage), false), (o) => outageWords(o.outage)),
    row('sunset', 'First sunset after landing', 'How long after landing the Sun first sets behind the hills.', (o, base) => setCell(o, base, 'sun'), (o) => setValue(o, 'sun').text),
    row('earthset', 'Earth first sets after landing', 'How long after landing Earth first sets behind the hills.', (o, base) => setCell(o, base, 'earth'), (o) => setValue(o, 'earth').text),
    row('night', 'Longest night', 'The longest stretch of the period with no Sun at all.', hoursCell((o) => o.longestNightH, (o) => spanOrNone(o.longestNightH), false), (o) => spanOrNone(o.longestNightH)),
    row(
      'verdict',
      'The answer',
      'What happens to the lander, in the words of the forecast.',
      (o, base) => ({ value: o.verdict, change: null, tone: o.verdict === base.verdict ? 'same' : toneOf(o.poweredH - base.poweredH, true) }),
      (o) => o.verdict,
    ),
  ];
}

export interface SettingCell {
  value: string;
  /** How it differs from the baseline, in words; null where it is the same, and for the baseline. */
  change: string | null;
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
      ),
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
    { id: 'mast', name: 'Mast for panel and antenna', cells: cells((c) => `${c.scenario.mastM} m`, differs((c) => String(c.scenario.mastM))) },
    { id: 'clearance', name: 'Earth counts from', cells: cells((c) => `${c.scenario.minEarthElDeg}° above the hills`, differs((c) => String(c.scenario.minEarthElDeg))) },
  ];
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
    const head = `${c.scenario.label} (${startWords(c.scenario.startUtc)})`;
    const power = o.poweredH === bo.poweredH ? `power as before: ${o.verdict}.` : `power for ${powerWords(o)} instead of ${powerWords(bo)}.`;
    const reason = o.poweredH === bo.poweredH ? null : powerReason(o);
    const sun = `Sunlight ${pct0(o.sunFraction)} of the period instead of ${pct0(bo.sunFraction)}`;
    const contact = o.poweredContactH === bo.poweredContactH ? `Earth in view with power: ${wordsOrNone(o.poweredContactH)}, as before.` : `Earth in view with power: ${wordsOrNone(o.poweredContactH)} instead of ${wordsOrNone(bo.poweredContactH)}.`;
    return [[`${head}: ${power}`, reason, `${sun}; ${contact}`].filter(Boolean).join(' ')];
  });

  const byId = new Map(cols.map((c) => [c.scenario.id, c]));
  const others = cols.filter((c, i) => i > 0 && c.outcome && c.scenario.siteId !== b.scenario.siteId).sort((x, y) => rank(x.outcome!, y.outcome!));
  const best = others[0];
  if (!best?.outcome) return { atOriginal, alternative: null };
  const ref = (best.scenario.from && byId.get(best.scenario.from)?.outcome ? byId.get(best.scenario.from)! : b) as Column;
  const o = best.outcome;
  const r = ref.outcome!;
  const works = rank(o, r) < 0;
  const km = Math.round(distanceKm(b.site, best.site));
  const when =
    best.scenario.startUtc === ref.scenario.startUtc
      ? ` at the same landing time (${startWords(best.scenario.startUtc)})`
      : `, landing at another time (${startWords(best.scenario.startUtc)} against ${startWords(ref.scenario.startUtc)})`;
  const lead = `${best.siteName}, ${km} km from ${b.siteName}, ${works ? 'works better' : 'does not work better'} than ${quoted(ref)}${when}: power for ${powerWords(o)} instead of ${powerWords(r)}.`;
  const tradeoffs = [
    againstWords('Sunlight', `${pct0(o.sunFraction)} of the period`, pct0(r.sunFraction), Math.round(o.sunFraction * 100) - Math.round(r.sunFraction * 100)),
    againstWords('Earth in view with power', wordsOrNone(o.poweredContactH), wordsOrNone(r.poweredContactH), o.poweredContactH - r.poweredContactH),
    againstWords('Earth in view', `${pct0(o.earthFraction)} of the period`, pct0(r.earthFraction), Math.round(o.earthFraction * 100) - Math.round(r.earthFraction * 100)),
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
  const same = cols.every((c) => c.scenario.startUtc === cols[0].scenario.startUtc);
  const lead = same ? `Same landing time for every scenario: ${startWords(cols[0].scenario.startUtc)}.` : 'Landing times differ: the figures compare different dates as well as places.';
  const best = cols.filter((c) => c.scenario.timing === 'site-best').map((c) => `${quoted(c)} lands at ${c.siteName}’s own best time in its period, not a time it shares by choice.`);
  return [lead, ...best].join(' ');
}
