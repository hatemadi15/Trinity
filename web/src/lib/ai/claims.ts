import { spanWords } from '../viz/format';
import type { StateSummary } from './state-summary';

/**
 * The claim checker for generated text (spec 23): reads a narration or a planner reply into claims, each a
 * number with its unit, the measure it is attached to, the site and its sign or direction, or a stated
 * state ("the Sun never sets", "runs out"), a comparison or a cause, and checks each one against the named
 * fields of the state summary. A right number on the wrong measure or the wrong site, a flipped sign or
 * hemisphere, a wrong unit, a wrong direction or a cause the figures do not give fails, and so does a number
 * the checker cannot tie to a figure: the deterministic engine stays the authority.
 */

/** What a figure is measured in once the units a reader writes are converted (kW to W, days to hours). */
type Unit = 'pct' | 'h' | 'W' | 'Wh' | 'm2' | 'm' | 'deg' | 'count';
/** How a claim relates its number to the figure: equal within rounding, about, more or less than, nearly. */
type Rel = 'eq' | 'approx' | 'gt' | 'ge' | 'lt' | 'le' | 'near' | 'justOver';

interface Field {
  unit: Unit;
  values: number[];
  /** The figure's own rounding in the state (three-decimal fractions, a derived product), in its unit. */
  tol: number;
  what: string;
  /** A setting the user can change: in a planner reply, the user's own number may stand for it. */
  settable?: boolean;
  /** A threshold, written "at least 3°": the words "at least" give the setting, not a bound on it. */
  threshold?: boolean;
}
type Fields = Record<string, Field | undefined>;

type SiteRef = { kind: 'selected' } | { kind: 'compare'; i: number } | { kind: 'other'; name: string };

export interface SentenceCheck {
  text: string;
  ok: boolean;
  problems: string[];
}

export interface ClaimCheck {
  ok: boolean;
  sentences: SentenceCheck[];
  problems: string[];
}

export interface ClaimOptions {
  /** 'narration' (default): every sentence must hold up, and naming a site outside the figures fails. 'reply': a planner reply. */
  mode?: 'narration' | 'reply';
  /** Every site name the app knows (the catalogue's names and labels): one outside the state is a site the figures do not cover. */
  siteNames?: readonly string[];
  /** Numbers the user typed (reply mode): one may stand for a setting the user can change, never for a computed figure. */
  vouched?: Iterable<string>;
}

/** The measures of the selected site, from the state's named fields; a few are products of two of them. */
function siteFields(s: StateSummary): Fields {
  const { summary: m, power: p } = s;
  const H = m.hours;
  const f3 = 0.05; // a three-decimal fraction, in percentage points
  const hTol = 0.0005 * H; // the same rounding carried into a count of hours
  return {
    illum: { unit: 'pct', values: [m.illumFraction * 100], tol: f3, what: 'sunlight' },
    meanSun: { unit: 'pct', values: [m.meanSunFraction * 100], tol: f3, what: 'the mean share of the Sun in view' },
    darkFrac: { unit: 'pct', values: [(1 - m.illumFraction) * 100], tol: f3, what: 'night' },
    sunlitH: { unit: 'h', values: [m.illumFraction * H], tol: hTol, what: 'the hours of sunlight' },
    longestDark: { unit: 'h', values: [m.longestDarkH], tol: 0, what: 'the longest night' },
    earthVis: { unit: 'pct', values: [m.earthVisFraction * 100], tol: f3, what: 'Earth in view' },
    earthVisH: { unit: 'h', values: [m.earthVisFraction * H], tol: hTol, what: 'the hours with Earth in view' },
    earthOutFrac: { unit: 'pct', values: [(1 - m.earthVisFraction) * 100], tol: f3, what: 'Earth out of view' },
    longestGap: { unit: 'h', values: [m.longestEarthGapH], tol: 0, what: 'the longest gap without Earth in view' },
    joint: { unit: 'pct', values: [m.jointFraction * 100], tol: f3, what: 'the Sun and Earth in view together' },
    jointH: { unit: 'h', values: [m.jointFraction * H], tol: hTol, what: 'the hours with the Sun and Earth in view together' },
    socMin: { unit: 'pct', values: [p.socMin * 100], tol: f3, what: "the battery's lowest charge" },
    brownoutH: { unit: 'h', values: [p.brownoutHours], tol: 0, what: 'the hours without power' },
    meanPower: { unit: 'W', values: [p.meanPowerW], tol: 0.05, what: 'the mean panel power' },
    poweredH: { unit: 'h', values: [p.poweredHours], tol: 0, what: 'the time with power from landing' },
    contactH: { unit: 'h', values: [p.contactHours], tol: 0, what: 'the hours with Earth in view while it has power' },
    contactFrac: p.poweredHours > 0 ? { unit: 'pct', values: [(100 * p.contactHours) / p.poweredHours], tol: 0, what: 'the share of the time with power that has Earth in view' } : undefined,
    lat: { unit: 'deg', values: [s.site.lat], tol: 0, what: 'the latitude' },
    lon: { unit: 'deg', values: [s.site.lon], tol: 0, what: 'the longitude' },
  };
}

/** The lander, the period and the count of sites: the same whichever site a sentence is about. */
function sharedFields(s: StateSummary): Fields {
  const c = s.params.power;
  return {
    area: { unit: 'm2', values: [c.areaM2], tol: 0, what: 'the panel area', settable: true },
    efficiency: { unit: 'pct', values: [c.efficiency * 100], tol: 0, what: 'the panel efficiency', settable: true },
    load: { unit: 'W', values: [c.loadW], tol: 0, what: 'the load', settable: true },
    battery: { unit: 'Wh', values: [c.batteryWh], tol: 0, what: 'the battery', settable: true },
    initialSoc: { unit: 'pct', values: [c.initialSocFraction * 100], tol: 0, what: "the battery's charge at landing", settable: true },
    azimuth: { unit: 'deg', values: [c.panelAzimuthDeg], tol: 0, what: "the panel's azimuth", settable: true },
    batteryH: c.loadW > 0 ? { unit: 'h', values: [c.batteryWh / c.loadW], tol: 0, what: 'how long a full battery carries the load' } : undefined,
    minEarthEl: { unit: 'deg', values: [s.params.minEarthElDeg], tol: 0, what: 'how far Earth must clear the hills to count as in view', settable: true, threshold: true },
    mast: { unit: 'm', values: [s.params.mastM], tol: 0, what: 'the mast', settable: true },
    windowH: { unit: 'h', values: [s.window.days * 24], tol: 0, what: 'the period', settable: true },
    siteCount: { unit: 'count', values: [s.compare.length, s.compare.length + 1], tol: 0, what: 'the number of sites' },
  };
}

/** A compared site: the state gives its sunlight, Earth in view and whether the lander keeps power there. */
function compareFields(row: StateSummary['compare'][number]): Fields {
  return {
    illum: { unit: 'pct', values: [row.illumFraction * 100], tol: 0.05, what: 'sunlight' },
    earthVis: { unit: 'pct', values: [row.earthVisFraction * 100], tol: 0.05, what: 'Earth in view' },
  };
}

const SITE_SCOPED = new Set(['illum', 'meanSun', 'darkFrac', 'sunlitH', 'longestDark', 'earthVis', 'earthVisH', 'earthOutFrac', 'longestGap', 'joint', 'jointH', 'socMin', 'brownoutH', 'meanPower', 'poweredH', 'contactH', 'contactFrac', 'lat', 'lon']);

/**
 * The words that tie a number to a measure, by the number's unit. `before`: the word comes before the
 * number ("over the 30 days"); `after`: after it ("30 days from", "of that time"); otherwise either side.
 */
interface Cue {
  re: RegExp;
  keys: Partial<Record<Unit, string[]>>;
  dir?: 'before' | 'after';
}
const CUES: Cue[] = [
  { re: /\b(?:both|simultaneous(?:ly)?|at the same time|at once|together|jointly)\b|\bsun and earth\b|\bearth and (?:the )?sun\b/g, keys: { pct: ['joint'], h: ['jointH'] } },
  { re: /\bmean\b|\baverag\w*|\bon average\b|\b(?:mean|average) (?:panel |solar )?power\b/g, keys: { pct: ['meanSun'], W: ['meanPower'] } },
  { re: /\bdis[ck]\b/g, keys: { pct: ['meanSun'] } },
  { re: /\bsun(?:light|lit|shine|'s)?\b|\billuminat\w*|\bdaylight\b|\blit\b|\bsolar (?:power|energy|input|illumination)\b/g, keys: { pct: ['illum'], h: ['sunlitH'] } },
  { re: /\bnights?\b|\bdark(?:ness)?\b|\bshadow(?:ed|s)?\b/g, keys: { h: ['longestDark'], pct: ['darkFrac'] } },
  { re: /\bearth(?:'s)?\b|\bradio\b|\bcontact\b|\bcommunicat\w*|\bline of sight\b|\bdirect[- ]to[- ]earth\b/g, keys: { pct: ['earthVis'], h: ['earthVisH'] } },
  { re: /\bgaps?\b|\bout of view\b|\bblackouts?\b|\boutages?\b|\bwithout (?:radio )?contact\b|\bno (?:radio )?contact\b|\bout of (?:touch|contact|sight)\b|\bwithout earth\b|\babsences?\b|\bhidden\b|\bbelow the horizon\b/g, keys: { h: ['longestGap'], pct: ['earthOutFrac'] } },
  { re: /\bof (?:that|this) time\b|\bof (?:the|its|that) (?:powered|power-on) (?:time|hours|period)\b|\bof those hours\b|\bof them\b|\bwhile (?:it |the lander )?(?:has|had|keeps|kept) power\b|\bwhile (?:it is |it's |the lander is )?powered\b|\bwith power\b|\bin that time\b|\bduring that time\b/g, keys: { h: ['contactH'], pct: ['contactFrac'] }, dir: 'after' },
  { re: /\bwithout power\b|\bno power\b|\bunpowered\b|\bbrown-?outs?\b|\bpower(?:ed)? off\b|\bswitched off\b|\b(?:is|stays|remains|sits|goes) (?:empty|flat|drained|off)\b/g, keys: { h: ['brownoutH'] } },
  { re: /\bpower(?:ed)?\b|\bsurviv\w*|\boperat\w*|\bruns? (?:out|for|dry|flat)\b|\bstays? (?:on|powered|alive)\b|\bempty\b|\bempties\b/g, keys: { h: ['poweredH'], W: ['meanPower'] } },
  { re: /\bloads?\b|\buses\b|\bdraws?\b|\bconsum\w*|\bdemand\b|\bneeds\b|\brequires?\b/g, keys: { W: ['load'] } },
  // "lasts 10 hours at 200 W": the load the battery carries.
  { re: /\bat\b(?=\s+\d[\d,.]*\s*(?:w|watts?|kw)\b)/g, keys: { W: ['load'] }, dir: 'before' },
  { re: /\bproduc\w*|\bgenerat\w*|\bmakes\b|\boutput\b|\bdelivers?\b|\bsupplies\b/g, keys: { W: ['meanPower'] } },
  { re: /\bbattery\b|\bbatteries\b|\bstorage\b|\bstores?\b|\bcapacity\b|\bstate of charge\b|\bcharge\b/g, keys: { Wh: ['battery'], pct: ['socMin', 'initialSoc'], h: ['batteryH'] } },
  { re: /\bfull\b|\bcharged\b|\bstart(?:s|ing)?\b|\binitial(?:ly)?\b|\bat landing\b/g, keys: { pct: ['initialSoc'] } },
  { re: /\bminimum\b|\blowest\b|\bmin\b|\bbottoms? out\b|\bnever (?:drops|falls|dips) below\b|\bdrops? to\b|\bfalls? to\b/g, keys: { pct: ['socMin'] } },
  { re: /\befficien\w*|\bconversion\b|\bcells?\b/g, keys: { pct: ['efficiency'] } },
  { re: /\bpanels?\b|\barray\b/g, keys: { pct: ['efficiency'], m2: ['area'] } },
  { re: /\bazimuth\b|\bfac(?:es|ing)\b|\bpoint(?:s|ed|ing)?\b|\boriented\b|\borientation\b|\bheading\b/g, keys: { deg: ['azimuth'] } },
  { re: /\bclears?\b|\bclearance\b|\bthreshold\b|\belevation\b|\babove the (?:hills|horizon|skyline)\b|\bmask\b/g, keys: { deg: ['minEarthEl'] } },
  { re: /\bmast\b|\bantenna\b/g, keys: { m: ['mast'] } },
  { re: /\blat(?:itude)?\b/g, keys: { deg: ['lat'] } },
  { re: /\blon(?:gitude)?\b/g, keys: { deg: ['lon'] } },
  { re: /\bwindow\b|\bperiod\b|\bstay\b|\bmission\b|\bspan\b|\bfrom\b(?=\s+\d)/g, keys: { h: ['windowH'] }, dir: 'after' },
  // Only right before the number: "over the 30 days", "all 30 days", "225 of the 336 hours".
  { re: /\b(?:over|across|during|throughout|these|this|the next|all|the whole|the entire|of the)\b(?=\s+(?:the\s+|its\s+|these\s+|all\s+)?(?:\d|(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|ninety)\b))/g, keys: { h: ['windowH'] }, dir: 'before' },
  { re: /\bsites?\b|\bplaces\b|\blocations\b|\bcandidates\b/g, keys: { count: ['siteCount'] }, dir: 'after' },
];

/** The measure a unit falls back to when no word ties it to one: only units that belong to a single figure. */
const DEFAULT_KEYS: Partial<Record<Unit, string[]>> = { m2: ['area'], Wh: ['battery'], m: ['mast'], count: ['siteCount'], h: ['windowH'] };

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\\.?';
const monthOf = (w: string) => MONTHS.findIndex((m) => m.startsWith(w.toLowerCase().replace(/\.$/, '').slice(0, 3))) + 1;
const ORD = '(?:st|nd|rd|th)?';

const SPELLED: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};
const SPELLED_RE = new RegExp(`\\b(?:a |one )?(${Object.keys(SPELLED).join('|')})(?:-(one|two|three|four|five|six|seven|eight|nine))?\\b`, 'g');
const FRACTIONS: Record<string, number> = { half: 50, third: 100 / 3, thirds: 100 / 3, quarter: 25, quarters: 25 };

/**
 * The unit after a number: group 1 is a word a reader may put between them ("720 powered hours"), which for
 * "powered" and "sunlit" also says what the hours measure; group 2 is the unit.
 */
const UNIT_RE =
  /^(?:\s|-)?\s*(?:(powered|sunlit|lit|full|whole|consecutive|straight|continuous)\s+)?(%|per ?cent\b|kwh\b|kilowatt[- ]hours?\b|wh\b|watt[- ]hours?\b|kw\b|kilowatts?\b|w\b|watts?\b|m²|m2\b|m\^2|sq\.? ?m\b|square met(?:re|er)s?\b|km\b|kilomet(?:re|er)s?\b|m\b|met(?:re|er)s?\b|°|deg\b|degrees?\b|hours?\b|hrs?\b|h\b|days?\b|d\b|weeks?\b|months?\b|years?\b|minutes?\b|mins?\b|sites?\b|places\b|locations\b|regions\b|candidates\b|nights?\b|times\b|x\b)/i;
/** The measure a word before the unit names: "powered hours" are the time with power, "sunlit hours" the hours of sunlight. */
const ADJ_KEYS: Record<string, string[]> = { powered: ['poweredH'], sunlit: ['sunlitH'], lit: ['sunlitH'] };

/** A unit as written, as the figure's unit and the factor to it; null for a unit no figure is measured in. */
function unitOf(word: string): { unit: Unit; k: number; days?: boolean } | null {
  const w = word.toLowerCase().replace(/\s+/g, ' ');
  if (w === '%' || /^per ?cent$/.test(w)) return { unit: 'pct', k: 1 };
  if (/^(?:kwh|kilowatt[- ]hours?)$/.test(w)) return { unit: 'Wh', k: 1000 };
  if (/^(?:wh|watt[- ]hours?)$/.test(w)) return { unit: 'Wh', k: 1 };
  if (/^(?:kw|kilowatts?)$/.test(w)) return { unit: 'W', k: 1000 };
  if (/^(?:w|watts?)$/.test(w)) return { unit: 'W', k: 1 };
  if (/^(?:m²|m2|m\^2|sq\.? ?m|square met(?:re|er)s?)$/.test(w)) return { unit: 'm2', k: 1 };
  if (/^(?:m|met(?:re|er)s?)$/.test(w)) return { unit: 'm', k: 1 };
  if (/^(?:°|deg|degrees?)$/.test(w)) return { unit: 'deg', k: 1 };
  if (/^(?:hours?|hrs?|h)$/.test(w)) return { unit: 'h', k: 1 };
  if (/^(?:days?|d)$/.test(w)) return { unit: 'h', k: 24, days: true };
  if (/^weeks?$/.test(w)) return { unit: 'h', k: 168 };
  if (/^(?:sites?|places|locations|regions|candidates)$/.test(w)) return { unit: 'count', k: 1 };
  return null;
}

const QUALIFIER_RE =
  /(?:(?:^|[\s(,;:])(more than|over|above|exceeding|in excess of|greater than|longer than|upwards of|less than|under|below|fewer than|shorter than|at least|no less than|not less than|at most|up to|no more than|not more than|as much as|almost|nearly|just under|just over|close to|about|around|roughly|approximately|approx\.?|some)\s+|([~≈<>≥≤])\s*)$/;
const REL_OF: Record<string, Rel> = {
  'more than': 'gt', over: 'gt', above: 'gt', exceeding: 'gt', 'in excess of': 'gt', 'greater than': 'gt', 'longer than': 'gt', 'upwards of': 'gt', '>': 'gt',
  'less than': 'lt', under: 'lt', below: 'lt', 'fewer than': 'lt', 'shorter than': 'lt', '<': 'lt',
  'at least': 'ge', 'no less than': 'ge', 'not less than': 'ge', '≥': 'ge',
  'at most': 'le', 'up to': 'le', 'no more than': 'le', 'not more than': 'le', 'as much as': 'le', '≤': 'le',
  almost: 'near', nearly: 'near', 'just under': 'near', 'close to': 'near',
  'just over': 'justOver',
  about: 'approx', around: 'approx', roughly: 'approx', approximately: 'approx', approx: 'approx', 'approx.': 'approx', some: 'approx', '~': 'approx', '≈': 'approx',
};

interface NumClaim {
  start: number;
  end: number;
  unit: Unit | 'none' | 'other';
  value: number;
  tol: number;
  /** Whole days, as a reader writes "16 days" for 16 days 15 hours. */
  floorOk: boolean;
  rel: Rel;
  hemi?: 'NS' | 'EW';
  bad?: string;
  /** The number as written, signed, for the user's own numbers. */
  raw: string;
  /** "5 days later": a time from an event the sentence must name. */
  relative?: boolean;
  /** "720 powered hours": the measure the word before the unit names. */
  adjKeys?: string[];
}

interface DateClaim {
  start: number;
  end: number;
  d?: number;
  m?: number;
  y?: number;
  time?: string;
  raw: string[];
}

const decimals = (s: string) => (s.includes('.') ? s.split('.')[1].length : 0);
const canonNumber = (s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? String(n) : s;
};

/** Dates and times of day in the sentence; their digits are no other claim's. */
function dateClaims(t: string, used: boolean[]): DateClaim[] {
  const out: DateClaim[] = [];
  const take = (re: RegExp, make: (m: RegExpMatchArray) => DateClaim[]) => {
    for (const m of t.matchAll(re)) {
      const a = m.index!, b = a + m[0].length;
      if (used.slice(a, b).some(Boolean)) continue;
      for (let i = a; i < b; i++) used[i] = true;
      out.push(...make(m));
    }
  };
  const y = (s?: string) => (s ? Number(s) : undefined);
  take(/\b(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{2}):(\d{2})(?::\d{2})?z?)?\b/gi, (m) => [
    { start: m.index!, end: m.index! + m[0].length, y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), time: m[4] ? `${m[4]}:${m[5]}` : undefined, raw: [m[1], canonNumber(m[2]), canonNumber(m[3])] },
  ]);
  const range = (m: RegExpMatchArray, d1: string, d2: string, mon: string, yr?: string): DateClaim[] => [
    { start: m.index!, end: m.index! + m[0].length, d: Number(d1), m: monthOf(mon), y: y(yr), raw: [d1, ...(yr ? [yr] : [])] },
    { start: m.index!, end: m.index! + m[0].length, d: Number(d2), m: monthOf(mon), y: y(yr), raw: [d2, ...(yr ? [yr] : [])] },
  ];
  take(new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:–|-|to|until|till|through|and)\\s*(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+(\\d{4}))?\\b`, 'gi'), (m) => range(m, m[1], m[2], m[3], m[4]));
  take(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}\\s*(?:–|-|to|until|through)\\s*(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?\\b`, 'gi'), (m) => range(m, m[2], m[3], m[1], m[4]));
  take(new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}(?:,?\\s+(\\d{4}))?\\b`, 'gi'), (m) => [
    { start: m.index!, end: m.index! + m[0].length, d: Number(m[1]), m: monthOf(m[2]), y: y(m[3]), raw: [m[1], ...(m[3] ? [m[3]] : [])] },
  ]);
  take(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}(?:,\\s*(\\d{4})|\\s+(\\d{4}))?\\b(?!\\s*(?:%|h\\b|hours?|days?))`, 'gi'), (m) => [
    { start: m.index!, end: m.index! + m[0].length, d: Number(m[2]), m: monthOf(m[1]), y: y(m[3] ?? m[4]), raw: [m[2], ...(m[3] ?? m[4] ? [m[3] ?? m[4]] : [])] },
  ]);
  take(new RegExp(`\\b${MONTH}\\s+(\\d{4})\\b`, 'gi'), (m) => [{ start: m.index!, end: m.index! + m[0].length, m: monthOf(m[1]), y: Number(m[2]), raw: [m[2]] }]);
  take(/\b(\d{1,2}):(\d{2})\b(?:\s*utc)?/gi, (m) => [{ start: m.index!, end: m.index! + m[0].length, time: `${m[1].padStart(2, '0')}:${m[2]}`, raw: [] }]);
  return out;
}

/** The text before `at` ends in a qualifier ("more than", "about"): its relation and where it starts. */
function qualifierBefore(t: string, at: number): { rel: Rel; start: number } | null {
  const before = t.slice(Math.max(0, at - 40), at);
  const q = before.match(QUALIFIER_RE);
  if (!q) return null;
  const word = (q[1] ?? q[2]).toLowerCase();
  return { rel: REL_OF[word] ?? 'eq', start: at - before.length + q.index! + (q[0].length - q[0].trimStart().length) };
}

/** Every number in the (lower-case) sentence with its unit, sign, hemisphere and relation, in canonical units. */
function numberClaims(t: string, used: boolean[]): NumClaim[] {
  const out: NumClaim[] = [];
  const add = (a: number, b: number, digits: string, sign: string, n: number, dec: number) => {
    const tail = t.slice(b);
    let end = b;
    let unit: NumClaim['unit'] = 'none';
    let value = n;
    let tol = 0.5 * 10 ** -dec;
    let floorOk = false;
    let hemi: NumClaim['hemi'];
    let bad: string | undefined;
    let adjKeys: string[] | undefined;
    const u = tail.match(UNIT_RE);
    if (u) {
      const known = unitOf(u[2]);
      if (u[1] && known?.unit === 'h') adjKeys = ADJ_KEYS[u[1].toLowerCase()];
      end = b + u[0].length;
      if (!known) unit = 'other';
      else {
        unit = known.unit;
        value = n * known.k;
        tol *= known.k;
        if (known.days) {
          const hours = t.slice(end).match(/^\s*,?\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?|h)\b/i);
          if (hours) {
            value += Number(hours[1]);
            tol = 0.5 * 10 ** -decimals(hours[1]);
            end += hours[0].length;
            for (let i = b; i < end; i++) used[i] = true;
          } else floorOk = dec === 0;
        }
        if (unit === 'deg') {
          const h = t.slice(end).match(/^\s?(?:([nsew])\b|(north|south|east|west)\b)/i);
          if (h) {
            const letter = (h[1] ?? h[2])[0].toLowerCase();
            hemi = letter === 'n' || letter === 's' ? 'NS' : 'EW';
            if (sign) bad = 'with both a sign and a hemisphere';
            if (letter === 's' || letter === 'w') value = -value;
            end += h[0].length;
          }
        }
      }
    } else {
      // "225 of the 336 hours": the first number borrows the second one's unit.
      const of = tail.match(/^\s+of (?:the |its |these |those )?(?:\d[\d,.]*\s*)?(?:(?:powered|sunlit|lit|full|whole)\s+)?(hours?|h|days?|d)\b/i);
      if (of) {
        const known = unitOf(of[1])!;
        unit = known.unit;
        value = n * known.k;
        tol *= known.k;
      }
    }
    if (sign === '-') value = -value;
    const q = qualifierBefore(t, a - sign.length);
    let rel: Rel = q?.rel ?? 'eq';
    const after = t.slice(end);
    if (/^\s+or more\b|^\s*\+(?!\d)|^\s+plus\b/i.test(after)) rel = 'ge';
    else if (/^\s+or less\b|^\s+or fewer\b/i.test(after)) rel = 'le';
    else if (/^\s+or so\b/i.test(after)) rel = 'approx';
    const relative = unit === 'h' && /^\s*(?:later|earlier|afterwards?|ago|sooner)\b/i.test(after);
    const start = q ? q.start : a - sign.length;
    for (let i = start; i < end; i++) used[i] = true;
    out.push({ start, end, unit, value, tol, floorOk, rel, hemi, bad, raw: canonNumber(sign + digits), relative, adjKeys });
  };
  for (const m of t.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    const a = m.index!;
    if (used[a]) continue;
    const prev = t[a - 1] ?? '';
    if (/[\p{L}\d_.]/u.test(prev)) continue; // part of a name or a code ("DE440", "m2")
    let sign = '';
    if ((prev === '-' || prev === '+') && !/[\p{L}\d]/u.test(t[a - 2] ?? '')) sign = prev;
    // "24 hours a day" is the hours in a day, not a figure.
    if (/^24\s*(?:hours?|h)\s+(?:a|per|each|every)\s+day\b/i.test(t.slice(a))) {
      for (let i = a; i < a + m[0].length; i++) used[i] = true;
      continue;
    }
    add(a, a + m[0].length, m[0], sign, Number(m[0].replace(/,/g, '')), decimals(m[0]));
  }
  // Numbers in words count when a unit follows them ("nine days", "two sites").
  for (const m of t.matchAll(SPELLED_RE)) {
    const a = m.index!, b = a + m[0].length;
    if (used.slice(a, b).some(Boolean)) continue;
    if (!UNIT_RE.test(t.slice(b))) continue;
    const n = SPELLED[m[1]] + (m[2] ? SPELLED[m[2]] : 0);
    add(a, b, String(n), '', n, 0);
  }
  // "half the time", "two thirds", "more than half": shares in words, to the nearest simple fraction.
  for (const m of t.matchAll(/\b(?:(a|one|two|three)[\s-]+)?(half|thirds?|quarters?)\b/g)) {
    const a = m.index!, b = a + m[0].length;
    if (used.slice(a, b).some(Boolean)) continue;
    if (/^\s+as\b/.test(t.slice(b))) continue; // "half as long": a ratio, left to the comparisons
    const times = m[1] === 'two' ? 2 : m[1] === 'three' ? 3 : 1;
    const q = qualifierBefore(t, a);
    const start = q ? q.start : a;
    for (let i = start; i < b; i++) used[i] = true;
    out.push({ start, end: b, unit: 'pct', value: FRACTIONS[m[2]] * times, tol: 4, floorOk: false, rel: q?.rel ?? 'eq', raw: '' });
  }
  // "most of the time", "all the time": a share without a number.
  for (const m of t.matchAll(/\b(?:most|the majority) of the (?:time|period)\b|\b(?:all (?:of )?the time|the whole time|the entire time|at all times)\b|\bnone of the time\b/g)) {
    const a = m.index!, b = a + m[0].length;
    if (used.slice(a, b).some(Boolean)) continue;
    for (let i = a; i < b; i++) used[i] = true;
    const most = /most|majority/.test(m[0]);
    out.push({ start: a, end: b, unit: 'pct', value: most ? 50 : /none/.test(m[0]) ? 0 : 100, tol: most ? 0 : 0.05, floorOk: false, rel: most ? 'gt' : 'eq', raw: '' });
  }
  return out.sort((x, y) => x.start - y.start);
}

function holds(rel: Rel, v: number, x: number, tol: number, fieldTol: number, floorOk: boolean): boolean {
  const t = tol + fieldTol + 1e-9;
  switch (rel) {
    case 'eq':
      return Math.abs(v - x) <= t || (floorOk && v >= x - 1e-9 && v < x + 24);
    case 'approx':
      return Math.abs(v - x) <= Math.max(t, 0.05 * Math.abs(x)) || (floorOk && v >= x - 1e-9 && v < x + 24);
    case 'gt':
      return v > x - fieldTol;
    case 'ge':
      return v >= x - t;
    case 'lt':
      return v < x + fieldTol;
    case 'le':
      return v <= x + t;
    case 'near':
      return v <= x + t && v >= x - Math.max(t, 0.1 * Math.abs(x));
    case 'justOver':
      return v >= x - t && v <= x + Math.max(t, 0.1 * Math.abs(x));
  }
}

const round = (x: number, k = 1) => String(Math.round(x * 10 ** k) / 10 ** k);

/** A figure as a reader would write it, for the problems. */
function show(f: Field, key: string): string {
  const v = f.values[0];
  switch (f.unit) {
    case 'pct':
      return `${round(v)} %`;
    case 'h':
      return Number.isInteger(v) ? spanWords(v) : `${round(v)} hours`;
    case 'W':
      return `${round(v)} W`;
    case 'Wh':
      return `${round(v)} Wh`;
    case 'm2':
      return `${v} m²`;
    case 'm':
      return `${v} m`;
    case 'deg':
      if (key === 'lat') return `${Math.abs(v).toFixed(3)}°${v < 0 ? 'S' : 'N'}`;
      if (key === 'lon') return `${Math.abs(v).toFixed(3)}°${v < 0 ? 'W' : 'E'}`;
      return `${v}°`;
    case 'count':
      return f.values.join(' or ');
  }
}

/** Everything in a sentence between `a` and `b`: how many words, and how many soft breaks (commas, "and", brackets); null across a hard break. */
function between(t: string, a: number, b: number): { words: number; soft: number } | null {
  const mid = t.slice(a, b);
  if (/[;:—]/.test(mid)) return null;
  const words = (mid.match(/[\p{L}\p{N}\uE100-\uE1FF]+/gu) ?? []).length;
  const soft = (mid.match(/[,()]|\b(?:and|but|while|whereas|then|although)\b/g) ?? []).length;
  return { words, soft };
}

interface CueHit {
  start: number;
  end: number;
  cue: Cue;
}

function cueHits(t: string, taken: { start: number; end: number }[]): CueHit[] {
  const hits: CueHit[] = [];
  for (const cue of CUES) for (const m of t.matchAll(cue.re)) hits.push({ start: m.index!, end: m.index! + m[0].length, cue });
  // A longer cue that holds a shorter one wins ("without power" over "power"); a cue inside a claim ("over 16 days") is no cue.
  return hits.filter(
    (h) =>
      !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start) &&
      !taken.some((c) => h.start >= c.start && h.end <= c.end),
  );
}

/** The measures the nearest word ties this number to, by its unit; null when no word does. */
function bind(t: string, c: { start: number; end: number }, unit: Unit, hits: CueHit[]): string[] | null {
  let best: { score: number; keys: string[]; before: boolean } | null = null;
  for (const h of hits) {
    const keys = h.cue.keys[unit];
    if (!keys || keys.length === 0) continue;
    const before = h.end <= c.start;
    const after = h.start >= c.end;
    if (!before && !after) continue;
    if ((h.cue.dir === 'before' && !before) || (h.cue.dir === 'after' && !after)) continue;
    const gap = before ? between(t, h.end, c.start) : between(t, c.end, h.start);
    if (!gap) continue;
    const score = gap.words + 3 * gap.soft;
    if (!best || score < best.score || (score === best.score && before && !best.before)) best = { score, keys, before };
  }
  return best?.keys ?? null;
}

const STATE_SITE: SiteRef = { kind: 'selected' };
const shortName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (text: string) =>
  text
    .replace(/[\u00a0\u202f\u2009\u2007\u200a]/g, ' ')
    .replace(/[\u2212\u2010\u2011\u2012]/g, '-')
    .replace(/º/g, '°')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');

interface Mention {
  at: number;
  ref: SiteRef;
  name: string;
}

/** The ways a sentence names a site, longest first, so "Mons Mouton Plateau" is not read as "Mons Mouton". */
function siteVariants(s: StateSummary, siteNames: readonly string[]): { text: string; ref: SiteRef }[] {
  const out: { text: string; ref: SiteRef }[] = [];
  const seen = new Set<string>();
  const push = (text: string, ref: SiteRef) => {
    const key = normalize(text).toLowerCase().trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ text: normalize(text).trim(), ref });
  };
  for (const v of [s.site.name, s.site.label, shortName(s.site.name), 'the selected site', 'the landing site', 'this site', 'the site']) push(v, STATE_SITE);
  s.compare.forEach((c, i) => {
    const ref: SiteRef = c.id === s.site.id ? STATE_SITE : { kind: 'compare', i };
    push(c.name, ref);
    push(shortName(c.name), ref);
  });
  for (const n of siteNames) {
    push(n, { kind: 'other', name: n });
    push(shortName(n), { kind: 'other', name: shortName(n) });
  }
  return out.sort((a, b) => b.text.length - a.text.length);
}

/** The sentence with each site name replaced by one private character, and the names it held. */
function maskSites(t: string, variants: { text: string; ref: SiteRef }[]): { masked: string; mentions: Mention[] } {
  const found: { ref: SiteRef; name: string }[] = [];
  let masked = t;
  for (const v of variants) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v.text)}(?![\\p{L}\\p{N}])`, 'giu');
    masked = masked.replace(re, (m) => {
      found.push({ ref: v.ref, name: m });
      return String.fromCharCode(0xe100 + found.length - 1);
    });
  }
  const mentions: Mention[] = [];
  for (let i = 0; i < masked.length; i++) {
    const code = masked.charCodeAt(i);
    if (code >= 0xe100 && code < 0xe100 + found.length) mentions.push({ at: i, ...found[code - 0xe100] });
  }
  return { masked, mentions };
}

/** Lower case, one character for one, so positions in the lowered text are positions in the original. */
const lower = (x: string) => Array.from(x, (ch) => (ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch)).join('');

const siteKey = (r: SiteRef) => (r.kind === 'compare' ? `c${r.i}` : r.kind === 'other' ? `o:${r.name.toLowerCase()}` : 'sel');
const siteName = (s: StateSummary, r: SiteRef) => (r.kind === 'compare' ? shortName(s.compare[r.i].name) : r.kind === 'other' ? r.name : s.site.label);

/** The site a claim at `at` is about: named in its clause, else earlier in the sentence, else the sentence before's. */
function siteAt(t: string, at: number, mentions: Mention[], subject: SiteRef | 'ambiguous'): SiteRef | 'ambiguous' {
  const clauseStart = Math.max(...[...t.slice(0, at).matchAll(/[,;:(—]/g)].map((m) => m.index! + 1), 0);
  const nextBreak = t.slice(at).search(/[,;:)—]/);
  const clauseEnd = nextBreak < 0 ? t.length : at + nextBreak;
  const before = mentions.filter((m) => m.at < at);
  const inClause = before.filter((m) => m.at >= clauseStart);
  if (inClause.length) return inClause[inClause.length - 1].ref;
  const afterInClause = mentions.find((m) => m.at > at && m.at < clauseEnd);
  if (afterInClause) return afterInClause.ref;
  if (before.length) return before[before.length - 1].ref;
  return subject;
}

/** A stated state: the Sun never sets, Earth always in view, the lander keeps power or runs out, the panel type. */
interface Quality {
  kind: string;
  start: number;
  end: number;
  text: string;
  holdsTrue: boolean;
}

const BODY_VERB_RE =
  /\b(never sets|never goes down|never rises|(?:is |stays |remains )?never (?:up|in view|visible|above (?:the )?(?:horizon|hills))|(?:is |stays |remains )?(?:always|constantly|continuously|permanently) (?:up|in view|visible|above (?:the )?(?:horizon|hills))|(?:up|in view|visible|above (?:the )?(?:horizon|hills)) (?:for|through(?:out)?) (?:all|the (?:whole|entire|full))(?: (?:time|period|window|stay|month))?|sets|rises)\b/g;
/** "in that time", "while it has power": the hours with power, not the whole period. */
const WHILE_POWERED = /\b(?:in|during|of) (?:that|the powered) (?:time|period)\b|\bwhile (?:the lander |it )?(?:has|had|keeps|kept) power\b|\bwhile (?:it is )?powered\b|\bwith power\b|\bduring the powered (?:period|time|hours)\b/;
const NEGATION_RE = /\b(?:not|never|no|cannot|can't|doesn't|don't|isn't|won't|wouldn't|didn't|does not|fails? to|unable to)\s+(?:\S+\s+){0,1}$/;
const SURVIVE_RE = /\bsurviv(?:es|e|ed|ing)\b|\b(?:keeps?|has|have|stays?|remains?) (?:its )?(?:power|powered)\s+(?:for|through(?:out)?)\s+(?:all|the (?:whole|entire|full))\b|\bkeeps? (?:its )?power\b(?!\s+for\s+(?!all\b))|\bpower for all\b|\bpowered (?:for all|throughout)\b|\bstays? powered\b(?!\s+for\s+(?!all\b))|\bnever (?:runs? out|loses? power|browns? out)\b|\bno brown-?outs?\b|\b(?:lasts?|operates?|works?|keeps? going|stays? on)\s+(?:the (?:whole|entire|full) (?:period|window|stay|mission|month)|throughout|to the end)\b/g;
const END_RE =
  /\bruns? out\b|\bloses? (?:its )?power\b|\bshuts? down\b|\bpower (?:ends|fails|runs out|cuts out|is lost)\b|\bgoes (?:dark|dead|silent)\b|\b(?:battery|batteries) (?:is |are |goes |runs )?(?:empty|drained|depleted|flat|exhausted|dry)\b|\b(?:a|the|first|suffers? a|hits? a) brown-?out\b/g;

function qualities(t: string): Quality[] {
  const out: Quality[] = [];
  const push = (kind: string, m: RegExpMatchArray, negatable = true) => {
    const a = m.index!;
    const neg = negatable && NEGATION_RE.test(t.slice(Math.max(0, a - 24), a));
    out.push({ kind, start: a, end: a + m[0].length, text: m[0], holdsTrue: !neg });
  };
  for (const m of t.matchAll(BODY_VERB_RE)) {
    const a = m.index!;
    const clause = t.slice(0, a).split(/[;:—]/).pop()!;
    const bodies = [...clause.matchAll(/\b(sun|earth)\b/g)];
    if (!bodies.length) continue; // "it sets" names no body
    const body = bodies[bodies.length - 1][1];
    const v = m[1];
    const never = /never/.test(v);
    const always = /always|constantly|continuously|permanently|for all|for the|through/.test(v);
    const rises = /rises/.test(v);
    const kind =
      body === 'sun'
        ? never
          ? /rises|up|in view|visible|above/.test(v)
            ? 'noSun'
            : 'noNight'
          : always
            ? 'noNight'
            : rises
              ? 'sunRises'
              : 'night'
        : never
          ? /rises|up|in view|visible|above/.test(v)
            ? 'earthNever'
            : 'earthAlways'
          : always
            ? 'earthAlways'
            : rises
              ? 'earthRises'
              : 'earthSets';
    // "Earth is never in view while it has power": the hours with power, not the period.
    const scoped = body === 'earth' && WHILE_POWERED.test(t.slice(a + m[0].length).split(/[,;:.—]/)[0]);
    push(scoped ? (kind === 'earthNever' ? 'noContactPowered' : kind === 'earthAlways' ? 'contactAllPowered' : kind) : kind, m, !never);
  }
  for (const m of t.matchAll(/\bno nights?\b|\bwithout (?:a |any )?night\b|\bno sunsets?\b|\bnever (?:gets |goes )?dark\b|\b(?:constant|continuous|uninterrupted|permanent|unbroken) (?:sun(?:light)?|daylight|illumination)\b|\b(?:in )?sun(?:light|lit)? (?:the whole time|all the time|the entire time|at all times|throughout)\b/g)) push('noNight', m, false);
  for (const m of t.matchAll(/(?<!\bno |\bwithout (?:a |any )?)\b(?:the|a|each|every) nights?\b(?! of)|\bnights\b|\bsunsets?\b|\bnightfall\b/g)) push('night', m);
  for (const m of t.matchAll(/\bno sun(?:light)?\b|\bnever (?:sunlit|lit)\b|\b(?:permanent(?:ly)?|always) (?:dark|in (?:darkness|shadow)|shadowed)\b/g)) push('noSun', m, false);
  for (const m of t.matchAll(/\bsunrises?\b/g)) push('sunRises', m);
  for (const m of t.matchAll(/\b(?:constant|continuous|uninterrupted|unbroken|permanent) (?:radio )?(?:contact|link|communication)\b|\bnever (?:loses|lose|lost) (?:radio )?contact\b|\balways in (?:radio )?contact\b/g)) push('earthAlways', m, false);
  for (const m of t.matchAll(/\bearthsets?\b/g)) push('earthSets', m);
  for (const m of t.matchAll(/\bno (?:earth |radio |direct )?(?:contact|link)\b(?!\s+for\b)|\bnever in (?:radio )?contact\b/g)) {
    push(WHILE_POWERED.test(t.slice(m.index! + m[0].length).split(/[,;:.—]/)[0]) ? 'noContactPowered' : 'noContact', m, false);
  }
  for (const m of t.matchAll(/\b(?:has|have|keeps?|maintains?|gets?|with|there is|there's) (?:radio |earth |direct )?(?:contact|a link|communication)\b/g)) {
    push(WHILE_POWERED.test(t.slice(m.index! + m[0].length).split(/[,;:.—]/)[0]) ? 'contactPowered' : 'contact', m);
  }
  for (const m of t.matchAll(/\bbattery\b[^.;:]*?\b(?:covers?|carries (?:it |the lander |the load )?(?:through|across)|bridges?|lasts? (?:through|the)|gets? (?:it |the lander )?through|sees? (?:it |the lander )?through)\b(?!\s+the first)[^.;:]*?\bnights?\b/g)) push('batteryCovers', m);
  for (const m of t.matchAll(SURVIVE_RE)) push('survives', m, !/never|no brown/.test(m[0]));
  for (const m of t.matchAll(END_RE)) push('powerEnds', m);
  for (const m of t.matchAll(/\bthen (?:the )?night\b/g)) push('thenNight', m, false);
  for (const m of t.matchAll(/\b(?:then )?too little sun(?:light)?\b/g)) push('thenLowSun', m, false);
  for (const m of t.matchAll(/\bfully charged\b|\b(?:starts?|starting|begins?) (?:out )?full\b|\bfull charge\b/g)) push('fullStart', m);
  for (const m of t.matchAll(/\bbattery (?:stays|remains|is always) full\b|\bnever (?:dips|drops|falls) below full\b/g)) push('staysFull', m);
  for (const [kind, re] of [
    ['panel:horizontal', /\b(?:flat|horizontal)(?: solar)? panels?\b|\bpanels? (?:lies |lying )?flat\b|\bfacing up\b/g],
    ['panel:vertical', /\bfixed (?:upright|vertical)\b/g],
    ['panel:vertical_tracking', /\b(?:upright|vertical) panels? (?:that )?(?:turns|tracks|tracking|follows|rotates)\b|\bvertical[- ]tracking\b/g],
    ['panel:full_tracking', /\btwo[- ]axis\b|\bboth axes\b|\bfull(?:y)?[- ]tracking\b|\bon two axes\b/g],
  ] as const)
    for (const m of t.matchAll(re)) push(kind, m, false);
  return out;
}

/** Whether a stated state holds for the site; undefined when the figures do not cover that site for it. */
function qualityHolds(kind: string, s: StateSummary, site: SiteRef): boolean | undefined {
  if (kind.startsWith('panel:')) return s.params.power.panel === kind.slice(6);
  if (kind === 'fullStart') return s.params.power.initialSocFraction >= 0.9995;
  if (site.kind === 'other') return undefined;
  if (site.kind === 'compare') {
    const row = s.compare[site.i];
    const lit = row.illumFraction, earth = row.earthVisFraction;
    const table: Record<string, boolean> = {
      noNight: lit >= 0.9995, night: lit < 0.9995, noSun: lit === 0, earthAlways: earth >= 0.9995, earthNever: earth === 0,
      earthSets: earth > 0 && earth < 0.9995, earthRises: earth > 0 && earth < 0.9995, noContact: earth === 0, survives: row.survives, powerEnds: !row.survives,
    };
    return table[kind];
  }
  const { summary: m, power: p } = s;
  const table: Record<string, boolean> = {
    noNight: m.longestDarkH === 0,
    night: m.longestDarkH > 0,
    noSun: m.illumFraction === 0,
    sunRises: m.longestDarkH > 0 && m.illumFraction > 0,
    earthAlways: m.earthVisFraction >= 0.9995,
    earthNever: m.earthVisFraction === 0,
    earthSets: m.earthVisFraction > 0 && m.earthVisFraction < 0.9995,
    earthRises: m.earthVisFraction > 0 && m.earthVisFraction < 0.9995,
    noContact: m.earthVisFraction === 0,
    noContactPowered: p.contactHours === 0,
    contact: m.earthVisFraction > 0,
    contactPowered: p.contactHours > 0,
    contactAllPowered: p.poweredHours > 0 && p.contactHours >= p.poweredHours,
    batteryCovers: p.survives && m.longestDarkH > 0,
    survives: p.survives,
    powerEnds: !p.survives,
    thenNight: !p.survives && (p.endsAtNight ?? m.longestDarkH > 0),
    thenLowSun: !p.survives && (p.endsAtNight === undefined ? m.longestDarkH === 0 : !p.endsAtNight),
    staysFull: p.socMin >= 0.9995,
  };
  return table[kind];
}

/** What the figures say instead of a stated state, in the reader's words. */
function qualityDetail(kind: string, s: StateSummary, site: SiteRef): string {
  const contra = 'which the figures contradict';
  if (kind.startsWith('panel:')) return `where the lander's panel is ${PANEL_NAMES[s.params.power.panel] ?? s.params.power.panel}`;
  if (kind === 'fullStart') return `where the battery starts ${Math.round(s.params.power.initialSocFraction * 100)} % full`;
  if (site.kind === 'compare') {
    const row = s.compare[site.i];
    if (/Night|night|Sun/.test(kind)) return `where the figures give sunlight ${round(row.illumFraction * 100)} %`;
    if (/earth|Earth|Contact/.test(kind)) return `where the figures give Earth in view ${round(row.earthVisFraction * 100)} %`;
    return contra;
  }
  const { summary: m, power: p } = s;
  const powerWords = p.survives ? `where the figures give power for all ${s.window.days} days` : `where the figures give power for ${spanWords(p.poweredHours)} from landing`;
  switch (kind) {
    case 'noNight':
    case 'night':
    case 'sunRises':
    case 'noSun':
      return m.longestDarkH > 0 ? `where the figures give a longest night of ${spanWords(m.longestDarkH)}` : 'where the figures give no night';
    case 'earthAlways':
    case 'earthNever':
    case 'earthSets':
    case 'earthRises':
    case 'noContact':
      return `where the figures give Earth in view ${round(m.earthVisFraction * 100)} % of the time`;
    case 'contact':
      return `where the figures give Earth in view ${round(m.earthVisFraction * 100)} % of the time`;
    case 'contactPowered':
    case 'contactAllPowered':
    case 'noContactPowered':
      return `where the figures give Earth in view for ${spanWords(p.contactHours)} while it has power`;
    case 'batteryCovers':
      return m.longestDarkH > 0 ? powerWords : 'where the figures give no night';
    case 'survives':
    case 'powerEnds':
      return powerWords;
    case 'thenNight':
    case 'thenLowSun':
      return p.survives ? powerWords : p.endsAtNight === false || m.longestDarkH === 0 ? 'where power ends with the Sun up' : 'where power ends at night';
    case 'staysFull':
      return `where the battery's lowest charge is ${round(p.socMin * 100)} %`;
  }
  return contra;
}
const PANEL_NAMES: Record<string, string> = { horizontal: 'flat, facing up', vertical: 'upright and fixed', vertical_tracking: 'upright, turning to the Sun', full_tracking: 'turning to the Sun on two axes' };

/** The causes the figures give, each with what makes it hold: the verdict's reasons, read from the state's named fields. */
const REASONS: { cause: string; effect: string; holds: (s: StateSummary) => boolean }[] = [
  { cause: 'noNight', effect: 'survives', holds: (s) => s.summary.longestDarkH === 0 && s.power.survives },
  { cause: 'batteryCovers', effect: 'survives', holds: (s) => s.summary.longestDarkH > 0 && s.power.survives },
  { cause: 'night', effect: 'powerEnds', holds: (s) => nightOutlastsBattery(s) },
  { cause: 'batteryShort', effect: 'powerEnds', holds: (s) => nightOutlastsBattery(s) },
  { cause: 'lowSun', effect: 'powerEnds', holds: (s) => !s.power.survives && (s.power.endsAtNight === undefined ? s.summary.longestDarkH === 0 : !s.power.endsAtNight) },
  { cause: 'earthOut', effect: 'noContact', holds: (s) => s.summary.earthVisFraction < 0.9995 },
  { cause: 'earthIn', effect: 'contact', holds: (s) => s.summary.earthVisFraction > 0 },
  // The same fact said twice ("continuous sunlight, meaning no night"): true when the fact is.
  { cause: 'noNight', effect: 'noNight', holds: (s) => s.summary.longestDarkH === 0 },
  { cause: 'night', effect: 'night', holds: (s) => s.summary.longestDarkH > 0 },
  { cause: 'noContact', effect: 'earthOut', holds: (s) => s.summary.earthVisFraction < 0.9995 },
  { cause: 'contact', effect: 'earthIn', holds: (s) => s.summary.earthVisFraction > 0 },
  { cause: 'earthIn', effect: 'earthIn', holds: (s) => s.summary.earthVisFraction > 0 },
];
/** Power ends at night (the state says so), or, for a summary that does not say, the longest night needs more than a full battery holds. */
const nightOutlastsBattery = (s: StateSummary) =>
  !s.power.survives && (s.power.endsAtNight ?? s.summary.longestDarkH * s.params.power.loadW > s.params.power.batteryWh);

/** Words that, in a cause, name something the state does not hold: terrain, place, size, worth. */
const UNSTATED_CAUSE = /\b(?:pole|polar|latitude|rim|ridge|crater|terrain|hills?|high|higher|elevat\w*|height|altitude|location|located|position|tilt|axis|orbit\w*|libration|wobble|angle|geometry|seasons?|seasonal|distance|size|small|large|big|panels?|efficien\w*|design|peak|summit|mountain|slopes?|good|bad|ideal|excellent|suitable|favou?rable|best|worst)\b/;

const TOPIC_RES: [string, RegExp][] = [
  ['lowSun', /\btoo little sun(?:light)?\b|\b(?:low|weak|faint|grazing) sun(?:light)?\b|\bnot enough sun(?:light)?\b/g],
  ['batteryCovers', /\bbattery\b[^.;]*?\b(?:covers?|carries|bridges?|holds? out|lasts? through)\b(?:[^.;]*?\bnights?\b)?|\bbattery\b[^.;]*?\bis (?:large|big) enough\b/g],
  ['batteryShort', /\bnights?\b[^.;]*?\b(?:longer than|outlasts?)\b[^.;]*?\bbattery\b(?:\s+(?:lasts?|can last|holds?))?|\bbattery\b[^.;]*?\b(?:too small|cannot (?:cover|last|carry)\w*)\b|\bnot enough (?:battery|charge|energy|storage)\b/g],
  ['earthOut', /\bearth\b[^.;]*?\b(?:out of view|not in view|below the (?:horizon|hills)|sets|is hidden|out of sight)\b|\bout of view\b/g],
  ['earthIn', /\bearth\b[^.;]*?\b(?:in view|visible|is up|above the (?:horizon|hills))\b/g],
  ['noContact', /\bno (?:radio )?contact\b|\bcannot (?:reach|contact|talk to) earth\b|\bgaps? in (?:radio )?contact\b|\bout of (?:touch|contact)\b|\bradio (?:gaps?|silence|blackouts?)\b/g],
  ['contact', /\b(?:radio )?contact\b|\bcommunicat\w*\b|\btalk to earth\b|\bsend data\b|\bradio link\b/g],
];
const NOT_TOPIC: Record<string, string> = { survives: 'powerEnds', powerEnds: 'survives', night: 'noNight', noNight: 'night', earthIn: 'earthOut', earthOut: 'earthIn' };
const QUALITY_TOPIC: Record<string, string> = { noNight: 'noNight', night: 'night', thenNight: 'night', thenLowSun: 'lowSun', survives: 'survives', powerEnds: 'powerEnds', earthSets: 'earthOut', noContact: 'noContact', noContactPowered: 'noContact', earthAlways: 'earthIn' };

/** What one side of a cause says, in the reasons' terms, and whatever is left over. */
function topicsOf(seg: string): { topics: Set<string>; rest: string } {
  const topics = new Set<string>();
  let rest = seg;
  for (const q of qualities(seg)) {
    let kind = QUALITY_TOPIC[q.kind];
    if (!kind) continue;
    if (!q.holdsTrue) kind = NOT_TOPIC[kind] ?? '';
    if (kind) topics.add(kind);
    rest = rest.replace(q.text, ' ');
  }
  for (const [kind, re] of TOPIC_RES) {
    for (const m of seg.matchAll(re)) {
      if (kind === 'contact' && topics.has('noContact')) continue;
      if (kind === 'earthIn' && topics.has('earthOut')) continue;
      topics.add(kind);
      rest = rest.replace(m[0], ' ');
    }
  }
  if (topics.has('noNight')) topics.delete('night');
  if (topics.has('batteryShort') || topics.has('batteryCovers')) {
    topics.delete('night');
    topics.delete('noNight');
  }
  return { topics, rest };
}

const CONNECTIVE_RE =
  /\b(because(?: of)?|due to|owing to|thanks to|as a result of|(?:the|a) result of|caused by|given (?:that|its)|since|(?<=^\s*)as(?!\s+(?:a result|well|long|much|many|soon|of|for|to|seen|shown|expected|noted|per)\b))\b(?!\s+(?:\d|landing|then|the start|arrival|it landed))|(?:^|[,;]\s*|\band\s+)(so)\b(?!\s+(?:far|much|many|long|little|few)\b)|\b(so that|therefore|thus|hence|consequently|which means|this means|that means|meaning(?: that)?|as a result|results? in|resulting in|leads? to|leading to|allow(?:s|ing)|enabl(?:es|ing)|ensur(?:es|ing)|making|which makes|that makes)\b/g;

/** Quotes the sentence from `a` to `b` in its own case. */
type Quote = (a: number, b: number) => string;

/** A cause in the sentence that the figures do not give, or null when every cause in it is one of theirs. */
function causeProblem(t: string, s: StateSummary, site: SiteRef | 'ambiguous', quote: Quote): string | null {
  const links = [...t.matchAll(CONNECTIVE_RE)];
  if (!links.length) return null;
  const m = links[0];
  const word = (m[1] ?? m[2] ?? m[3]).trim();
  const a = m.index! + m[0].indexOf(word);
  const said = quote(a, a + word.length);
  if (links.length > 1) {
    const second = links[1], w2 = (second[1] ?? second[2] ?? second[3]).trim(), a2 = second.index! + second[0].indexOf(w2);
    return `${quote(a2, a2 + w2.length)}, a second cause in one sentence`;
  }
  if (site !== 'ambiguous' && site.kind !== 'selected') return `${said}, a cause for a site the figures give no reasons for`;
  const effectFirst = Boolean(m[1]);
  const left = t.slice(0, a), right = t.slice(a + word.length);
  // "Because the night is long, power ends": a leading cause runs to the first comma.
  let cause = effectFirst ? right : left;
  let effect = effectFirst ? left : right;
  if (effectFirst && !left.trim()) {
    const comma = right.indexOf(',');
    cause = comma < 0 ? right : right.slice(0, comma);
    effect = comma < 0 ? '' : right.slice(comma + 1);
  }
  const c = topicsOf(cause);
  const e = topicsOf(effect);
  const unsupported = `${said}, a cause the figures do not give`;
  if (!c.topics.size || !e.topics.size) return unsupported;
  for (const eff of e.topics) {
    if (!REASONS.some((r) => r.effect === eff && c.topics.has(r.cause) && r.holds(s))) return unsupported;
  }
  if (UNSTATED_CAUSE.test(c.rest)) return unsupported;
  return null;
}

const COMPARATIVE_RE = /\b(more|less|fewer|higher|lower|longer|shorter|better|worse|greater|smaller|larger|bigger|brighter|darker|sunnier|stronger|weaker)\b(?:\s+\S+){0,4}?\s+than\b/g;
const MORE = /more|higher|longer|better|greater|larger|bigger|brighter|sunnier|stronger/;
const METRIC_RES: [string, RegExp][] = [
  ['illum', /\bsun(?:light|lit|shine|'s)?\b|\billuminat\w*|\bdaylight\b/],
  ['earthVis', /\bearth\b|\bradio\b|\bcontact\b/],
  ['longestDark', /\bnights?\b|\bdark(?:ness)?\b/],
  ['batteryH', /\bbattery\b/],
  ['longestGap', /\bgaps?\b/],
];
const metricIn = (seg: string): string | null => {
  let best: { key: string; at: number } | null = null;
  for (const [key, re] of METRIC_RES) {
    const all = [...seg.matchAll(new RegExp(re.source, 'g'))];
    if (all.length && (!best || all[all.length - 1].index! > best.at)) best = { key, at: all[all.length - 1].index! };
  }
  return best?.key ?? null;
};

function fieldsFor(s: StateSummary, site: SiteRef): Fields | null {
  if (site.kind === 'other') return null;
  if (site.kind === 'compare') return compareFields(s.compare[site.i]);
  return { ...siteFields(s), ...sharedFields(s) };
}

/** A comparison between two sites, or two figures of one site, that the figures do not bear out; null when they do. */
function comparisonProblems(t: string, s: StateSummary, mentions: Mention[], subject: SiteRef | 'ambiguous', quote: Quote): string[] {
  const out: string[] = [];
  for (const m of t.matchAll(COMPARATIVE_RE)) {
    const thanAt = m.index! + m[0].length;
    const right = t.slice(thanAt).split(/[,;:.—]/)[0];
    if (/^\s+(?:a |an )?(?:[\d~≈]|half\b|a third\b|a quarter\b|two thirds\b|(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty)\b)/.test(right)) continue; // "more than 16 days": a number's relation
    const left = t.slice(0, m.index!).split(/[;:—]/).pop()!;
    const word = m[1];
    const more = MORE.test(word);
    const siteL = siteAt(t, m.index!, mentions, subject);
    const rightMention = mentions.find((x) => x.at >= thanAt && x.at < thanAt + right.length);
    const metricL = metricIn(left + ' ' + m[0]);
    const metricR = metricIn(right);
    let a: number | undefined, b: number | undefined, what = '';
    if (rightMention && siteL !== 'ambiguous') {
      const key = metricL ?? metricR;
      const fa = key ? fieldsFor(s, siteL)?.[key] : undefined;
      const fb = key ? fieldsFor(s, rightMention.ref)?.[key] : undefined;
      if (fa && fb) {
        a = fa.values[0];
        b = fb.values[0];
        what = `${fa.what} at ${siteName(s, siteL)} (${show(fa, key!)}) against ${siteName(s, rightMention.ref)} (${show(fb, key!)})`;
      }
    } else if (siteL !== 'ambiguous' && metricL && metricR && metricL !== metricR) {
      const fields = fieldsFor(s, siteL);
      const fa = fields?.[metricL], fb = fields?.[metricR];
      if (fa && fb && fa.unit === fb.unit) {
        a = fa.values[0];
        b = fb.values[0];
        what = `${fa.what} (${show(fa, metricL)}) against ${fb.what} (${show(fb, metricR)})`;
      }
    }
    const said = quote(m.index!, m.index! + m[0].length);
    if (a === undefined || b === undefined) out.push(`${said}, a comparison the figures do not make`);
    else if (more ? !(a > b) : !(a < b)) out.push(`${said}, where the figures give ${what}`);
  }
  for (const m of t.matchAll(/\b(?:the )?(?:most|least|best|worst|sunniest|brightest|darkest|highest|lowest)\b(?!\s+(?:of the time|than))/g)) {
    if (/\bat (?:least|most)\b/.test(t.slice(Math.max(0, m.index! - 3), m.index! + m[0].length))) continue;
    out.push(`${quote(m.index!, m.index! + m[0].length)}, a ranking the figures do not make`);
  }
  for (const m of t.matchAll(/\b(?:twice|double|triple|three times|half as)\b/g)) out.push(`${quote(m.index!, m.index! + m[0].length)}, a ratio the figures do not give`);
  return out;
}

/** The dates a sentence may name: the period's first day, its last day and the day after it, and the start's time of day. */
function dateProblem(d: DateClaim, s: StateSummary, said: string): string | null {
  const start = new Date(`${s.window.startUtc}Z`);
  if (Number.isNaN(start.getTime())) return `${said}, a date the figures do not give`;
  const days = [0, s.window.days - 1, s.window.days].map((k) => new Date(start.getTime() + k * 86_400_000));
  const ok = (x: Date) => (d.d === undefined || d.d === x.getUTCDate()) && (d.m === undefined || d.m === x.getUTCMonth() + 1) && (d.y === undefined || d.y === x.getUTCFullYear());
  if (d.time && d.time !== s.window.startUtc.slice(11, 16)) return `${said}, where the period starts at ${s.window.startUtc.slice(11, 16)} UTC`;
  if (d.d === undefined && d.m === undefined && d.y === undefined) return null;
  if (days.some(ok)) return null;
  const long = (x: Date) => `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()][0].toUpperCase()}${MONTHS[x.getUTCMonth()].slice(1)} ${x.getUTCFullYear()}`;
  return `${said}, outside the period's dates (${long(days[0])} to ${long(days[2])})`;
}

/** A judgement of worth the figures do not make ("an ideal landing site"); ranks are the comparisons' to check. */
const JUDGEMENT_RE =
  /\b(?:ideal|excellent|good|great|poor|bad|suitable|unsuitable|favou?rable|unfavou?rable|promising|attractive|recommended|recommend|challenging|risky|safe|unsafe|optimal|perfect|well suited|ill suited|strong candidate|harsh|benign|viable|feasible)\b/g;
/** A time inside the period the figures do not give ("in the second week", "late in the period"). */
const TIMING_RE = /\b(?:first|second|third|fourth|last|final)\s+(?:week|fortnight|half)\b|\b(?:early|late|midway|halfway)\s+(?:in|through|into)\s+the\s+(?:period|window|month|stay|mission)\b|\bmid-(?:month|period|window)\b/g;

/** The problems with one sentence, and the subject it leaves for the next. */
function checkSentence(
  raw: string,
  s: StateSummary,
  variants: { text: string; ref: SiteRef }[],
  subject: SiteRef | 'ambiguous',
  mode: 'narration' | 'reply',
  vouched: Set<string>,
): { problems: string[]; subject: SiteRef | 'ambiguous' } {
  const problems: string[] = [];
  const { masked, mentions } = maskSites(normalize(raw), variants);
  const t = lower(masked);
  const used = new Array<boolean>(t.length).fill(false);
  const dates = dateClaims(t, used);
  const nums = numberClaims(t, used);
  const hits = cueHits(t, nums);
  const unmask = (x: string) => x.replace(/[\uE100-\uE1FF]/g, (c) => mentions.find((m) => masked[m.at] === c)?.name ?? '');
  /** A claim as the sentence wrote it, in its own case. */
  const quote = (a: number, b: number) => `"${unmask(masked.slice(a, b).trim())}"`;
  const distinct = new Map(mentions.map((m) => [siteKey(m.ref), m.ref]));
  const nextSubject: SiteRef | 'ambiguous' = distinct.size === 1 ? [...distinct.values()][0] : distinct.size > 1 ? 'ambiguous' : subject;

  if (mode === 'narration') {
    for (const m of mentions) if (m.ref.kind === 'other') problems.push(`"${m.name}", a site the figures do not cover`);
    for (const m of t.matchAll(JUDGEMENT_RE)) problems.push(`${quote(m.index!, m.index! + m[0].length)}, a judgement the figures do not make`);
    for (const m of t.matchAll(TIMING_RE)) problems.push(`${quote(m.index!, m.index! + m[0].length)}, a time the figures do not give`);
  }

  for (const d of dates) {
    const p = dateProblem(d, s, quote(d.start, d.end));
    if (p && !(mode === 'reply' && d.raw.length > 0 && d.raw.every((x) => vouched.has(canonNumber(x))))) problems.push(p);
  }

  let prev: { claim: NumClaim; keys: string[]; site: SiteRef | 'ambiguous'; unit: Unit } | null = null;
  for (const c of nums) {
    const said = quote(c.start, c.end);
    if (c.bad) {
      problems.push(`${said}, ${c.bad}`);
      continue;
    }
    if (c.unit === 'other') {
      problems.push(`${said}, in a unit no figure is measured in`);
      continue;
    }
    // A year on its own is the period's year or none.
    if (c.unit === 'none' && Number.isInteger(c.value) && c.value >= 1900 && c.value <= 2100) {
      const p = dateProblem({ start: c.start, end: c.end, y: c.value, raw: [c.raw] }, s, said);
      if (p && !(mode === 'reply' && vouched.has(c.raw))) problems.push(p);
      continue;
    }
    let keys: string[] | null = null;
    let site: SiteRef | 'ambiguous' = siteAt(t, c.start, mentions, subject);
    let unit = c.unit;
    // "67.0 % (0.67)", "225 h or about 9.4 days": the second number restates the first.
    if (prev && /^\s*(?:\(|,?\s*or\s+|,?\s*i\.e\.,?\s+|,?\s*that is,?\s+)\s*$/.test(t.slice(prev.claim.end, c.start))) {
      const pu: Unit = prev.unit;
      if (unit === pu || (unit === 'none' && pu === 'pct' && c.value <= 1)) {
        keys = prev.keys;
        site = prev.site;
        unit = pu;
      }
    }
    // "de Gerlache Rim 2 (-88.28, -64.31)": a bare pair in brackets after a site is its latitude and longitude.
    if (!keys && c.unit === 'none') {
      const i = nums.indexOf(c);
      const next = nums[i + 1], last = nums[i - 1];
      if (next?.unit === 'none' && /[\uE100-\uE1FF]\s*\(\s*$/.test(t.slice(0, c.start)) && /^\s*,\s*$/.test(t.slice(c.end, next.start)) && /^\s*\)/.test(t.slice(next.end))) {
        keys = ['lat'];
        unit = 'deg';
      } else if (last?.unit === 'none' && /[\uE100-\uE1FF]\s*\(\s*$/.test(t.slice(0, last.start)) && /^\s*,\s*$/.test(t.slice(last.end, c.start)) && /^\s*\)/.test(t.slice(c.end))) {
        keys = ['lon'];
        unit = 'deg';
      }
    }
    if (!keys) {
      if (unit === 'none') {
        for (const u of ['pct', 'h', 'W', 'Wh', 'deg'] as Unit[]) {
          const k = bind(t, c, u, hits);
          if (k) {
            keys = k;
            unit = u;
            break;
          }
        }
      } else {
        keys = c.adjKeys ?? bind(t, c, unit, hits) ?? DEFAULT_KEYS[unit] ?? null;
      }
    }
    if (unit === 'deg' && c.hemi) keys = [c.hemi === 'NS' ? 'lat' : 'lon'];
    // A pair of bare degrees after a site, "(-88.28°, -64.31°)", is its latitude and longitude.
    if (unit === 'deg' && !keys) {
      const next = nums[nums.indexOf(c) + 1];
      const last = prev?.claim;
      if (next && next.unit === 'deg' && !next.hemi && /^\s*,\s*$/.test(t.slice(c.end, next.start))) keys = ['lat'];
      else if (last && last.unit === 'deg' && !last.hemi && prev!.keys[0] === 'lat' && /^\s*,\s*$/.test(t.slice(last.end, c.start))) keys = ['lon'];
    }
    if (!keys || unit === 'none') {
      if (!(mode === 'reply' && vouched.has(c.raw))) problems.push(`${said}, tied to no figure`);
      continue;
    }
    let value = c.value;
    let tol = c.tol;
    if (c.unit === 'none' && unit !== 'deg') {
      // A bare share, "0.45", read as a fraction of the time.
      if (unit !== 'pct' || Math.abs(c.value) > 1) {
        problems.push(`${said}, with no unit`);
        continue;
      }
      value = c.value * 100;
      tol = c.tol * 100;
    }
    if (c.relative && !keys.some((k) => k === 'poweredH' || k === 'brownoutH')) {
      problems.push(`${said}, a time from an event the figures do not date`);
      continue;
    }
    prev = { claim: c, keys, site, unit };
    if (mode === 'reply' && vouched.has(c.raw) && keys.every((k) => sharedFields(s)[k]?.settable)) continue;
    const scoped = keys.some((k) => SITE_SCOPED.has(k));
    if (scoped && site === 'ambiguous') {
      problems.push(`${said}, where it is not clear which site is meant`);
      continue;
    }
    const where = scoped && site !== 'ambiguous' ? site : STATE_SITE;
    const fields = fieldsFor(s, where);
    if (!fields) {
      problems.push(`${said} for ${siteName(s, where)}, a site the figures do not cover`);
      continue;
    }
    const found = keys.map((k) => [k, fields[k]] as const).filter((x): x is readonly [string, Field] => Boolean(x[1]));
    if (!found.length) {
      problems.push(`${said} for ${siteName(s, where)}, where the figures give only sunlight and Earth in view`);
      continue;
    }
    const relOf = (f: Field): Rel => (f.threshold && (c.rel === 'ge' || c.rel === 'gt') ? 'eq' : c.rel);
    if (found.some(([, f]) => f.values.some((v) => holds(relOf(f), v, value, tol, f.tol, c.floorOk)))) continue;
    const [key, f] = found[0];
    const at = where.kind === 'compare' ? ` at ${siteName(s, where)}` : where.kind === 'selected' && scoped && s.compare.length ? ` at ${s.site.label}` : '';
    problems.push(`${said} for ${f.what}${at}, where the figures say ${show(f, key)}`);
  }

  for (const q of qualities(t)) {
    const scoped = !q.kind.startsWith('panel:') && q.kind !== 'fullStart';
    const site = scoped ? siteAt(t, q.start, mentions, subject) : STATE_SITE;
    if (site === 'ambiguous') {
      problems.push(`${quote(q.start, q.end)}, where it is not clear which site is meant`);
      continue;
    }
    const h = qualityHolds(q.kind, s, site);
    if (h === undefined) {
      problems.push(`${quote(q.start, q.end)} for ${siteName(s, site)}, which the figures do not say`);
      continue;
    }
    if (h !== q.holdsTrue) {
      problems.push(`${quote(q.start, q.end)}${site.kind === 'compare' ? ` for ${siteName(s, site)}` : ''}, ${qualityDetail(q.kind, s, site)}`);
    }
  }

  const causeSite = siteAt(t, 0, mentions, subject);
  const cause = causeProblem(t, s, mentions.length ? causeSite : subject, quote);
  if (cause) problems.push(cause);
  problems.push(...comparisonProblems(t, s, mentions, subject, quote));
  return { problems, subject: nextSubject };
}

/**
 * Reads a narration or a planner reply into claims and checks each against the state's named fields. A
 * narration passes only when every sentence does; a reply keeps the sentences that pass (see `sentences`).
 */
export function checkClaims(text: string, s: StateSummary, opts: ClaimOptions = {}): ClaimCheck {
  const mode = opts.mode ?? 'narration';
  const vouched = new Set(Array.from(opts.vouched ?? [], canonNumber));
  const variants = siteVariants(s, opts.siteNames ?? []);
  let subject: SiteRef | 'ambiguous' = STATE_SITE;
  const sentences: SentenceCheck[] = [];
  for (const part of text.split(/(?<=[.!?])\s+|\n+/)) {
    const raw = part.trim();
    if (!raw) continue;
    const r = checkSentence(raw, s, variants, subject, mode, vouched);
    subject = r.subject;
    sentences.push({ text: raw, ok: r.problems.length === 0, problems: r.problems });
  }
  const problems = sentences.flatMap((x) => x.problems);
  return { ok: problems.length === 0, sentences, problems };
}
