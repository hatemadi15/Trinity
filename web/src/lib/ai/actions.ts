import type { StoreApi } from 'zustand';
import type { Site } from '../data/loaders';
import { PANEL_LABELS, type PanelModel, type PowerConfig } from '../engine/power';
import { clampTo, DAYS_RANGE, PANEL_MODELS, PARAM_RANGES, POWER_RANGES } from '../planner-ranges';
import type { ExploreState, WindowDays } from '../store/explore';
import { EPHEMERIS_YEARS, periodDays, shiftPeriod, shiftWords, snapToHour, startWords, withClock } from '../period';
import { explanationFor } from './explanations';

/** The closed set of things the planner may do to the app. Validated on the server and again on the client. */
export type Action =
  | { type: 'select_site'; id: string }
  /** `timeUtc` ("17:00") moves the landing to that hour on its date: the given start's, else the one already chosen. */
  | { type: 'set_window'; startUtc?: string; days?: WindowDays; timeUtc?: string }
  /** The landing moved by whole hours, later when positive, keeping the length; it stops at the ends of the table. */
  | { type: 'shift_window'; hours: number }
  | { type: 'find_best_window'; days: WindowDays; scope?: 'site' | 'compare' }
  | { type: 'set_power'; patch: Partial<PowerConfig> }
  | { type: 'set_params'; patch: { minEarthElDeg?: number; mastM?: number } }
  | { type: 'add_to_compare'; id: string }
  | { type: 'remove_from_compare'; id: string }
  | { type: 'open_page'; page: Page }
  | { type: 'explain'; topic: string };

export type Page = 'explore' | 'sites' | 'compare' | 'validate' | 'brief' | 'learn';
export const PAGES: readonly Page[] = ['explore', 'sites', 'compare', 'validate', 'brief', 'learn'];
export const ACTION_TYPES: readonly Action['type'][] = [
  'select_site',
  'set_window',
  'shift_window',
  'find_best_window',
  'set_power',
  'set_params',
  'add_to_compare',
  'remove_from_compare',
  'open_page',
  'explain',
];
/** What each page is called on screen. */
export const PAGE_NAMES: Record<Page, string> = { explore: 'Explore', sites: 'the site list', compare: 'Compare sites', validate: 'Accuracy', brief: 'the brief', learn: 'How it works' };

/** The period in the words of its controls ("From", "For"), the landing with its hour: "Period: from 1 March 2027, 17:00 UTC, for 14 days." */
export function periodNote(startUtc: string, days?: number): string {
  return `Period: from ${startWords(startUtc)}${days ? `, for ${days} days` : ''}.`;
}
/** The longest shift the assistant asks for, either way: the table's span, which a shift stops at anyway. */
const SHIFT_MAX_HOURS = 13 * 366 * 24;
/**
 * How many sites Compare holds: the store's COMPARE_MAX, repeated here because the chat route loads this
 * module on the server and must not load the browser store with it. A test keeps the two equal.
 */
export const COMPARE_LIMIT = 4;
/** The hourly ephemeris table spans these years; a window outside it cannot be computed. */
export { EPHEMERIS_YEARS };

type Raw = Record<string, unknown>;
type One = { action: Action } | { reason: string };

const isObj = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x);

function asNumber(x: unknown): number | null {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return null;
}

function parseDays(x: unknown): WindowDays | null {
  return periodDays(asNumber(x));
}
const BAD_DAYS = `days must be a whole number from ${DAYS_RANGE.min} to ${DAYS_RANGE.max}`;

/**
 * Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM` or `YYYY-MM-DDTHH:MM:SS` (optional Z) inside the ephemeris years; returns
 * the full form at the nearest whole hour, as the engine reads its hourly table (a date alone is 00:00 UTC).
 */
export function normalizeUtc(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const m = x.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?Z?$/);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  if (y < EPHEMERIS_YEARS.first || y > EPHEMERIS_YEARS.last) return null;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const same = t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === s;
  return same ? snapToHour(t.toISOString().slice(0, 19)) : null;
}

function siteAction(raw: Raw, type: 'select_site' | 'add_to_compare' | 'remove_from_compare', siteIds: ReadonlySet<string>): One {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return { reason: `${type}: missing site id` };
  if (!siteIds.has(id)) return { reason: `${type}: unknown site "${id}"` };
  return { action: { type, id } };
}

function powerPatch(raw: unknown): Partial<PowerConfig> {
  const patch: Partial<PowerConfig> = {};
  if (!isObj(raw)) return patch;
  for (const key of Object.keys(POWER_RANGES) as (keyof typeof POWER_RANGES)[]) {
    const n = asNumber(raw[key]);
    if (n !== null) patch[key] = clampTo(POWER_RANGES[key], n);
  }
  if (typeof raw.panel === 'string' && (PANEL_MODELS as readonly string[]).includes(raw.panel)) patch.panel = raw.panel as PanelModel;
  return patch;
}

function paramsPatch(raw: unknown): { minEarthElDeg?: number; mastM?: number } {
  const patch: { minEarthElDeg?: number; mastM?: number } = {};
  if (!isObj(raw)) return patch;
  for (const key of Object.keys(PARAM_RANGES) as (keyof typeof PARAM_RANGES)[]) {
    const n = asNumber(raw[key]);
    if (n !== null) patch[key] = clampTo(PARAM_RANGES[key], n);
  }
  return patch;
}

function validateOne(raw: unknown, siteIds: ReadonlySet<string>): One {
  if (!isObj(raw) || typeof raw.type !== 'string') return { reason: 'action without a type' };
  switch (raw.type) {
    case 'select_site':
    case 'add_to_compare':
    case 'remove_from_compare':
      return siteAction(raw, raw.type, siteIds);
    case 'set_window': {
      const action: Action = { type: 'set_window' };
      if (raw.startUtc !== undefined) {
        const startUtc = normalizeUtc(raw.startUtc);
        if (!startUtc) return { reason: `set_window: bad start date "${String(raw.startUtc)}"` };
        action.startUtc = startUtc;
      }
      if (raw.days !== undefined) {
        const days = parseDays(raw.days);
        if (!days) return { reason: `set_window: ${BAD_DAYS} (got ${String(raw.days)})` };
        action.days = days;
      }
      if (raw.timeUtc !== undefined) {
        const time = typeof raw.timeUtc === 'string' ? raw.timeUtc.trim() : '';
        if (!/^\d{2}:\d{2}$/.test(time) || !withClock('2027-01-01T00:00:00', time)) return { reason: `set_window: bad time "${String(raw.timeUtc)}"` };
        action.timeUtc = time;
      }
      if (action.startUtc === undefined && action.days === undefined && action.timeUtc === undefined) return { reason: 'set_window: nothing to set' };
      return { action };
    }
    case 'shift_window': {
      const hours = asNumber(raw.hours);
      if (hours === null || !Number.isInteger(hours) || hours === 0 || Math.abs(hours) > SHIFT_MAX_HOURS) return { reason: `shift_window: hours must be a whole number other than 0 (got ${String(raw.hours)})` };
      return { action: { type: 'shift_window', hours } };
    }
    case 'find_best_window': {
      const days = parseDays(raw.days);
      if (!days) return { reason: `find_best_window: ${BAD_DAYS} (got ${String(raw.days)})` };
      const scope = raw.scope === 'compare' ? 'compare' : 'site';
      return { action: { type: 'find_best_window', days, scope } };
    }
    case 'set_power': {
      const patch = powerPatch(raw.patch);
      if (Object.keys(patch).length === 0) return { reason: 'set_power: no known field in the patch' };
      return { action: { type: 'set_power', patch } };
    }
    case 'set_params': {
      const patch = paramsPatch(raw.patch);
      if (Object.keys(patch).length === 0) return { reason: 'set_params: no known field in the patch' };
      return { action: { type: 'set_params', patch } };
    }
    case 'open_page':
      return typeof raw.page === 'string' && (PAGES as readonly string[]).includes(raw.page)
        ? { action: { type: 'open_page', page: raw.page as Page } }
        : { reason: `open_page: unknown page "${String(raw.page)}"` };
    case 'explain': {
      const topic = typeof raw.topic === 'string' ? raw.topic.trim().slice(0, 80) : '';
      return topic ? { action: { type: 'explain', topic } } : { reason: 'explain: missing topic' };
    }
    default:
      return { reason: `unknown action "${raw.type}"` };
  }
}

/** Keeps the actions that fit the closed schema (fields coerced and clamped) and lists why the others were dropped. */
export function validateActions(input: unknown, siteIds: ReadonlySet<string>): { actions: Action[]; dropped: string[] } {
  if (!Array.isArray(input)) return { actions: [], dropped: ['actions is not a list'] };
  const actions: Action[] = [];
  const dropped: string[] = [];
  for (const raw of input) {
    const r = validateOne(raw, siteIds);
    if ('action' in r) actions.push(r.action);
    else dropped.push(r.reason);
  }
  return { actions, dropped };
}

/** Plain words for the validator's `dropped` list, appended to a reply the user reads. */
export function describeDropped(dropped: string[]): string {
  if (dropped.length === 0) return '';
  const unknown = dropped.map((d) => d.match(/unknown site "([^"]+)"/)?.[1]).filter((x): x is string => Boolean(x));
  if (unknown.length > 0) return `I could not find ${unknown.map((u) => `"${u}"`).join(' or ')} in the catalogue, so that step was skipped.`;
  return `One step was skipped (${dropped[0]}).`;
}

// ---- site matching ---------------------------------------------------------------------------

/** Words that appear in many catalogue names and count for half a match; connectives count for nothing. */
const GENERIC = new Set([
  'site', 'sites', 'region', 'landing', 'crater', 'rim', 'point', 'highest', 'artemis', 'iii', 'centre', 'center', 'reference', 'lunar',
  'south', 'pole', 'mission', 'km', 'ridge', 'plateau', 'peak', 'near', 'massif', 'plain', 'mare', 'high',
]);
const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'with', 'on', 'in', 'for', 'of', 'me', 'please', 'at', 'from']);

/** Lower-case ASCII tokens with accents and punctuation stripped and letter/digit boundaries split ("IM-2" → im, 2). */
export function tokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const weightOf = (t: string) => (STOP.has(t) ? 0 : GENERIC.has(t) ? 0.5 : 1);

/**
 * Finds the catalogue site a phrase refers to: an exact id, or the site sharing the most (weighted)
 * words with the phrase, needing at least one distinctive word or two generic ones. Ties go to the
 * site whose name is covered best by the phrase, so "Shackleton crater" picks the crater centre over
 * its rim.
 */
export function siteByName(sites: Site[], text: string): Site | null {
  const phrase = text.trim().toLowerCase();
  if (!phrase) return null;
  const exact = sites.find((s) => s.id === phrase);
  if (exact) return exact;
  const query = Array.from(new Set(tokens(phrase)));
  let best: { site: Site; score: number; coverage: number; size: number } | null = null;
  for (const site of sites) {
    const own = new Set([...tokens(site.name), ...tokens(site.id)]);
    const hits = query.filter((t) => own.has(t));
    // A digit alone ("show me 2") names nothing; it counts fully only next to a matched word.
    const hasWord = hits.some((t) => /[a-z]/.test(t) && weightOf(t) === 1);
    const score = hits.reduce((sum, t) => sum + (/^\d+$/.test(t) && !hasWord ? 0.25 : weightOf(t)), 0);
    const matched = hits.length;
    if (score < 1) continue;
    const coverage = matched / own.size;
    if (!best || score > best.score || (score === best.score && (coverage > best.coverage || (coverage === best.coverage && own.size < best.size)))) {
      best = { site, score, coverage, size: own.size };
    }
  }
  return best?.site ?? null;
}

// ---- applying actions to the store -----------------------------------------------------------

function describePower(patch: Partial<PowerConfig>): string {
  const parts: string[] = [];
  if (patch.panel) parts.push(PANEL_LABELS[patch.panel]);
  if (patch.panelAzimuthDeg !== undefined) parts.push(`panel azimuth ${patch.panelAzimuthDeg}°`);
  if (patch.areaM2 !== undefined) parts.push(`area ${patch.areaM2} m²`);
  if (patch.efficiency !== undefined) parts.push(`efficiency ${Math.round(patch.efficiency * 100)} %`);
  if (patch.loadW !== undefined) parts.push(`load ${patch.loadW} W`);
  if (patch.batteryWh !== undefined) parts.push(`battery ${patch.batteryWh} Wh`);
  if (patch.initialSocFraction !== undefined) parts.push(`battery at start ${Math.round(patch.initialSocFraction * 100)} %`);
  return parts.join(', ');
}

function describeParams(patch: { minEarthElDeg?: number; mastM?: number }): string {
  const parts: string[] = [];
  if (patch.mastM !== undefined) parts.push(`mast ${patch.mastM} m`);
  if (patch.minEarthElDeg !== undefined) parts.push(`Earth counted above ${patch.minEarthElDeg}°`);
  return parts.join(', ');
}

/**
 * Sets the period and says what was set, in the words of its controls, with `extra` after it. The store refuses a
 * period that runs off its Sun and Earth table, keeps the one it had and says why in its error: the note gives that
 * reason rather than claim a period that was never set.
 */
function setPeriod(store: StoreApi<ExploreState>, startUtc: string, days: number, extra = ''): string {
  store.getState().setWindow(startUtc, days);
  const now = store.getState();
  const refused = now.startUtc !== startUtc || now.days !== days;
  return refused ? (now.error ?? 'That period could not be set.') : `${periodNote(startUtc, days)}${extra}`;
}

/**
 * Applies validated actions to the Explore store in order and returns one note per action, in the
 * user's words ("Selected Nobile Rim 2."). Page changes go through `navigate` so the caller can use
 * the Next router.
 */
export async function applyActions(store: StoreApi<ExploreState>, actions: Action[], navigate: (page: string) => void): Promise<string[]> {
  const notes: string[] = [];
  const nameOf = (id: string) => store.getState().sites.find((s) => s.id === id)?.name ?? id;
  for (const a of actions) {
    const s = store.getState();
    switch (a.type) {
      case 'select_site': {
        const site = s.sites.find((x) => x.id === a.id);
        if (!site) {
          notes.push(`No site called "${a.id}" in the catalogue.`);
          break;
        }
        await s.selectSite(a.id);
        notes.push(`Selected ${site.name}.`);
        break;
      }
      case 'set_window': {
        // A time alone keeps the date; minutes round to the nearest hour, as the engine reads its hourly table.
        const timed = a.timeUtc ? withClock(a.startUtc ?? s.startUtc, a.timeUtc) : null;
        const startUtc = snapToHour(timed?.startUtc ?? a.startUtc ?? s.startUtc);
        const days = a.days ?? s.days;
        notes.push(setPeriod(store, startUtc, days, timed?.rounded ? ` The Sun and Earth table is hourly, so ${a.timeUtc} is read as ${startUtc.slice(11, 16)} UTC.` : ''));
        break;
      }
      case 'shift_window': {
        // The length stays; a shift past either end of the table stops there, and the note says so.
        const r = shiftPeriod(s.startUtc, s.days, a.hours);
        const moved = r.note ? ` ${r.note}` : '';
        const note = setPeriod(store, r.startUtc, s.days, moved);
        notes.push(note.startsWith('Period:') && !r.note ? `Landing ${shiftWords(a.hours)} ${a.hours > 0 ? 'later' : 'earlier'}. ${note}` : note);
        break;
      }
      case 'find_best_window': {
        const scope = a.scope ?? 'site';
        const r = await s.findBestWindow(a.days, scope);
        notes.push(r ? `Moved to the best landing for ${a.days} days: ${startWords(r.startUtc)}.` : (store.getState().bestWindowNote ?? `No ${a.days}-day period fits after the start date.`));
        break;
      }
      case 'set_power':
        s.setPower(a.patch);
        notes.push(`Power settings: ${describePower(a.patch)}.`);
        break;
      case 'set_params':
        s.setParams(a.patch);
        notes.push(`Lander settings: ${describeParams(a.patch)}.`);
        break;
      case 'add_to_compare': {
        const site = s.sites.find((x) => x.id === a.id);
        if (!site) {
          notes.push(`No site called "${a.id}" in the catalogue.`);
          break;
        }
        // The store refuses a fifth site without a word, so the note must not claim it was added.
        if (!s.compareIds.includes(a.id) && s.compareIds.length >= COMPARE_LIMIT) {
          notes.push(`Compare is full: four sites. Remove one to add ${site.name}.`);
          break;
        }
        await s.addToCompare(a.id);
        notes.push(`Added ${site.name} to the comparison.`);
        break;
      }
      case 'remove_from_compare':
        s.removeFromCompare(a.id);
        notes.push(`Removed ${nameOf(a.id)} from the comparison.`);
        break;
      case 'open_page':
        navigate(`/${a.page}`);
        notes.push(`Opened ${PAGE_NAMES[a.page]}.`);
        break;
      case 'explain': {
        const e = explanationFor(a.topic);
        notes.push(e ? e.text : `There is no explanation for "${a.topic}" yet; try the longest night, the Earth gap, the best landing date, the hills or the time with power.`);
        break;
      }
    }
  }
  return notes;
}
