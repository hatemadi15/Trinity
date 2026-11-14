import { DEFAULT_POWER, type PanelModel, type PowerConfig } from '../engine/power';
import { PANEL_MODELS, PARAM_RANGES, POWER_RANGES, type NumberRange } from '../planner-ranges';
import type { PlannerParams } from '../store/explore';

/**
 * The settings Explore starts with, which a link leaves out: Explore's DEFAULT_PARAMS, kept here so links.ts does not
 * pull the store into every page that writes a link (a test holds the two equal).
 */
export const LINK_DEFAULTS: PlannerParams = { power: DEFAULT_POWER, minEarthElDeg: 0, mastM: 2 };

type PowerNumber = Exclude<keyof PowerConfig, 'panel'>;
type ParamNumber = Exclude<keyof PlannerParams, 'power'>;

/**
 * The name each setting the figures depend on has in a link: every field of the power model, the mast the skyline is
 * seen from, and how far Earth must clear the hills to count as in view. A field added to the power model has no name
 * until it is given one here, and the type says so.
 */
export const SETTING_NAMES: Record<keyof PowerConfig | ParamNumber, string> = {
  panel: 'panel',
  panelAzimuthDeg: 'facing',
  areaM2: 'area',
  efficiency: 'efficiency',
  loadW: 'load',
  batteryWh: 'battery',
  initialSocFraction: 'charge',
  mastM: 'mast',
  minEarthElDeg: 'earthmin',
};

/** The numbers in the order a link writes them, the lander's first; the panel's kind goes before them all. */
const POWER_NUMBERS: PowerNumber[] = ['panelAzimuthDeg', 'areaM2', 'efficiency', 'loadW', 'batteryWh', 'initialSocFraction'];
const PARAM_NUMBERS: ParamNumber[] = ['mastM', 'minEarthElDeg'];

/**
 * A number as a link writes it: as JavaScript writes it, the shortest form that reads back as the same number, so a
 * typed 33.3 % efficiency (0.33299999999999996) comes back exactly and the figures with it. Fractions stay fractions,
 * as the store keeps them: a percentage would round on the way.
 */
const write = (v: number) => String(v);

/** The settings that differ from the defaults, as a link's names and values. */
export function settingsEntries(params: PlannerParams, defaults: PlannerParams = LINK_DEFAULTS): [string, string][] {
  const out: [string, string][] = [];
  if (params.power.panel !== defaults.power.panel) out.push([SETTING_NAMES.panel, params.power.panel]);
  for (const key of POWER_NUMBERS) if (params.power[key] !== defaults.power[key]) out.push([SETTING_NAMES[key], write(params.power[key])]);
  for (const key of PARAM_NUMBERS) if (params[key] !== defaults[key]) out.push([SETTING_NAMES[key], write(params[key])]);
  return out;
}

/**
 * The address with the settings that differ from the defaults after its own parameters: Explore's, the view from the
 * site's or the brief's, so the page it opens works the figures out from the same lander, mast and radio threshold.
 */
export function withSettings(href: string, params: PlannerParams): string {
  const entries = settingsEntries(params);
  if (entries.length === 0) return href;
  const hash = href.indexOf('#');
  const [path, tail] = hash < 0 ? [href, ''] : [href.slice(0, hash), href.slice(hash)];
  const query = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${path}${path.includes('?') ? '&' : '?'}${query}${tail}`;
}

/** What a link's settings ask for: a patch over the settings Explore has. */
export interface SettingsPatch {
  power?: Partial<PowerConfig>;
  mastM?: number;
  minEarthElDeg?: number;
}

/** A plain decimal number, as `write` gives it; hexadecimal, Infinity and an empty value are not. */
const NUMBER = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

function readNumber(raw: string | null, range: NumberRange): number | null {
  if (raw === null || !NUMBER.test(raw.trim())) return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= range.min && v <= range.max ? v : null;
}

/**
 * Reads the settings a link names. A value the lander dialog could not set (malformed, or outside its range) is left
 * out rather than reported, as parseExploreQuery leaves out a bad date, and the setting keeps the value it has.
 */
export function parseSettings(search: string | URLSearchParams): SettingsPatch {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: SettingsPatch = {};
  const power: Partial<PowerConfig> = {};
  const panel = q.get(SETTING_NAMES.panel);
  if (panel !== null && (PANEL_MODELS as readonly string[]).includes(panel)) power.panel = panel as PanelModel;
  for (const key of POWER_NUMBERS) {
    const v = readNumber(q.get(SETTING_NAMES[key]), POWER_RANGES[key]);
    if (v !== null) power[key] = v;
  }
  for (const key of PARAM_NUMBERS) {
    const v = readNumber(q.get(SETTING_NAMES[key]), PARAM_RANGES[key]);
    if (v !== null) out[key] = v;
  }
  if (Object.keys(power).length > 0) out.power = power;
  return out;
}

/** The settings a link asks for over the current ones: what it does not name stays as it is. */
export function mergeSettings(params: PlannerParams, patch: SettingsPatch): PlannerParams {
  const { power, ...rest } = patch;
  return { ...params, ...rest, power: { ...params.power, ...power } };
}

/** Whether two sets of settings give the same figures: the same value for every setting a link carries. */
export function sameSettings(a: PlannerParams, b: PlannerParams): boolean {
  return settingsEntries(a, b).length === 0;
}

/**
 * An address's query with the settings it names replaced by `params`' (those that differ from the defaults), every other
 * parameter kept as it was and where it was: for a page whose address carries more than a link builder writes (the view
 * from the site's hour and drawing switches), so only its settings follow a change of lander.
 */
export function replaceSettings(search: string, params: PlannerParams): string {
  const names = new Set(Object.values(SETTING_NAMES));
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const kept = raw === '' ? [] : raw.split('&').filter((part) => part !== '' && !names.has(decodeURIComponent(part.split('=')[0])));
  const added = settingsEntries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  const all = [...kept, ...added];
  return all.length === 0 ? '' : `?${all.join('&')}`;
}
