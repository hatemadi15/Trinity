import { normalizeUtc } from '../ai/actions';
import type { Site } from '../data/loaders';
import { timeWithPower } from '../engine/landing';
import { PANEL_MODELS, PARAM_RANGES, POWER_RANGES } from '../planner-ranges';
import type { ExploreState, PlannerParams, SiteResult, WindowDays } from '../store/explore';
import { DEFAULT_PREFERENCES, validPreferences, type MissionPreferences } from './mission';

export interface Scenario {
  id: string;
  label: string;
  site: Site;
  startUtc: string;
  days: WindowDays;
  params: PlannerParams;
}

export interface ScenarioRequirements {
  requiredHours: number;
  minContactHours: number;
  maxGapHours: number;
}

export interface SharedPlan {
  version: 1;
  scenarios: Scenario[];
  requirements: ScenarioRequirements;
  preferences: MissionPreferences;
}

export const MAX_SCENARIOS = 6;
export const DEFAULT_REQUIREMENTS: ScenarioRequirements = { requiredHours: 336, minContactHours: 1, maxGapHours: 72 };
const MAX_PAYLOAD = 24000;
let sequence = 0;

/** Copies every assumption: later edits to Explore cannot silently change a pinned plan. */
export function snapshotScenario(state: Pick<ExploreState, 'site' | 'startUtc' | 'days' | 'params'>, label = 'Current plan'): Scenario {
  if (!state.site) throw new Error('Select a landing site before saving a scenario.');
  return {
    id: `scenario_${Date.now().toString(36)}_${++sequence}`,
    label,
    site: { ...state.site },
    startUtc: state.startUtc,
    days: state.days,
    params: { ...state.params, power: { ...state.params.power } },
  };
}

/** Contact is counted only before the first power loss; recovery is not a survival prediction. */
export function scenarioMetrics(result: Pick<SiteResult, 'power' | 'series' | 'summary'>) {
  const poweredHours = Math.min(result.series.hours, timeWithPower(result.power));
  let contactHours = 0;
  for (let h = 0; h < poweredHours; h++) contactHours += result.series.earthVisible[h] === 1 ? 1 : 0;
  return { poweredHours, contactHours, longestEarthGapHours: result.summary.longestEarthGapH };
}

/** The gap requirement covers the whole requested window, including leading/trailing gaps. */
export function assessRequirements(result: Pick<SiteResult, 'power' | 'series' | 'summary'>, requirements: ScenarioRequirements) {
  const metrics = scenarioMetrics(result);
  const reasons: string[] = [];
  if (metrics.poweredHours < requirements.requiredHours) reasons.push(`Needs ${requirements.requiredHours} continuous powered hours; model gives ${metrics.poweredHours}.`);
  if (metrics.contactHours < requirements.minContactHours) reasons.push(`Needs ${requirements.minContactHours} hours powered with Earth in view; model gives ${metrics.contactHours}.`);
  if (metrics.longestEarthGapHours > requirements.maxGapHours) reasons.push(`Earth is hidden for up to ${metrics.longestEarthGapHours} hours; limit is ${requirements.maxGapHours}.`);
  return { passes: reasons.length === 0, reasons };
}

type Raw = Record<string, unknown>;
const object = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x);
const numberIn = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
const text = (x: unknown, max: number): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;

/** Rejects invalid imported settings instead of silently changing the assumptions in a shared result. */
export function validateScenario(input: unknown): Scenario | null {
  if (!object(input) || !text(input.id, 100) || !text(input.label, 120) || !object(input.site) || !object(input.params) || !object(input.params.power)) return null;
  const { site, params } = input;
  const power = params.power as Raw;
  if (!text(site.id, 100) || !/^[a-z0-9_.-]+$/.test(site.id) || !text(site.name, 200) || !text(site.category, 80) || !text(site.source, 300)) return null;
  if (!numberIn(site.lat, -90, 90) || !numberIn(site.lon, -180, 180) || typeof site.polar !== 'boolean') return null;
  if (site.category === 'custom' && (!site.polar || site.lat > -60)) return null;
  if (site.label !== undefined && !text(site.label, 200)) return null;
  if (site.approximate !== undefined && typeof site.approximate !== 'boolean') return null;
  const startUtc = normalizeUtc(input.startUtc);
  if (!startUtc || ![14, 30, 90].includes(input.days as number) || !startUtc.endsWith(':00:00')) return null;
  const startMs = Date.parse(`${startUtc}Z`);
  // Keep interpolation guard rows at either end of the published ephemeris.
  if (startMs < Date.UTC(2024, 0, 2) || startMs + (input.days as number) * 86400000 > Date.UTC(2036, 11, 31, 20)) return null;
  for (const [key, range] of Object.entries(PARAM_RANGES)) if (!numberIn(params[key], range.min, range.max)) return null;
  for (const [key, range] of Object.entries(POWER_RANGES)) if (!numberIn(power[key], range.min, range.max)) return null;
  if (!(PANEL_MODELS as readonly unknown[]).includes(power.panel)) return null;
  // Build a fresh whitelisted object, including only metadata the UI actually needs.
  return {
    id: input.id, label: input.label, startUtc, days: input.days as WindowDays,
    site: { id: site.id, name: site.name, lat: site.lat, lon: site.lon, polar: site.polar, category: site.category, source: site.source,
      ...(typeof site.label === 'string' ? { label: site.label } : {}), ...(typeof site.approximate === 'boolean' ? { approximate: site.approximate } : {}) },
    params: { minEarthElDeg: params.minEarthElDeg as number, mastM: params.mastM as number,
      power: Object.fromEntries(['panel', ...Object.keys(POWER_RANGES)].map((key) => [key, power[key]])) as unknown as PlannerParams['power'] },
  };
}

/** Serialized JSON is passed through URLSearchParams by callers (which performs URL encoding). */
export function serializePlan(scenarios: Scenario[], requirements: ScenarioRequirements = DEFAULT_REQUIREMENTS, preferences: MissionPreferences = DEFAULT_PREFERENCES): string {
  const encoded = JSON.stringify({ version: 1, scenarios, requirements, preferences });
  if (!parsePlan(encoded)) throw new Error('This plan contains invalid settings or exceeds the six-scenario limit.');
  return encoded;
}

export function parsePlan(encoded: string): SharedPlan | null {
  if (encoded.length > MAX_PAYLOAD) return null;
  try {
    const raw: unknown = JSON.parse(encoded);
    if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.scenarios) || raw.scenarios.length > MAX_SCENARIOS || !object(raw.requirements)) return null;
    const scenarios = raw.scenarios.map(validateScenario);
    if (scenarios.some((s) => s === null)) return null;
    if (new Set(scenarios.map((s) => s!.id)).size !== scenarios.length) return null;
    const { requiredHours, minContactHours, maxGapHours } = raw.requirements;
    if (![requiredHours, minContactHours, maxGapHours].every((n) => numberIn(n, 0, 2160) && Number.isInteger(n))) return null;
    const preferences = raw.preferences === undefined ? DEFAULT_PREFERENCES : raw.preferences;
    if (!validPreferences(preferences)) return null;
    return { version: 1, scenarios: scenarios as Scenario[], requirements: { requiredHours: requiredHours as number, minContactHours: minContactHours as number, maxGapHours: maxGapHours as number }, preferences: { power: preferences.power, contact: preferences.contact, gap: preferences.gap } };
  } catch { return null; }
}

export function scenarioHref(scenario: Scenario): string {
  return `/explore?${new URLSearchParams({ scenario: serializePlan([scenario]) })}`;
}
