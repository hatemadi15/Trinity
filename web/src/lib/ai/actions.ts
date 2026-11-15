import type { StoreApi } from 'zustand';
import { PANEL_LABELS, type PanelModel, type PowerConfig } from '../engine/power';
import { clampTo, DAYS_RANGE, PANEL_MODELS, PARAM_RANGES, POWER_RANGES } from '../planner-ranges';
import type { ExploreState, SiteOverview, WindowDays } from '../store/explore';
import { EPHEMERIS_YEARS, landingWords, periodDays, shiftPeriod, shiftWords, snapToHour, startWords, withClock } from '../period';
import { slipLabel } from '../scenario/scenario';
import type { ScenarioState } from '../store/scenarios';
import { KNOWN_CATEGORIES, validateSpecPatch } from '../plan/fields';
import type { SpecPatch } from '../plan/spec';
import { explanationFor } from './explanations';
import { landerLine } from '../lander';
import { spanWords } from '../viz/format';
import { siteLabel } from '../data/loaders';
import { nameableSites, rankSites } from './site-rank';

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
  | { type: 'explain'; topic: string }
  /** Compares the landing shown with the same one moved by whole hours, later when positive: a baseline and the moved landing on Compare. */
  | { type: 'compare_shift'; hours: number }
  /** A new comparison of these catalogue sites, after the site shown when `shown`, with Explore's dates and lander: it opens Compare. */
  | { type: 'compare_sites'; ids: string[]; shown?: boolean }
  /** The site shown against the whole catalogue: ranked as the site list ranks it, the best three others beside it on Compare. */
  | { type: 'compare_best' }
  | { type: 'plan_mission'; spec: SpecPatch };

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
  'compare_shift',
  'compare_sites',
  'compare_best',
  'plan_mission',
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
/** The longest move of a landing the assistant compares, either way: the table's span. */
const COMPARE_SHIFT_MAX_H = 13 * 366 * 24;
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
    case 'plan_mission': {
      // The planner's specification: fields only, checked here; the numbers are checked against the words when taken.
      const { patch, dropped } = validateSpecPatch(raw.spec, siteIds, KNOWN_CATEGORIES);
      if (Object.keys(patch).length === 0) return { reason: dropped[0] ?? 'plan_mission: nothing to fill' };
      return { action: { type: 'plan_mission', spec: patch } };
    }
    case 'compare_shift': {
      // Whole hours, either way, no further than the table's own span: a move past its ends stops there anyway.
      const hours = asNumber(raw.hours);
      if (hours === null || !Number.isInteger(hours) || hours === 0 || Math.abs(hours) > COMPARE_SHIFT_MAX_H) return { reason: `compare_shift: hours must be a whole number other than 0 (got ${String(raw.hours)})` };
      return { action: { type: 'compare_shift', hours } };
    }
    case 'compare_sites': {
      // Catalogue ids only, each once; an unknown one drops the comparison, so the reply can name it.
      const shown = raw.shown === true || raw.shown === 'true';
      const ids: string[] = [];
      for (const x of Array.isArray(raw.ids) ? raw.ids : []) {
        const id = typeof x === 'string' ? x.trim() : '';
        if (!id) continue;
        if (!siteIds.has(id)) return { reason: `compare_sites: unknown site "${id}"` };
        if (!ids.includes(id)) ids.push(id);
      }
      if (ids.length < (shown ? 1 : 2)) return { reason: 'compare_sites: needs two sites, or the site shown and one more' };
      return { action: { type: 'compare_sites', ids: ids.slice(0, COMPARE_LIMIT - (shown ? 1 : 0)), ...(shown ? { shown: true } : {}) } };
    }
    case 'compare_best':
      return { action: { type: 'compare_best' } };
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

// ---- site matching: in ./site-match, re-exported here for the actions' existing importers ----
export { siteByName, tokens } from './site-match';

// ---- comparing sites ------------------------------------------------------------------------

/** "A", "A and B", "A, B and C". */
function listWords(words: string[]): string {
  return words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A count in words up to ten, in figures above it. */
const countWords = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** The dates and the lander the figures are for, as the site list states them: "14 days from 1 January 2027 and this lander (…)". */
function settingsWords(s: ExploreState): string {
  return `${s.days} days from ${landingWords(s.startUtc, true)} and this lander (${landerLine(s.params.power)}, ${s.params.mastM} m mast)`;
}

/** A site's longest time with power from its best landing day, as the site list says it. */
function poweredWords(o: SiteOverview | undefined, days: number): string {
  if (!o?.best) return 'no power from the Sun';
  return o.best.poweredHours >= days * 24 ? `all ${days} days` : spanWords(o.best.poweredHours);
}

/**
 * A new comparison of these sites, in order (the first is the baseline the others are weighed against), each with
 * Explore's dates and lander; returns the sites the comparison held before that are no longer on it.
 */
async function freshComparison(store: StoreApi<ExploreState>, ids: string[], scenarios?: StoreApi<ScenarioState>): Promise<string[]> {
  const before = store.getState().compareIds.filter((id) => !ids.includes(id));
  // The scenarios follow Explore's list; a comparison started another way (a slipped landing) goes too.
  scenarios?.getState().clear();
  for (const id of [...store.getState().compareIds]) store.getState().removeFromCompare(id);
  for (const id of ids.slice(0, COMPARE_LIMIT)) await store.getState().addToCompare(id);
  return before;
}

/** What Compare now holds, for which dates and lander, and what could not join it or came off it. */
function comparedNote(store: StoreApi<ExploreState>, ids: string[], before: string[]): string {
  const s = store.getState();
  const name = (id: string) => {
    const site = s.sites.find((x) => x.id === id);
    return site ? siteLabel(site) : id;
  };
  const on = ids.filter((id) => s.compareIds.includes(id));
  const off = ids.filter((id) => !on.includes(id));
  const parts = [on.length > 0 ? `Compare: ${listWords(on.map(name))}, for ${settingsWords(s)}.` : 'Compare could not take these sites.'];
  if (off.length > 0) parts.push(`${listWords(off.map(name))} could not be worked out, so ${off.length > 1 ? 'they are' : 'it is'} not on it.`);
  if (before.length > 0) parts.push(`The sites compared before (${listWords(before.map(name))}) came off it.`);
  return parts.join(' ');
}

/** Compare A with B, or the site shown with others: a new comparison, then the page. */
async function compareSites(store: StoreApi<ExploreState>, a: { ids: string[]; shown?: boolean }, navigate: (page: string) => void, scenarios?: StoreApi<ScenarioState>): Promise<string> {
  const s = store.getState();
  const inCatalogue = (id: string) => s.sites.some((x) => x.id === id && x.category !== 'custom');
  const shown = a.shown ? s.siteId : null;
  if (a.shown && (!shown || !inCatalogue(shown))) return 'Compare takes the catalogue’s sites: choose one on Explore or the site list first, then ask again.';
  const ids = [...new Set([...(shown ? [shown] : []), ...a.ids])].filter(inCatalogue).slice(0, COMPARE_LIMIT);
  const here = s.sites.find((x) => x.id === shown);
  if (ids.length < 2) return here ? `${siteLabel(here)} is the site shown: name another site to compare it with.` : 'Name two sites to compare.';
  const before = await freshComparison(store, ids, scenarios);
  navigate('/compare');
  return comparedNote(store, ids, before);
}

/** Resolves once the site list's figures are worked out for the current dates and lander (at once when they are). */
async function overviewReady(store: StoreApi<ExploreState>): Promise<void> {
  await store.getState().loadOverview();
  // A run already on its way returns at once: wait for it to finish.
  if (!store.getState().overviewBusy) return;
  await new Promise<void>((resolve) => {
    const stop = store.subscribe((now) => {
      if (now.overviewBusy) return;
      stop();
      resolve();
    });
  });
}

/**
 * The site shown against every catalogue site, for the current dates and lander: the catalogue ranked as the site list
 * ranks it, the best three others put beside the site shown on Compare, and one or two sentences on what was found. A
 * site with incomplete terrain, or worked out from another mast height, is never named best (its figures may be too high).
 */
async function compareBest(store: StoreApi<ExploreState>, navigate: (page: string) => void, scenarios?: StoreApi<ScenarioState>): Promise<string> {
  if (store.getState().status !== 'ready') return 'The figures are still loading: ask again in a moment.';
  await overviewReady(store);
  const s = store.getState();
  const o = s.overview;
  const worked = rankSites(s.sites, o).filter((x) => o[x.id]);
  const named = nameableSites(s.sites, o, s.params.mastM);
  const when = settingsWords(s);
  if (worked.length === 0) return `The sites’ figures could not be worked out for ${when}.`;
  if (named.length === 0) return `For ${when}, none of the ${worked.length} sites can be named best: none has both complete terrain and time with power from the Sun.`;
  const shown = s.site && s.site.category !== 'custom' ? s.site : null;
  const best = named[0];
  const others = named.filter((x) => x.id !== shown?.id).slice(0, COMPARE_LIMIT - 1);
  const ids = [...(shown ? [shown.id] : []), ...others.map((x) => x.id)];
  await freshComparison(store, ids, scenarios);
  navigate('/compare');
  const hoursOf = (id: string) => o[id]?.best?.poweredHours ?? -1;
  const power = poweredWords(o[best.id], s.days);
  // The list ranks on time with power, then sunlight, with the sites that see Earth first: the claim says only what holds.
  const rivals = worked.filter((x) => x.id !== best.id && hoursOf(x.id) >= hoursOf(best.id));
  // A tie on time with power (often the whole period) is broken by the list's further rules, which put this site first.
  const tied = rivals.length > 0 && rivals.every((x) => hoursOf(x.id) === hoursOf(best.id));
  const subject = best.id === shown?.id ? `the site shown, ${siteLabel(best)},` : siteLabel(best);
  const claim =
    rivals.length === 0
      ? `${subject} keeps power longest of the ${worked.length} sites: ${power} from its best landing day`
      : tied
        ? `${subject} ranks first of the ${worked.length} sites: it keeps power ${power} from its best landing day, as ${countWords(rivals.length)} other${rivals.length > 1 ? 's do' : ' does'}, and comes first of them on the site list`
        : `${subject} ranks first of the ${worked.length} sites on the site list’s rules: ${power} with power from its best landing day`;
  const hereO = shown ? o[shown.id] : undefined;
  const here =
    shown && best.id !== shown.id && hereO
      ? ` (here: ${poweredWords(hereO, s.days)}${hereO.terrain?.quality === 'incomplete' ? ', from incomplete terrain, so it may be too high' : ''})`
      : '';
  const placed = others.filter((x) => store.getState().compareIds.includes(x.id)).length;
  const count = countWords(placed);
  const put =
    placed === 0
      ? 'No other site could be put on Compare.'
      : !shown
        ? `I've put the top ${count} on Compare; the point you chose is not in the catalogue, so it is not among them.`
        : best.id === shown.id
          ? `I've put the next ${count} beside it on Compare.`
          : `I've put the top ${count} beside yours on Compare.`;
  return `For ${when}, ${claim}${here}. ${put}`;
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
export async function applyActions(
  store: StoreApi<ExploreState>,
  actions: Action[],
  navigate: (page: string) => void,
  scenarios?: StoreApi<ScenarioState>,
  said?: string,
): Promise<string[]> {
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
      case 'compare_shift': {
        // The comparison is a page's store: a caller without it (the chat route, a test) gets the way to it instead.
        const site = s.sites.find((x) => x.id === s.siteId);
        const base = scenarios && site ? scenarios.getState().startFrom(s) : null;
        const moved = base ? scenarios!.getState().slip(base, a.hours) : null;
        if (!site || !moved) {
          notes.push('A comparison can be made on Compare: open it and slip the landing there.');
          break;
        }
        navigate('/compare');
        notes.push(`Comparing the landing at ${site.label ?? site.name} on ${startWords(s.startUtc)} with the same landing ${slipLabel(a.hours)}.`);
        break;
      }
      case 'compare_sites':
        notes.push(await compareSites(store, a, navigate, scenarios));
        break;
      case 'compare_best':
        notes.push(await compareBest(store, navigate, scenarios));
        break;
      case 'explain': {
        const e = explanationFor(a.topic);
        notes.push(e ? e.text : `There is no explanation for "${a.topic}" yet; try the longest night, the Earth gap, the best landing date, the hills or the time with power.`);
        break;
      }
      case 'plan_mission': {
        // Loaded here, as only a mission's specification needs the planner.
        const { planStore } = await import('../plan/store');
        const taken = planStore.getState().takeAssistant(a.spec, said ?? '');
        navigate('/plan');
        notes.push(taken.fields.length ? 'Opened the planner with the fields read from your words: check them, then search.' : 'Opened the planner: no field could be taken from the words, so set them there.');
        break;
      }
    }
  }
  return notes;
}

/** The actions whose note is the answer: the app knows what Compare took and how the sites rank; a phrasing or the model cannot. */
const REPORTED = new Set<Action['type']>(['compare_sites', 'compare_best']);

/**
 * What the visitor reads (and Luna says) for an answer once its actions ran: the note of a comparison in place of the
 * reply given before it ran, the other notes after it; else the reply and the notes as they are. `notes` has one entry per action.
 */
export function answerOf(actions: Action[], reply: string, notes: string[]): { reply: string; notes: string[] } {
  const i = actions.findIndex((a) => REPORTED.has(a.type));
  if (i < 0 || notes.length !== actions.length) return { reply, notes };
  return { reply: notes[i], notes: notes.filter((_, j) => j !== i) };
}
