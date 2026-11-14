import { siteByName } from '../ai/actions';
import { siteLabel, type Site } from '../data/loaders';
import { DEFAULT_POWER, type PanelModel } from '../engine/power';
import { spokenToDigits, tidyDates } from '../luna/commands';
import { PANEL_MODELS, PARAM_RANGES, POWER_RANGES, clampTo } from '../planner-ranges';
import { dateLong, spanShort, spanWords } from '../viz/format';
import { NO_REQUIREMENTS, type Requirements } from './judge';

/**
 * A mission's specification for the planner: what the landing must give (the requirements), the lander, how long it
 * stays, when it may land (UTC) and where to look. Heard in plain words by a local parser, filled further by the model
 * through a validated action (fields only, never a result), shown back before any search, and editable.
 */

/** Where to look: every catalogue site, one category, named sites, or the sites within some kilometres of one. */
export type Where = { kind: 'all' } | { kind: 'category'; category: string } | { kind: 'sites'; ids: string[] } | { kind: 'near'; id: string; km: number };

/** What ranks the landings that meet every requirement: the longest time with power, the most contact while powered, or the earliest. */
export type Objective = 'power' | 'contact' | 'earliest';

export interface SpecLander {
  loadW: number;
  batteryWh: number;
  areaM2: number;
  panel: PanelModel;
  /** The mast the radio and the panel look over the hills from (m). */
  mastM: number;
  /** Earth counts as in view only this far above the skyline (degrees). */
  earthClearanceDeg: number;
}

export interface MissionSpec {
  req: Requirements;
  lander: SpecLander;
  /** How long the lander stays, in hours: every figure counts over it. */
  stayH: number;
  /** The first landing time to try (UTC, inclusive) and the end of the window (UTC, exclusive). */
  fromUtc: string;
  toUtc: string;
  where: Where;
  /** Landing times are tried every this many hours. */
  stepH: number;
  objective: Objective;
  /** How many sites the answer shows at most. */
  top: number;
}

/** The fields of a specification that can be heard, filled or edited one by one. */
export interface SpecPatch {
  minPoweredH?: number | null;
  contactWithinH?: number | null;
  maxOutageH?: number | null;
  minPoweredContactH?: number | null;
  loadW?: number;
  batteryWh?: number;
  areaM2?: number;
  panel?: PanelModel;
  mastM?: number;
  earthClearanceDeg?: number;
  stayH?: number;
  fromUtc?: string;
  toUtc?: string;
  where?: Where;
  stepH?: number;
  objective?: Objective;
  top?: number;
}
export type SpecField = keyof SpecPatch;

/** Where a field's value came from: heard (said or typed), read by the assistant, or changed on the page. Absent: the default. */
export type FieldSource = 'heard' | 'assistant' | 'edited';
export type Sources = Partial<Record<SpecField, FieldSource>>;

const DAY = 24;
/** The Sun and Earth table's years; the landing window and the stay must fit inside them. */
export const TABLE = { from: '2024-01-02T00:00:00', to: '2036-12-30T00:00:00' };
/** Bounds that keep a search to seconds: a year of landing times, a stay of 90 days at most. */
export const LIMITS = { windowDays: 366, stayH: 90 * DAY, minStayH: DAY, stepH: { min: 1, max: 24 }, top: { min: 1, max: 5 } };

export const DEFAULT_SPEC: MissionSpec = {
  req: NO_REQUIREMENTS,
  lander: { loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, areaM2: DEFAULT_POWER.areaM2, panel: DEFAULT_POWER.panel, mastM: 2, earthClearanceDeg: 0 },
  stayH: 14 * DAY,
  fromUtc: '2027-01-01T00:00:00',
  toUtc: '2027-04-01T00:00:00',
  where: { kind: 'all' },
  stepH: 1,
  objective: 'power',
  top: 3,
};

/** The catalogue's categories as a sentence names them. */
export const CATEGORY_NAMES: Record<string, string> = {
  artemis3: 'the Artemis III regions',
  clps_landed: 'the CLPS landing sites',
  clps_planned: 'the coming CLPS landing sites',
  apollo: 'the Apollo landing sites',
  international: 'other countries’ landing sites',
  classic: 'the classic south-pole points',
  reference: 'the reference points',
};

const MOON_KM = 1737.4;
const R = Math.PI / 180;

/** Great-circle distance on the Moon between two sites (km). */
export function moonKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const s = Math.sin(((b.lat - a.lat) * R) / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(((b.lon - a.lon) * R) / 2) ** 2;
  return 2 * MOON_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** The catalogue sites a `where` names, in catalogue order; picked points are never among them. */
export function whereSites(where: Where, sites: Site[]): Site[] {
  const listed = sites.filter((s) => s.category !== 'custom');
  switch (where.kind) {
    case 'all':
      return listed;
    case 'category':
      return listed.filter((s) => s.category === where.category);
    case 'sites':
      return listed.filter((s) => where.ids.includes(s.id));
    case 'near': {
      const c = listed.find((s) => s.id === where.id);
      return c ? listed.filter((s) => moonKm(c, s) <= where.km) : [];
    }
  }
}

/** Where to look in words: "the Artemis III regions", "every catalogue site", "within 40 km of Shackleton crater floor". */
export function whereWords(where: Where, sites: Site[]): string {
  const name = (id: string) => {
    const s = sites.find((x) => x.id === id);
    return s ? siteLabel(s) : id;
  };
  switch (where.kind) {
    case 'all':
      return 'every catalogue site';
    case 'category':
      return CATEGORY_NAMES[where.category] ?? `the ${where.category} sites`;
    case 'sites':
      return where.ids.map(name).join(', ');
    case 'near':
      return `within ${where.km} km of ${name(where.id)}`;
  }
}

// ---- hearing a specification ----------------------------------------------------------------------

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NUM = '(\\d+(?:\\.\\d+)?)';
const DUR = `${NUM}\\s*(hours?|hrs?|h|days?|d|weeks?)`;
const DATE = `((?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?${MONTH}(?:\\s+\\d{1,2}(?:st|nd|rd|th)?(?!\\d))?(?:\\s+\\d{4})?|\\d{4}-\\d{2}-\\d{2})`;

const hoursOf = (n: string, unit: string) => Number(n) * (/^w/.test(unit) ? 7 * DAY : /^d/.test(unit) ? DAY : 1);
const wattsOf = (n: string, unit: string) => Number(n) * (/^k/.test(unit) ? 1000 : 1);

/** Lower case, spoken numbers as figures ("five" → 5, "twenty twenty seven" → 2027, "three hundred" → 300), the dates tidied as Luna's are. */
export function tidySpec(text: string): string {
  let t = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/([,;:!?"()])/g, ' $1 ')
    .replace(/\.(?!\d)/g, ' . ')
    .replace(/\s+/g, ' ')
    .trim();
  t = tidyDates(spokenToDigits(t));
  return t
    .replace(/\b(\d+) hundred(?: and)?(?: (\d{1,2}))?\b/g, (_m, a: string, b?: string) => String(Number(a) * 100 + (b ? Number(b) : 0)))
    .replace(/\b(\d+) point (\d+)\b/g, '$1.$2')
    .replace(/\b(?:a|an|1) (?:half|1\/2)\b/g, '0.5')
    .replace(/\b(?:a|one) (week|day|fortnight)\b/g, (_m, u: string) => (u === 'fortnight' ? '14 days' : `1 ${u}`))
    .replace(/\b(?:a|one|1) lunar day\b/g, '14 days')
    .replace(/\s+/g, ' ');
}

/** The UTC instant of a date as said, at the start of its day or month; `end` gives the first instant after it. */
function dateOf(text: string, fallbackYear: number, end: boolean): { utc: string; year: number | null } | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let y: number | null = null;
  let mo: number;
  let d: number | null = null;
  if (iso) [y, mo, d] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else {
    const year = t.match(/\b(\d{4})$/);
    if (year) y = Number(year[1]);
    const m = t.match(new RegExp(MONTH));
    if (!m) return null;
    mo = MONTHS.findIndex((x) => x.startsWith(m[0].slice(0, 3)));
    const day = t.replace(/\b\d{4}$/, '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (day) d = Number(day[1]);
  }
  const year = y ?? fallbackYear;
  const at = d === null ? Date.UTC(year, mo + (end ? 1 : 0), 1) : Date.UTC(year, mo, d + (end ? 1 : 0));
  return { utc: new Date(at).toISOString().slice(0, 19), year: y };
}

/** What a specification's words gave: the fields heard, and the words it could not use. */
export interface Heard {
  patch: SpecPatch;
  leftover: string[];
}

/** Words that carry no field: the way people start, join and end a specification. */
const FILLER = new Set(
  'we i you it they need needs want wants would like should must has have having will be is are a an the and with or also please so then that our my us me for of to at in on by lander mission landing land site sites plan find best one ok okay luna hey also plus too can could which where when'.split(' '),
);

/**
 * Reads a specification from plain words, spoken or typed: each phrase it knows becomes a field, and the words left
 * over are returned so nothing said is silently lost. Numbers said as words are figures first (Luna's own handling).
 */
export function hearSpec(text: string, sites: Site[], fallbackYear = Number(DEFAULT_SPEC.fromUtc.slice(0, 4))): Heard {
  let t = ` ${tidySpec(text)} `;
  const patch: SpecPatch = {};
  /** Takes the first match of a phrase that `use` accepts, leaving a stop in its place. */
  const take = (re: RegExp, use: (m: RegExpMatchArray) => boolean | void) => {
    const m = t.match(re);
    if (!m || m.index === undefined) return;
    if (use(m) === false) return;
    t = `${t.slice(0, m.index)} ; ${t.slice(m.index + m[0].length)}`;
  };

  // Earth at landing, before power, as "within 12 hours of landing" holds a duration too.
  take(new RegExp(`\\b(?:earth|radio contact|contact with earth|contact)\\s+(?:in view|visible|in sight|up|contact)?\\s*within\\s+${DUR}\\s+(?:of|after|from)\\s+(?:landing|touchdown|arrival|we land|it lands)`), (m) => {
    patch.contactWithinH = hoursOf(m[1], m[2]);
  });
  take(/\b(?:earth\s+(?:in view|visible|in sight|up|above the (?:horizon|hills))|see(?:ing)? (?:the )?earth|radio contact|contact with earth|direct[- ]to[- ]earth(?: contact)?)\s+(?:when|as|once|on|at|upon|the moment)\s+(?:we|it|the lander|they)?\s*(?:land|lands|landing|touch(?:es)? down|touchdown|arrive|arrives|arrival)\b/, () => {
    patch.contactWithinH = 0;
  });
  // The longest time without Earth.
  const outage = [
    new RegExp(`\\bno\\s+(?:radio\\s+|contact\\s+|communications?\\s+)?(?:gaps?|outages?|blackouts?|breaks?|loss of (?:contact|signal))\\s+(?:in (?:radio )?contact\\s+)?(?:longer|more|greater|over)\\s+(?:than\\s+)?${DUR}`),
    new RegExp(`\\b(?:radio\\s+|contact\\s+)?(?:gaps?|outages?|blackouts?)\\s+(?:of\\s+)?(?:at most|no more than|no longer than|under|less than|shorter than|below|up to|max(?:imum)?(?: of)?)\\s+${DUR}`),
    new RegExp(`\\b(?:max(?:imum)?|longest)\\s+(?:radio\\s+)?(?:gap|outage|blackout|time without earth)\\s+(?:of\\s+)?${DUR}`),
    new RegExp(`\\b(?:never|not|no)\\s+(?:more|longer)\\s+than\\s+${DUR}\\s+without\\s+(?:seeing\\s+)?(?:earth|radio|contact)`),
  ];
  for (const re of outage) if (patch.maxOutageH === undefined) take(re, (m) => void (patch.maxOutageH = hoursOf(m[1], m[2])));
  // Contact with Earth while powered.
  take(new RegExp(`\\b(?:at least\\s+)?${DUR}\\s+of\\s+(?:radio\\s+|earth\\s+|direct[- ]to[- ]earth\\s+)?(?:contact|communications?|comms|link)`), (m) => {
    patch.minPoweredContactH = hoursOf(m[1], m[2]);
  });
  // Time with power.
  const power = [
    new RegExp(`\\b(?:at least|a minimum of|minimum of|minimum|no less than|more than|over)?\\s*${DUR}\\s+(?:of|with)\\s+(?:continuous\\s+|uninterrupted\\s+|solar\\s+)?(?:power|electricity|energy)`),
    new RegExp(`\\b(?:power|powered|electricity|energy)\\s+(?:for|through|lasting)\\s+(?:at least\\s+)?${DUR}`),
    new RegExp(`\\b(?:keep|have|stay|remain)\\s+(?:its\\s+|the\\s+)?(?:power|powered)\\s+(?:for\\s+)?(?:at least\\s+)?${DUR}`),
  ];
  for (const re of power) if (patch.minPoweredH === undefined) take(re, (m) => void (patch.minPoweredH = hoursOf(m[1], m[2])));
  // The lander.
  take(new RegExp(`\\b${NUM}\\s*(kwh|kilowatt[- ]?hours?|wh|watt[- ]?hours?)\\s+(?:of\\s+)?(?:battery|batteries|storage)`), (m) => void (patch.batteryWh = wattsOf(m[1], m[2])));
  if (patch.batteryWh === undefined) take(new RegExp(`\\b(?:battery|batteries|storage)\\s+(?:of|with|holding|to|at|capacity of|capacity)?\\s*${NUM}\\s*(kwh|kilowatt[- ]?hours?|wh|watt[- ]?hours?)`), (m) => void (patch.batteryWh = wattsOf(m[1], m[2])));
  take(new RegExp(`\\b${NUM}\\s*(kw|kilowatts?|w|watts?)\\s+(?:load|of load|draw|power draw|consumption)`), (m) => void (patch.loadW = wattsOf(m[1], m[2])));
  if (patch.loadW === undefined) take(new RegExp(`\\b(?:load|draws?|uses?|consumes?|consumption)\\s+(?:of|to|at)?\\s*(?:about\\s+)?${NUM}\\s*(kw|kilowatts?|w|watts?)\\b`), (m) => void (patch.loadW = wattsOf(m[1], m[2])));
  take(new RegExp(`\\b${NUM}\\s*(?:m2|m²|square met(?:er|re)s?|sq m)\\s+(?:of\\s+)?(?:solar\\s+)?(?:panels?|arrays?)`), (m) => void (patch.areaM2 = Number(m[1])));
  take(/\b(?:(flat|horizontal|deck) (?:solar )?panels?|(two[- ]axis|2[- ]axis)(?: tracking)?(?: solar)? panels?|(fixed|upright)(?: vertical)?(?: solar)? panels?|(?:(sun[- ]tracking|tracking) (?:solar )?panels?|panels? that (?:turns?|tracks?|follows?) (?:to )?the sun))\b/, (m) => {
    patch.panel = m[1] ? 'horizontal' : m[2] ? 'full_tracking' : m[3] ? 'vertical' : 'vertical_tracking';
  });
  take(new RegExp(`\\b${NUM}\\s*(?:m|metres?|meters?)\\s+(?:high\\s+|tall\\s+)?(?:mast|antenna)`), (m) => void (patch.mastM = Number(m[1])));
  if (patch.mastM === undefined) take(new RegExp(`\\b(?:mast|antenna)\\s+(?:of|at|to|height of|height)?\\s*${NUM}\\s*(?:m|metres?|meters?)\\b`), (m) => void (patch.mastM = Number(m[1])));
  take(new RegExp(`\\bearth\\s+(?:at least\\s+)?${NUM}\\s*(?:degrees?|°)\\s+(?:above|over)\\s+the\\s+(?:skyline|horizon|hills)`), (m) => void (patch.earthClearanceDeg = Number(m[1])));
  // The stay.
  take(new RegExp(`\\b${NUM}[- ]?(day|week|hour)s?\\s+(?:mission|stay|surface (?:mission|stay|operations))`), (m) => void (patch.stayH = hoursOf(m[1], m[2])));
  if (patch.stayH === undefined) take(new RegExp(`\\b(?:mission|stay|operations?|surface operations)\\s+(?:of|lasting|for|duration of|length of|to)\\s+(?:about\\s+)?${DUR}`), (m) => void (patch.stayH = hoursOf(m[1], m[2])));
  // When to land.
  const range = new RegExp(`\\b(?:land(?:ing)?\\s+|arriv(?:e|ing)\\s+)?(?:between|from)\\s+${DATE}\\s+(?:and|to|until|till|through)\\s+${DATE}`);
  take(range, (m) => {
    const b = dateOf(m[2], fallbackYear, true);
    if (!b) return false;
    const by = b.year ?? fallbackYear;
    let a = dateOf(m[1], by, false);
    if (!a) return false;
    if (a.year === null && a.utc >= b.utc) a = dateOf(m[1], by - 1, false)!;
    patch.fromUtc = a.utc;
    patch.toUtc = b.utc;
  });
  if (patch.fromUtc === undefined) {
    take(new RegExp(`\\b(?:land(?:ing)?|arriv(?:e|ing)|touch(?:ing)? down)?\\s*(?:in|during)\\s+(${MONTH}(?:\\s+\\d{4})?|\\d{4})\\b`), (m) => {
      if (/^\d{4}$/.test(m[1])) {
        patch.fromUtc = `${m[1]}-01-01T00:00:00`;
        patch.toUtc = `${Number(m[1]) + 1}-01-01T00:00:00`;
        return;
      }
      const a = dateOf(m[1], fallbackYear, false);
      const b = dateOf(m[1], fallbackYear, true);
      if (!a || !b) return false;
      patch.fromUtc = a.utc;
      patch.toUtc = b.utc;
    });
  }
  // How often to try, how many to show, what to rank by.
  take(/\bevery (\d+) hours?\b|\b(hourly|every hour)\b/, (m) => void (patch.stepH = m[1] ? Number(m[1]) : 1));
  take(/\b(?:the )?(?:best|top) (\d) (?:sites?|places|options|results)\b/, (m) => void (patch.top = Number(m[1])));
  take(/\b(?:as early as possible|the earliest(?: landing)?|land(?:ing)? as soon as possible|earliest possible)\b/, () => void (patch.objective = 'earliest'));
  take(/\b(?:the most|most|longest) (?:radio )?(?:contact|time with earth|earth contact)\b/, () => void (patch.objective = 'contact'));
  // Where to look: a category, every site, a radius round a site, or sites by name.
  take(/\b(?:(?:near|around|at|in|among|from|across|of|over) )?(?:the )?artemis(?: (?:iii|3))?(?: (?:candidate )?(?:regions?|sites?|zones?|areas?|candidates?))?\b/, () => void (patch.where = { kind: 'category', category: 'artemis3' }));
  if (!patch.where) take(/\b(?:the )?(?:coming|planned|future|upcoming) clps(?: landing)?(?: sites?)?\b/, () => void (patch.where = { kind: 'category', category: 'clps_planned' }));
  if (!patch.where) take(/\b(?:(?:near|at|among) )?(?:the )?(?:clps(?: landing)? sites?|where (?:the )?clps landers? (?:landed|touched down))\b/, () => void (patch.where = { kind: 'category', category: 'clps_landed' }));
  if (!patch.where) take(/\b(?:(?:near|at|among) )?(?:the )?apollo(?: landing)? sites?\b/, () => void (patch.where = { kind: 'category', category: 'apollo' }));
  if (!patch.where) take(/\b(?:(?:at|among|over|across|of) )?(?:any|all|every)(?: of the)? (?:catalogue |catalog )?(?:sites?|places|landing sites)\b|\banywhere\b/, () => void (patch.where = { kind: 'all' }));
  if (!patch.where) {
    take(/\bwithin (\d+(?:\.\d+)?) ?(?:km|kilomet(?:er|re)s?) (?:of|from) (?:the )?([a-z0-9' -]+?)(?= ;| ,| \.|$| and | with | for | landing)/, (m) => {
      const s = siteByName(sites, m[2]);
      if (!s) return false;
      patch.where = { kind: 'near', id: s.id, km: Number(m[1]) };
    });
  }
  if (!patch.where) {
    take(/\b(?:near|around|close to|next to) (?:the )?([a-z0-9' -]+?)(?= ;| ,| \.|$| and | with | for | landing)/, (m) => {
      if (/^south pole\b/.test(m[1])) {
        patch.where = { kind: 'near', id: 'south_pole', km: 300 };
        return;
      }
      const s = siteByName(sites, m[1]);
      if (!s) return false;
      patch.where = { kind: 'near', id: s.id, km: 50 };
    });
  }
  if (!patch.where) {
    take(/\b(?:only )?(?:at|choose from|among|between) (?:the )?([a-z0-9' -]+?(?: or | and |, )[a-z0-9' -]+?)(?= ;| \.|$| with | for | landing)/, (m) => {
      const found = m[1].split(/ or | and |, /).map((p) => siteByName(sites, p));
      if (found.some((s) => !s)) return false;
      patch.where = { kind: 'sites', ids: [...new Set(found.map((s) => s!.id))] };
    });
  }
  const leftover = t
    .split(/[;,.!?:()"]/)
    .map((p) => p.trim().replace(/^(?:(?:and|or|with|also|plus|then|but)\s+)+/, '').trim())
    .filter((p) => p.split(' ').filter((w) => w && !FILLER.has(w)).length >= 2);
  return { patch, leftover };
}

// ---- merging, checking and wording ------------------------------------------------------------------

/** A field's value bounded to what the app can compute; the lander's by the lander dialog's own ranges. */
function bounded(f: SpecField, v: number): number {
  switch (f) {
    case 'loadW':
      return clampTo(POWER_RANGES.loadW, v);
    case 'batteryWh':
      return clampTo(POWER_RANGES.batteryWh, v);
    case 'areaM2':
      return clampTo(POWER_RANGES.areaM2, v);
    case 'mastM':
      return clampTo(PARAM_RANGES.mastM, v);
    case 'earthClearanceDeg':
      return clampTo(PARAM_RANGES.minEarthElDeg, v);
    case 'stayH':
      return Math.round(Math.min(LIMITS.stayH, Math.max(LIMITS.minStayH, v)));
    case 'stepH':
      return Math.round(Math.min(LIMITS.stepH.max, Math.max(LIMITS.stepH.min, v)));
    case 'top':
      return Math.round(Math.min(LIMITS.top.max, Math.max(LIMITS.top.min, v)));
    default:
      return Math.round(Math.max(0, Math.min(LIMITS.stayH, v)));
  }
}

/** A specification with a patch applied (bounded), and what each field's source now is. */
export function applyPatch(spec: MissionSpec, from: Sources, patch: SpecPatch, source: FieldSource): { spec: MissionSpec; from: Sources } {
  const next: MissionSpec = { ...spec, req: { ...spec.req }, lander: { ...spec.lander } };
  const marks: Sources = { ...from };
  for (const [key, raw] of Object.entries(patch) as [SpecField, SpecPatch[SpecField]][]) {
    if (raw === undefined) continue;
    marks[key] = source;
    const num = typeof raw === 'number' ? bounded(key, raw) : null;
    switch (key) {
      case 'minPoweredH':
      case 'contactWithinH':
      case 'maxOutageH':
      case 'minPoweredContactH':
        next.req[key] = raw === null ? null : num;
        break;
      case 'loadW':
      case 'batteryWh':
      case 'areaM2':
      case 'mastM':
      case 'earthClearanceDeg':
        next.lander[key] = num!;
        break;
      case 'panel':
        next.lander.panel = raw as PanelModel;
        break;
      case 'stayH':
      case 'stepH':
      case 'top':
        next[key] = num!;
        break;
      case 'fromUtc':
      case 'toUtc':
        next[key] = raw as string;
        break;
      case 'where':
        next.where = raw as Where;
        break;
      case 'objective':
        next.objective = raw as Objective;
        break;
    }
  }
  return { spec: next, from: marks };
}

/** What the specification asks that cannot be searched as it stands, and what was changed so it can, in sentences. */
export function settle(spec: MissionSpec, from: Sources): { spec: MissionSpec; notes: string[]; problems: string[] } {
  const s: MissionSpec = { ...spec };
  const notes: string[] = [];
  const problems: string[] = [];
  const need = Math.max(s.req.minPoweredH ?? 0, s.req.minPoweredContactH ?? 0);
  if (need > s.stayH) {
    if (!from.stayH) {
      s.stayH = Math.min(LIMITS.stayH, Math.ceil(need / DAY) * DAY);
      notes.push(`The stay is ${spanShort(s.stayH)}, so the power asked for can count.`);
    } else problems.push(`The power asked for (${spanShort(need)}) is longer than the stay (${spanShort(s.stayH)}): no landing can meet it.`);
  }
  if (s.toUtc <= s.fromUtc) problems.push('The landing window ends before it starts.');
  const days = (Date.parse(`${s.toUtc}Z`) - Date.parse(`${s.fromUtc}Z`)) / 86_400_000;
  if (days > LIMITS.windowDays) problems.push(`The landing window is ${Math.round(days)} days: the planner searches a year at most. Narrow it.`);
  if (s.fromUtc < TABLE.from) problems.push(`The landing window starts before ${dateLong(TABLE.from, 0)} 2024, where the Sun and Earth table begins.`);
  const end = new Date(Date.parse(`${s.toUtc}Z`) + s.stayH * 3_600_000).toISOString().slice(0, 19);
  if (end > TABLE.to) problems.push('The landing window and the stay run past the end of 2036, where the Sun and Earth table ends.');
  return { spec: s, notes, problems };
}

/** A heard patch merged into a specification: the fields said replace theirs, the rest stay as they were. */
export function mergeHeard(spec: MissionSpec, from: Sources, heard: Heard, source: FieldSource = 'heard'): { spec: MissionSpec; from: Sources; notes: string[]; problems: string[] } {
  const merged = applyPatch(spec, from, heard.patch, source);
  const settled = settle(merged.spec, merged.from);
  return { spec: settled.spec, from: merged.from, notes: settled.notes, problems: settled.problems };
}

/** The last day of a window that ends at midnight UTC, and the window in words: "1 March to 30 June 2027, UTC". */
export function windowWords(spec: Pick<MissionSpec, 'fromUtc' | 'toUtc'>): string {
  const last = new Date(Date.parse(`${spec.toUtc}Z`) - (spec.toUtc.endsWith('T00:00:00') ? 86_400_000 : 0)).toISOString().slice(0, 19);
  const a = `${dateLong(spec.fromUtc, 0)}${spec.fromUtc.slice(0, 4) === last.slice(0, 4) ? '' : ` ${spec.fromUtc.slice(0, 4)}`}`;
  return `${a} to ${dateLong(last, 0)} ${last.slice(0, 4)}, UTC`;
}

const kwh = (wh: number) => `${Number.isInteger(wh / 1000) ? wh / 1000 : (wh / 1000).toFixed(1)} kWh`;
const PANEL_SHORT: Record<PanelModel, string> = { horizontal: 'flat panel', vertical: 'fixed upright panel', vertical_tracking: 'panel that turns to the Sun', full_tracking: 'two-axis tracking panel' };
const OBJECTIVE_WORDS: Record<Objective, string> = { power: 'longest time with power from landing', contact: 'most Earth contact while powered', earliest: 'earliest landing' };

/** One line of the specification for the page: its label, its value, and whether it is the default. */
export interface SpecLine {
  label: string;
  value: string;
  isDefault: boolean;
}

/** Every field of the specification as the page shows it back, the defaults marked as such. */
export function specLines(spec: MissionSpec, from: Sources, sites: Site[]): SpecLine[] {
  const r = spec.req;
  const said = (...f: SpecField[]) => f.some((x) => from[x]);
  return [
    { label: 'Power from landing', value: r.minPoweredH === null ? 'no minimum' : `at least ${spanShort(r.minPoweredH)} in a row`, isDefault: !said('minPoweredH') },
    { label: 'Earth at landing', value: r.contactWithinH === null ? 'not required' : r.contactWithinH === 0 ? 'in view at landing' : `in view within ${spanShort(r.contactWithinH)} of landing`, isDefault: !said('contactWithinH') },
    { label: 'Longest time without Earth while powered', value: r.maxOutageH === null ? 'no limit' : `at most ${spanShort(r.maxOutageH)}`, isDefault: !said('maxOutageH') },
    { label: 'Earth contact while powered', value: r.minPoweredContactH === null ? 'no minimum' : `at least ${spanShort(r.minPoweredContactH)}`, isDefault: !said('minPoweredContactH') },
    { label: 'Load', value: `${spec.lander.loadW} W`, isDefault: !said('loadW') },
    { label: 'Battery', value: kwh(spec.lander.batteryWh), isDefault: !said('batteryWh') },
    { label: 'Panel', value: `${spec.lander.areaM2} m² ${PANEL_SHORT[spec.lander.panel]}`, isDefault: !said('areaM2', 'panel') },
    { label: 'Mast', value: `${spec.lander.mastM} m`, isDefault: !said('mastM') },
    { label: 'Stay', value: spanShort(spec.stayH), isDefault: !said('stayH') },
    { label: 'Landing window', value: windowWords(spec), isDefault: !said('fromUtc', 'toUtc') },
    { label: 'Landing times tried', value: spec.stepH === 1 ? 'every hour' : `every ${spec.stepH} hours`, isDefault: !said('stepH') },
    { label: 'Where', value: `${whereWords(spec.where, sites)} (${whereSites(spec.where, sites).length} sites)`, isDefault: !said('where') },
    { label: 'Ranked by', value: `requirements met first, then the ${OBJECTIVE_WORDS[spec.objective]}`, isDefault: !said('objective') },
  ];
}

/** A number for speech, with its unit in words: "300 watt", "3 kilowatt-hour". */
const spokenKwh = (wh: number) => `${Number.isInteger(wh / 1000) ? wh / 1000 : (wh / 1000).toFixed(1)} kilowatt-hour`;

/**
 * Luna's read-back of what she heard, in whole words, the fields said first and the defaults after, so a misheard number
 * is caught before it counts: "I heard: at least 5 days of power, … Say search to start, or tell me what to change."
 */
export function spokenReadBack(spec: MissionSpec, from: Sources, sites: Site[]): string {
  const r = spec.req;
  const parts: string[] = [];
  if (from.minPoweredH && r.minPoweredH !== null) parts.push(`at least ${spanWords(r.minPoweredH)} of power`);
  if (from.contactWithinH && r.contactWithinH !== null) parts.push(r.contactWithinH === 0 ? 'Earth in view at landing' : `Earth in view within ${spanWords(r.contactWithinH)} of landing`);
  if (from.maxOutageH && r.maxOutageH !== null) parts.push(`no more than ${spanWords(r.maxOutageH)} without Earth while powered`);
  if (from.minPoweredContactH && r.minPoweredContactH !== null) parts.push(`at least ${spanWords(r.minPoweredContactH)} of Earth contact while powered`);
  if (from.loadW) parts.push(`a ${spec.lander.loadW} watt load`);
  if (from.batteryWh) parts.push(`a ${spokenKwh(spec.lander.batteryWh)} battery`);
  if (from.areaM2) parts.push(`a ${spec.lander.areaM2} square metre panel`);
  if (from.panel) parts.push(`a ${PANEL_SHORT[spec.lander.panel]}`);
  if (from.mastM) parts.push(`a ${spec.lander.mastM} metre mast`);
  if (from.stayH) parts.push(`a stay of ${spanWords(spec.stayH)}`);
  if (from.fromUtc || from.toUtc) parts.push(`landing from ${windowWords(spec).replace(', UTC', ' UTC')}`);
  if (from.where) parts.push(`at ${whereWords(spec.where, sites)}`);
  if (from.objective) parts.push(`ranked by the ${OBJECTIVE_WORDS[spec.objective]}`);
  const rest: string[] = [];
  if (!from.stayH) rest.push(`a stay of ${spanWords(spec.stayH)}`);
  if (!from.fromUtc && !from.toUtc) rest.push(`landing from ${windowWords(spec).replace(', UTC', ' UTC')}`);
  if (!from.where) rest.push('every catalogue site');
  if (!from.loadW && !from.batteryWh) rest.push(`the small lander's ${spec.lander.loadW} watt load and ${spokenKwh(spec.lander.batteryWh)} battery`);
  if (!from.mastM) rest.push(`a ${spec.lander.mastM} metre mast`);
  const heard = parts.length ? `I heard: ${parts.join(', ')}.` : 'I did not hear a requirement yet.';
  const defaults = rest.length ? ` For the rest, the defaults: ${rest.join(', ')}.` : '';
  return `${heard}${defaults} Say search to start, or tell me what to change.`;
}

/** The panel models the planner offers, for its select. */
export const PANELS: readonly PanelModel[] = PANEL_MODELS;
export { PANEL_SHORT, OBJECTIVE_WORDS };
