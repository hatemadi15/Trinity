import type { Site } from '../data/loaders';
import { PANEL_LABELS, type PanelModel } from '../engine/power';
import type { WindowDays } from '../store/explore';
import { siteByName, type Action, type Page } from './actions';
import { EXPLANATIONS, explanationFor } from './explanations';

export { EXPLANATIONS };

export interface Intent {
  name: string;
  pattern: RegExp;
  /** Returns null when the phrasing matched but the details did not (unknown window length, bad date), so the next intent or the model can try. */
  build: (m: RegExpMatchArray, sites: Site[]) => { actions: Action[]; reply: string } | null;
}

const DAYS: readonly WindowDays[] = [14, 30, 90];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const parseDays = (x: string | undefined): WindowDays | null => {
  if (x === undefined) return null;
  const n = Number(x);
  return (DAYS as readonly number[]).includes(n) ? (n as WindowDays) : null;
};

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

function panelFor(words: string): PanelModel | null {
  const w = words.toLowerCase();
  if (/horizontal|flat/.test(w)) return 'horizontal';
  if (/two[- ]axis|2[- ]axis|full/.test(w)) return 'full_tracking';
  if (/fixed/.test(w)) return 'vertical';
  if (/tracking|vertical|turning|sun[- ]following/.test(w)) return 'vertical_tracking';
  return null;
}

/** The twelve rehearsed phrasings, most specific first. Matching is case-insensitive on a trimmed prompt without its final punctuation. */
export const INTENTS: Intent[] = [
  {
    name: 'compare',
    pattern: /^compare (.+?) (?:and|with|vs\.?|versus|against) (.+?)(?: (?:for|over) (\d+)[- ]?days?)?$/i,
    build(m, sites) {
      const a = siteByName(sites, m[1]);
      const b = siteByName(sites, m[2]);
      if (!a) return notFound(m[1]);
      if (!b) return notFound(m[2]);
      const days = parseDays(m[3]);
      const actions: Action[] = [
        { type: 'add_to_compare', id: a.id },
        { type: 'add_to_compare', id: b.id },
        ...(days ? [{ type: 'set_window', days } as Action] : []),
        { type: 'open_page', page: 'compare' },
      ];
      return { actions, reply: `Comparing ${a.name} and ${b.name}${days ? ` over ${days} days` : ''}.` };
    },
  },
  {
    name: 'add_to_compare',
    pattern: /^add (.+?) to (?:the )?compar(?:e|ison)$/i,
    build(m, sites) {
      const site = siteByName(sites, m[1]);
      return site ? { actions: [{ type: 'add_to_compare', id: site.id }], reply: `Added ${site.name} to the comparison.` } : notFound(m[1]);
    },
  },
  {
    name: 'best_window',
    pattern: /^(?:find |show |show me |give me |what is |what's )?(?:the )?best (\d+)[- ]?day window\b(.*)$/i,
    build(m) {
      const days = parseDays(m[1]);
      if (!days) return null;
      const scope = /compar/i.test(m[2]) ? 'compare' : 'site';
      return {
        actions: [{ type: 'find_best_window', days, scope }],
        reply: `Scanning the next year for the best ${days}-day window${scope === 'compare' ? ' across the compared sites' : ''}.`,
      };
    },
  },
  {
    name: 'start_on',
    pattern: /^(?:start|begin) (?:on |at |from )?(.+?)(?: for (\d+)[- ]?days?)?$/i,
    build(m) {
      const startUtc = parseDate(m[1]);
      if (!startUtc) return null;
      const days = parseDays(m[2]);
      if (m[2] !== undefined && !days) return null;
      const action: Action = days ? { type: 'set_window', startUtc, days } : { type: 'set_window', startUtc };
      return { actions: [action], reply: `Window moved to ${startUtc.slice(0, 10)}${days ? ` for ${days} days` : ''}.` };
    },
  },
  {
    name: 'load',
    pattern: /^set (?:the )?load to (\d+(?:\.\d+)?) ?w(?:atts?)?$/i,
    build(m) {
      const loadW = Number(m[1]);
      return { actions: [{ type: 'set_power', patch: { loadW } }], reply: `Load set to ${loadW} W.` };
    },
  },
  {
    name: 'battery',
    pattern: /^set (?:the )?battery to (\d+(?:\.\d+)?) ?wh$/i,
    build(m) {
      const batteryWh = Number(m[1]);
      return { actions: [{ type: 'set_power', patch: { batteryWh } }], reply: `Battery set to ${batteryWh} Wh.` };
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
      const mastM = Number(m[1]);
      return { actions: [{ type: 'set_params', patch: { mastM } }], reply: `Mast set to ${mastM} m; the skyline is recomputed from that height.` };
    },
  },
  {
    name: 'audience',
    pattern: /^switch to (learn|planner)(?: mode| view)?$/i,
    build(m) {
      const audience = m[1].toLowerCase() as 'learn' | 'planner';
      return { actions: [{ type: 'set_audience', audience }], reply: audience === 'learn' ? 'Switched to Learn mode.' : 'Switched to the planner view.' };
    },
  },
  {
    name: 'open_page',
    pattern: /^open (?:the )?(explore|compare|validate|brief|learn)(?: page| view)?$/i,
    build(m) {
      const page = m[1].toLowerCase() as Page;
      return { actions: [{ type: 'open_page', page }], reply: `Opening ${page}.` };
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

/** Deterministic answer for a rehearsed phrasing, or null when the prompt is for the model (or the cache). */
export function matchIntent(prompt: string, sites: Site[]): { actions: Action[]; reply: string } | null {
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
    if (r) return r;
  }
  return null;
}
