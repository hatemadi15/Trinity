import type { Site } from '../data/loaders';
import { PANEL_LABELS, type PanelModel } from '../engine/power';
import { periodDays, shiftWords, withClock } from '../period';
import { clampTo, DAYS_RANGE, PARAM_RANGES, POWER_RANGES } from '../planner-ranges';
import { PAGE_NAMES, periodNote, siteByName, tokens, type Action, type Page } from './actions';
import { EXPLANATIONS, explanationFor } from './explanations';
import { slipLabel } from '../scenario/scenario';

export { EXPLANATIONS };

export interface Intent {
  name: string;
  pattern: RegExp;
  /** Returns null when the phrasing matched but the details did not (unknown window length, bad date), so the next intent or the model can try. */
  build: (m: RegExpMatchArray, sites: Site[]) => { actions: Action[]; reply: string } | null;
  /** A comparison read for certain: the chat route answers it before any model, as the app compares with its own figures. */
  sure?: boolean;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const parseDays = (x: string | undefined): number | null => (x === undefined ? null : periodDays(amountOf(x) ?? Number.NaN));

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A count typed in figures or words: "5", "five", "twenty four", "a" or "an" (one); null for anything else. */
export function amountOf(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  if (t === 'a' || t === 'an') return 1;
  const unit = UNITS.indexOf(t);
  if (unit >= 0) return unit;
  const m = t.match(/^([a-z]+)(?:[ -]([a-z]+))?$/);
  const tens = m ? TENS.indexOf(m[1]) : -1;
  if (!m || tens < 2) return null;
  const rest = m[2] === undefined ? 0 : UNITS.indexOf(m[2]);
  return rest >= 0 && rest <= 9 ? tens * 10 + rest : null;
}

/** "17:00", "1700", "17h", "5 pm", "17 hundred" (said "seventeen hundred"), "oh 6 hundred", "noon": minutes after midnight UTC. */
export function parseClock(text: string): number | null {
  let t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  // A zone named at the end is UTC's own name; a bare hour counts only with it ("17 UTC"), as "at 5" could be morning or evening.
  const zoned = /(?:^|\s|\d)(?:utc|gmt|zulu|z)$/.test(t);
  t = t.replace(/\s*(?:utc|gmt|zulu|z)$/, '').trim();
  if (t === 'noon' || t === 'midday') return 720;
  if (t === 'midnight') return 0;
  const at = (h: number, min = 0) => (h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null);
  let m = t.match(/^(\d{1,2})(?:[: ](\d{2}))? ?([ap])\.? ?m\.?$/);
  if (m) {
    const h = Number(m[1]);
    return h >= 1 && h <= 12 ? at((h % 12) + (m[3] === 'p' ? 12 : 0), Number(m[2] ?? 0)) : null;
  }
  if ((m = t.match(/^(\d{1,2}):(\d{2})$/)) || (m = t.match(/^(\d{1,2}) (\d{2})$/))) return at(Number(m[1]), Number(m[2]));
  // Four figures are a time on the hour ("1700"), or with "hours" or the zone ("1730 UTC"): "2027" alone is a year.
  if ((m = t.match(/^(\d{2})(\d{2})( hours| hrs)?$/)) && (m[2] === '00' || m[3] || zoned)) return at(Number(m[1]), Number(m[2]));
  if ((m = t.match(/^(\d{1,2}) ?h(\d{2})?$/))) return at(Number(m[1]), Number(m[2] ?? 0));
  if ((m = t.match(/^(?:oh |o |0 |zero )?(\d{1,2}) hundred(?: hours)?$/))) return at(Number(m[1]));
  if (zoned && (m = t.match(/^(\d{1,2})$/))) return at(Number(m[1]));
  return null;
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * A landing said in words: a date, a date and a time ("January 20th 2027 at 17:00 UTC", "2027-01-20 5 pm"), or a time
 * alone ("at 17:00"), which lands on the date already chosen. Null when it is neither.
 */
export function parseWhen(text: string): { startUtc: string | null; clock: string | null } | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,$/, '').replace(/^at /, '');
  const date = parseDate(t);
  if (date) return { startUtc: date, clock: null };
  const minutes = parseClock(t);
  if (minutes !== null) return { startUtc: null, clock: hhmm(minutes) };
  // A date, then its time: tried at every space from the right, "at" between them or not.
  const words = t.split(' ');
  for (let i = words.length - 1; i > 0; i--) {
    const d = parseDate(words.slice(0, i).join(' ').replace(/,$/, ''));
    const c = d ? parseClock(words.slice(i).join(' ').replace(/^at /, '')) : null;
    if (d && c !== null) return { startUtc: d, clock: hhmm(c) };
  }
  return null;
}

/** ISO `2027-03-01`, `1 March 2027` or `March 1, 2027` → `2027-03-01T00:00:00`; null otherwise. */
export function parseDate(text: string): string | null {
  const t = text.trim().toLowerCase();
  let y: number | undefined;
  let mo: number | undefined;
  let d: number | undefined;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!m && (m = t.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+),? (\d{4})$/))) [d, mo, y] = [Number(m[1]), MONTHS.indexOf(m[2].slice(0, 3)) + 1, Number(m[3])];
  if (!m && (m = t.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/))) [mo, d, y] = [MONTHS.indexOf(m[1].slice(0, 3)) + 1, Number(m[2]), Number(m[3])];
  if (y === undefined || mo === undefined || d === undefined || mo < 1) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (y < 2024 || y > 2036) return null;
  return date.toISOString().slice(0, 19);
}

const notFound = (text: string) => ({ actions: [] as Action[], reply: `I could not find a site called "${text.trim()}" in the catalogue.` });
const NO_SUCH_PERIOD = `A period is ${DAYS_RANGE.min} to ${DAYS_RANGE.max} whole days, so the period stays as it is.`;

/** Words that move a landing later or earlier, as "delay" or "bring forward" do; any other verb moves it later unless told "earlier". */
const LATER = /^(?:delay|postpone|push back|push|slip|slipped)$/;
const EARLIER = /^(?:advance|bring forward|bring|move up|move forward|shift forward|push forward)$/;
const AMOUNT = '(-|minus |\\+|plus )?(\\d+|an?|[a-z]+(?:[ -][a-z]+)?)';

/** The pages' own names, and the words people use for them, to the page each one opens. */
const PAGE_WORDS: Record<string, Page> = {
  explore: 'explore',
  sites: 'sites',
  'site list': 'sites',
  'list of sites': 'sites',
  'landing sites': 'sites',
  'list of landing sites': 'sites',
  compare: 'compare',
  validate: 'validate',
  accuracy: 'validate',
  brief: 'brief',
  learn: 'learn',
  'how it works': 'learn',
};

function panelFor(words: string): PanelModel | null {
  const w = words.toLowerCase();
  if (/horizontal|flat/.test(w)) return 'horizontal';
  if (/two[- ]axis|2[- ]axis|full/.test(w)) return 'full_tracking';
  if (/fixed/.test(w)) return 'vertical';
  if (/tracking|vertical|turning|sun[- ]following/.test(w)) return 'vertical_tracking';
  return null;
}

/** A count for a comparison's delay, in figures or words ("5", "five", "twelve"), read as the period's amounts are. */
const countOf = (text: string): number | null => amountOf(text);
const COUNT = '(\\d{1,4}|[a-z]+)';

/** The site shown, in the words people use for it: "this", "it", "this site", "this landing", "here". */
const THIS = '(?:this|it|this one|this site|this landing(?: site)?|this place|this spot|here|the site shown|the current site|the current landing|my site|our site|my landing|our landing|where i am|where we are)';
/** Every other site of the catalogue: "any landing site", "all the other sites", "every landing site", "the rest". */
const OTHERS =
  '(?:(?:any|every|each|all|all the|all of the|all other|all the other|the other|other|the best|the best other|the top)(?: other)? (?:landing )?(?:sites?|places?|spots?|landings?|ones?|options?)(?: in the (?:catalogue|list))?|(?:all )?(?:of )?(?:the )?others|(?:all )?the rest|all of them|them all|everywhere else|anywhere else|the (?:whole )?(?:catalogue|list|site list))';
/** "for these dates", "for the dates chosen", "for this lander": the settings already chosen, which every comparison keeps. */
const FOR_THESE = '(?:(?:for|with|on|over) (?:these|the|my|our|those|the chosen|the current|this|this period|this lander)(?: (?:dates?|days|period|landing dates?|lander|settings))?(?: and (?:this|the|my|our) lander)?|right now|now)';
/** A length for the comparison: "for 14 days" (any number of days the period can be; the reply says when it cannot). */
const FOR_DAYS = '(?: (?:for|over) (\\d+|[a-z]+(?:[ -][a-z]+)?)[- ]?days?)?';

/** Edits between two words (a letter added, dropped, changed or two swapped); `max + 1` at once when their lengths alone differ by more. */
function editsBetween(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * A name typed with a slip ("Nobel Rim 1", "de Gerlach Rim 2", "Shakleton"): each word of four letters or more not in
 * the catalogue becomes the catalogue's word one edit away (two for a word of five letters or more that starts with the
 * same letter), when only one is that close.
 */
function corrected(sites: Site[], text: string): string {
  const known = new Set(sites.flatMap((x) => tokens(`${x.name} ${x.id}`)).filter((w) => /^[a-z]+$/.test(w)));
  return tokens(text)
    .map((w) => {
      if (known.has(w) || w.length < 4 || !/^[a-z]+$/.test(w)) return w;
      const near = [...known].filter((k) => k.length >= 4 && editsBetween(w, k, 2) <= (w.length >= 5 && k[0] === w[0] ? 2 : 1));
      return near.length === 1 ? near[0] : w;
    })
    .join(' ');
}

/** A site said as people say it: number words as figures ("Nobile Rim one"), "the" and a final "site" taken off, a slip in the spelling forgiven. */
function siteNamed(sites: Site[], text: string): Site | null {
  const said = text
    .trim()
    .replace(/^(?:the|a) /i, '')
    .replace(/ (?:landing )?site$/i, '')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => String(amountOf(w)));
  return siteByName(sites, said) ?? siteByName(sites, text) ?? siteByName(sites, corrected(sites, said));
}

/** A new comparison of these sites (after the site shown when `shown`), with a period when one was said. */
function compareReply(daysSaid: string | undefined, picked: Site[], shown: boolean): { actions: Action[]; reply: string } {
  const days = parseDays(daysSaid);
  const unsupported = daysSaid !== undefined && !days ? ` ${NO_SUCH_PERIOD}` : '';
  // The period first, so the comparison is made with it.
  const actions: Action[] = [...(days ? [{ type: 'set_window', days } as Action] : []), { type: 'compare_sites', ids: picked.map((x) => x.id), ...(shown ? { shown: true } : {}) }];
  const names = picked.map((x) => x.name).join(' and ');
  return { actions, reply: `${shown ? `Comparing the site shown with ${names}` : `Comparing ${names}`}${days ? ` over ${days} days` : ''}.${unsupported}` };
}

/** The rehearsed phrasings, most specific first. Matching is case-insensitive on a trimmed prompt without its final punctuation. */
export const INTENTS: Intent[] = [
  {
    // Before "compare A and B": "compare with a five-day delay" is the landing shown against the same landing moved.
    name: 'compare_shift',
    pattern: new RegExp(
      `^compare(?: it| this(?: landing)?| the landing)? (?:with|against|to) (?:(?:a|an) )?(?:(?:landing )?${COUNT}[- ](days?|hours?)(?:[- ](delay|slip|later|earlier|sooner))?|(?:delay|slip) of ${COUNT} (days?|hours?))$`,
      'i',
    ),
    build(m) {
      const n = countOf(m[1] ?? m[4]);
      const unit = (m[2] ?? m[5]).toLowerCase();
      if (n === null || n === 0) return null;
      const hours = n * (unit.startsWith('day') ? 24 : 1) * (/^(earlier|sooner)$/i.test(m[3] ?? '') ? -1 : 1);
      return { actions: [{ type: 'compare_shift', hours }], reply: `Comparing this landing with the same one ${slipLabel(hours)}.` };
    },
  },
  {
    // The site shown against the whole catalogue: "compare this to any landing site", "is there a better site".
    name: 'compare_best',
    sure: true,
    pattern: new RegExp(
      `^(?:compare ${THIS} (?:to|with|against|and|vs\\.?|versus) ${OTHERS}|how (?:does|do|would|will) ${THIS} (?:compare|stack up|rank|measure up)(?: (?:to|with|against|among))? ${OTHERS}|(?:is there|are there|do we have|is there not)(?: an?| any)? (?:better|best) (?:landing )?(?:sites?|places?|spots?|options?|choices?)(?: (?:than (?:${THIS})|to land|for landing))?|(?:which|what)(?: is|'s)?(?: the)? (?:best )?(?:landing )?(?:site|place|spot)(?: is| would be)?(?: the)? best(?: one)?|(?:which|what)(?: is|'s)(?: the)? best (?:landing )?(?:site|place|spot)(?: to land)?)(?: ${FOR_THESE})?$`,
      'i',
    ),
    build: () => ({ actions: [{ type: 'compare_best' }], reply: 'Ranking every site for these dates and this lander, as the site list does.' }),
  },
  {
    // The site shown against a named one: "compare this to Nobile Rim 1", "how does it compare with Haworth".
    name: 'compare_with',
    sure: true,
    pattern: new RegExp(`^(?:compare ${THIS} (?:to|with|against|and|vs\\.?|versus)|how (?:does|do|would|will) ${THIS} (?:compare|stack up|measure up) (?:to|with|against)) (.+?)${FOR_DAYS}$`, 'i'),
    build(m, sites) {
      const site = siteNamed(sites, m[1]);
      return site ? compareReply(m[2], [site], true) : notFound(m[1]);
    },
  },
  {
    // A named site against the one shown, the other way round: "compare Nobile Rim 1 with this".
    name: 'compare_with_shown',
    sure: true,
    pattern: new RegExp(`^compare (.+?) (?:to|with|against|and|vs\\.?|versus) ${THIS}${FOR_DAYS}$`, 'i'),
    build(m, sites) {
      const site = siteNamed(sites, m[1]);
      return site ? compareReply(m[2], [site], true) : notFound(m[1]);
    },
  },
  {
    name: 'compare',
    sure: true,
    pattern: new RegExp(`^(?:compare (.+?) (?:and|with|to|vs\\.?|versus|against)|how (?:does|do|would|will) (.+?) (?:compare|stack up|measure up) (?:to|with|against)) (.+?)${FOR_DAYS}$`, 'i'),
    build(m, sites) {
      const first = m[1] ?? m[2];
      const a = siteNamed(sites, first);
      const b = siteNamed(sites, m[3]);
      if (!a) return notFound(first);
      if (!b) return notFound(m[3]);
      if (a.id === b.id) return { actions: [], reply: `Both names are ${a.name}: name another site to compare it with.` };
      return compareReply(m[4], [a, b], false);
    },
  },
  {
    name: 'add_to_compare',
    pattern: /^add (.+?) to (?:the )?compar(?:e|ison)$/i,
    build(m, sites) {
      const site = siteByName(sites, m[1]);
      return site ? { actions: [{ type: 'add_to_compare', id: site.id }], reply: `Adding ${site.name} to the comparison.` } : notFound(m[1]);
    },
  },
  {
    name: 'best_window',
    pattern: /^(?:find |show |show me |give me |what is |what's )?(?:the )?best (?:(\d+)[- ]?day (?:window|landing date|landing day)|landing (?:date|day) for (\d+)[- ]?days?)\b(.*)$/i,
    build(m) {
      const days = parseDays(m[1] ?? m[2]);
      if (!days) return null;
      const scope = /compar/i.test(m[3]) ? 'compare' : 'site';
      return {
        actions: [{ type: 'find_best_window', days, scope }],
        reply: `Searching the next 12 months for the landing date that keeps power longest over ${days} days${scope === 'compare' ? ', judged by the compared site that does worst' : ''}.`,
      };
    },
  },
  {
    name: 'start_on',
    pattern: /^(?:start|begin|land|landing)(?: on| from)? (.+?)(?: for (\w+(?:[ -]\w+)?)[- ]?days?)?$/i,
    build(m) {
      const when = parseWhen(m[1]);
      if (!when) return null;
      const days = parseDays(m[2]);
      if (m[2] !== undefined && !days) return null;
      const length = days ? { days } : {};
      // A time alone lands on the date already chosen: the store knows it, the phrasing does not.
      if (!when.startUtc) return { actions: [{ type: 'set_window', timeUtc: when.clock!, ...length }], reply: `Landing at ${when.clock} UTC on the date already chosen.` };
      // Minutes are read at the nearest whole hour, as the engine reads its hourly table, and the reply says so.
      const timed = when.clock ? withClock(when.startUtc, when.clock)! : { startUtc: when.startUtc, rounded: false };
      const rounded = timed.rounded ? ` The Sun and Earth table is hourly, so ${when.clock} is read as ${timed.startUtc.slice(11, 16)} UTC.` : '';
      return { actions: [{ type: 'set_window', startUtc: timed.startUtc, ...length }], reply: `${periodNote(timed.startUtc, days ?? undefined)}${rounded}` };
    },
  },
  {
    name: 'shift',
    pattern: new RegExp(
      `^(?:(?:our|the) )?(delay|postpone|push back|push|slip|shift|move|advance|bring|move up|move forward|land|landing)(?: the)?(?: landing| start| launch| period| mission)?(?: date| time| slipped)?(?: (back|forward))?(?: by)? ${AMOUNT} (days?|hours?|hrs?|h|d)(?: (later|earlier|sooner|back|forward))?$`,
      'i',
    ),
    build(m) {
      // "the landing slipped five days" reads its verb after the noun.
      const verb = (m[1].toLowerCase() === 'landing' ? 'slipped' : m[1].toLowerCase()) + (m[2] ? ` ${m[2].toLowerCase()}` : '');
      const n = amountOf(m[4]);
      if (n === null || n === 0) return null;
      const hours = n * (/^d/i.test(m[5]) ? 24 : 1);
      // "later" and "earlier" after the amount say it; "back" after it is back in time; else the verb does ("delay", "bring forward").
      const after = m[6]?.toLowerCase();
      const earlier = after === 'later' ? false : after === 'earlier' || after === 'sooner' || after === 'back' ? true : after === 'forward' ? !LATER.test(verb) : EARLIER.test(verb);
      const sign = /^(?:-|minus)$/.test((m[3] ?? '').trim()) || earlier ? -1 : 1;
      return { actions: [{ type: 'shift_window', hours: sign * hours }], reply: `Moving the landing ${shiftWords(hours)} ${sign > 0 ? 'later' : 'earlier'}.` };
    },
  },
  {
    name: 'period',
    pattern: /^(?:make it|(?:set|change) (?:the )?(?:period|length|duration|stay)(?: length)? to|for|over|stay for) (\w+(?:[ -]\w+)?)[- ]?days?$/i,
    build(m) {
      // A length in words that is no number ("for a few days") is left to the model; a number outside the bounds is not a period.
      if (amountOf(m[1]) === null) return null;
      const days = parseDays(m[1]);
      return days ? { actions: [{ type: 'set_window', days }], reply: `Period: ${days} days.` } : { actions: [], reply: NO_SUCH_PERIOD };
    },
  },
  {
    name: 'load',
    pattern: /^set (?:the )?load to (\d+(?:\.\d+)?) ?w(?:atts?)?$/i,
    build(m) {
      const asked = Number(m[1]);
      const loadW = clampTo(POWER_RANGES.loadW, asked);
      return { actions: [{ type: 'set_power', patch: { loadW } }], reply: loadW === asked ? `Load set to ${loadW} W.` : `Load set to ${loadW} W, the ${asked > loadW ? 'highest' : 'lowest'} the lander settings allow.` };
    },
  },
  {
    name: 'battery',
    pattern: /^set (?:the )?battery to (\d+(?:\.\d+)?) ?wh$/i,
    build(m) {
      const asked = Number(m[1]);
      const batteryWh = clampTo(POWER_RANGES.batteryWh, asked);
      return { actions: [{ type: 'set_power', patch: { batteryWh } }], reply: batteryWh === asked ? `Battery set to ${batteryWh} Wh.` : `Battery set to ${batteryWh} Wh, the ${asked > batteryWh ? 'largest' : 'smallest'} the lander settings allow.` };
    },
  },
  {
    name: 'panel',
    pattern: /^(?:use|switch to|set) (?:a |an |the )?(.+?) (?:solar )?panels?$/i,
    build(m) {
      const panel = panelFor(m[1]);
      return panel ? { actions: [{ type: 'set_power', patch: { panel } }], reply: `Panel: ${PANEL_LABELS[panel]}.` } : null;
    },
  },
  {
    name: 'mast',
    pattern: /^(?:set |raise |lower )?(?:the )?mast(?: height)? to (\d+(?:\.\d+)?) ?m(?:etres?|eters?)?$/i,
    build(m) {
      const asked = Number(m[1]);
      const mastM = clampTo(PARAM_RANGES.mastM, asked);
      return { actions: [{ type: 'set_params', patch: { mastM } }], reply: `Mast set to ${mastM} m${mastM === asked ? '' : `, the ${asked > mastM ? 'highest' : 'lowest'} the lander settings allow`}; the hills are worked out again from that height.` };
    },
  },
  {
    name: 'open_page',
    pattern: /^(?:open|go to|take me to|show me|show|switch to) (?:the )?(explore|sites|site list|list of sites|landing sites|list of landing sites|compare|validate|accuracy|brief|learn|how it works)(?: page| view)?$/i,
    build(m) {
      const page = PAGE_WORDS[m[1].toLowerCase()];
      return { actions: [{ type: 'open_page', page }], reply: `Opening ${PAGE_NAMES[page]}.` };
    },
  },
  {
    name: 'explain',
    pattern: /^(?:explain|what is|what's|what does|tell me about) (.+?)(?: mean)?$/i,
    build(m) {
      const e = explanationFor(m[1]);
      return e ? { actions: [{ type: 'explain', topic: e.topic }], reply: e.text } : null;
    },
  },
  {
    name: 'select_site',
    pattern: /^(?:show me|show|select|go to|pick|choose|take me to|jump to|fly to) (.+)$/i,
    build(m, sites) {
      const site = siteByName(sites, m[1]);
      return site ? { actions: [{ type: 'select_site', id: site.id }], reply: `Selected ${site.name}.` } : notFound(m[1]);
    },
  },
];

/** The phrasing that answered, with its name and whether it is a comparison read for certain; null when none did. */
export function matchIntentNamed(prompt: string, sites: Site[]): { actions: Action[]; reply: string; name: string; sure: boolean } | null {
  const p = prompt
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim();
  if (!p) return null;
  for (const intent of INTENTS) {
    const m = p.match(intent.pattern);
    if (!m) continue;
    const r = intent.build(m, sites);
    if (r) return { ...r, name: intent.name, sure: intent.sure === true };
  }
  return null;
}

/** Deterministic answer for a rehearsed phrasing, or null when the prompt is for the model (or the cache). */
export function matchIntent(prompt: string, sites: Site[]): { actions: Action[]; reply: string } | null {
  const r = matchIntentNamed(prompt, sites);
  return r ? { actions: r.actions, reply: r.reply } : null;
}
