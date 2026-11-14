import { siteLabel, type Site } from '../data/loaders';
import type { PowerConfig } from '../engine/power';
import { checkScenario, comparisonHref, panelCode, SCENARIO_MAX, startCode, timingCode, unreadWords, withIds } from './codec';
import type { Outcome } from './outcome';
import type { Scenario, Timing } from './scenario';
import { APP, type DataVersions } from './versions';

/**
 * A scenario file: one scenario or a whole comparison as JSON, to keep, send and open again. It holds every setting,
 * the app's and the data's versions, the comparison's link, and the figures each scenario gave when it was saved, so
 * whoever opens it can see that the figures they get are the same ones.
 */
export const FILE_FORMAT = 'earthrise-scenarios';
export const FILE_VERSION = 1;

/** The figures a file keeps for checking, rounded as the page shows them. */
export interface FileFigures {
  timeWithPowerHours: number;
  sunlightPercent: number;
  earthInViewPercent: number;
  earthInViewWithPowerHours: number;
  longestTimeWithoutEarthHours: number;
  longestNightHours: number;
}

export interface FileScenario {
  label: string;
  baseline: boolean;
  site: { id: string; name: string; lat: number; lon: number; approximate?: boolean };
  /** The landing in UTC, on a whole hour. */
  landingUtc: string;
  days: number;
  lander: PowerConfig;
  mastM: number;
  minEarthElevationDeg: number;
  /** "set" by the planner, or "site-best": the site's own best time in its period. */
  landingTime: Timing;
  /** The position of the scenario this one was made from, or null. */
  madeFrom: number | null;
  /** The figures at export; null when they were still being worked out. */
  figures: FileFigures | null;
}

export interface ScenarioFile {
  format: typeof FILE_FORMAT;
  version: typeof FILE_VERSION;
  app: typeof APP;
  data: DataVersions;
  exportedUtc: string;
  /** The comparison's address on Compare, from the site's root. */
  link: string;
  scenarios: FileScenario[];
}

export interface FileColumn {
  scenario: Scenario;
  site: Site;
  outcome: Outcome | null;
}

export function figuresOf(o: Outcome): FileFigures {
  return {
    timeWithPowerHours: o.poweredH,
    sunlightPercent: Math.round(o.sunFraction * 100),
    earthInViewPercent: Math.round(o.earthFraction * 100),
    earthInViewWithPowerHours: o.poweredContactH,
    longestTimeWithoutEarthHours: o.outage?.hours ?? 0,
    longestNightHours: o.longestNightH,
  };
}

export function scenarioFile(cols: FileColumn[], data: DataVersions, now = new Date()): ScenarioFile {
  const kept = cols.slice(0, SCENARIO_MAX);
  const index = new Map(kept.map((c, i) => [c.scenario.id, i]));
  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    app: APP,
    data,
    exportedUtc: `${now.toISOString().slice(0, 19)}Z`,
    link: comparisonHref(kept.map((c) => c.scenario)),
    scenarios: kept.map(({ scenario: s, site, outcome }, i) => ({
      label: s.label,
      baseline: i === 0,
      site: { id: site.id, name: siteLabel(site), lat: site.lat, lon: site.lon, ...(site.approximate ? { approximate: true } : {}) },
      landingUtc: `${s.startUtc}Z`,
      days: s.days,
      lander: s.power,
      mastM: s.mastM,
      minEarthElevationDeg: s.minEarthElDeg,
      landingTime: s.timing,
      madeFrom: s.from !== undefined && index.has(s.from) ? index.get(s.from)! : null,
      figures: outcome ? figuresOf(outcome) : null,
    })),
  };
}

/** "earthrise-comparison-2026-11-14.json", or "earthrise-scenario-…" for one scenario. */
export function fileName(cols: unknown[], now = new Date()): string {
  return `earthrise-${cols.length === 1 ? 'scenario' : 'comparison'}-${now.toISOString().slice(0, 10)}.json`;
}

export interface ReadFile {
  scenarios: Scenario[];
  /** The figures each scenario read was saved with, by position among those read. */
  figures: (FileFigures | null)[];
  saved: { app: unknown; data: unknown; exportedUtc: unknown } | null;
  problem: string | null;
}

const NOT_OURS = 'This file is not a scenario file from Earthrise.';
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x: unknown) => (typeof x === 'number' || typeof x === 'string' ? String(x) : '');

/** A file's figures, when every one of them is a whole number. */
function figuresFrom(x: unknown): FileFigures | null {
  if (!isObj(x)) return null;
  const keys: (keyof FileFigures)[] = ['timeWithPowerHours', 'sunlightPercent', 'earthInViewPercent', 'earthInViewWithPowerHours', 'longestTimeWithoutEarthHours', 'longestNightHours'];
  return keys.every((k) => Number.isFinite(x[k])) ? (Object.fromEntries(keys.map((k) => [k, Number(x[k])])) as unknown as FileFigures) : null;
}

/** Reads a scenario file, checking every setting as a link's are checked; a scenario that fails is left out, and said to be. */
export function readScenarioFile(raw: string): ReadFile {
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { scenarios: [], figures: [], saved: null, problem: 'This file is not a scenario file from Earthrise: it is not JSON.' };
  }
  if (!isObj(doc) || doc.format !== FILE_FORMAT || !Array.isArray(doc.scenarios)) return { scenarios: [], figures: [], saved: null, problem: NOT_OURS };
  if (doc.version !== FILE_VERSION) {
    return { scenarios: [], figures: [], saved: null, problem: `This scenario file is version ${text(doc.version) || 'unknown'}, from a newer Earthrise: this one reads version ${FILE_VERSION}.` };
  }
  const list = doc.scenarios.slice(0, SCENARIO_MAX);
  const read = list.map((x, i) => {
    if (!isObj(x) || !isObj(x.site) || !isObj(x.lander)) return null;
    const p = x.lander;
    const landing = typeof x.landingUtc === 'string' ? x.landingUtc.replace(/Z$/, '') : '';
    const timing = x.landingTime === 'set' || x.landingTime === 'site-best' ? timingCode(x.landingTime) : '';
    const panel = typeof p.panel === 'string' && ['horizontal', 'vertical', 'vertical_tracking', 'full_tracking'].includes(p.panel) ? panelCode(p.panel as PowerConfig['panel']) : '';
    // Only a landing on a whole hour reads back: the app lands on whole hours.
    const start = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00$/.test(landing) ? startCode(landing) : '';
    const s = checkScenario(
      {
        site: text(x.site.id),
        start,
        days: text(x.days),
        panel,
        az: text(p.panelAzimuthDeg),
        area: text(p.areaM2),
        eff: text(p.efficiency),
        load: text(p.loadW),
        battery: text(p.batteryWh),
        soc: text(p.initialSocFraction),
        mast: text(x.mastM),
        minEl: text(x.minEarthElevationDeg),
        timing,
        label: typeof x.label === 'string' ? x.label : null,
      },
      i,
    );
    if (!s) return null;
    const fromIndex = Number.isInteger(x.madeFrom) && (x.madeFrom as number) < i ? (x.madeFrom as number) : null;
    return { ...s, fromIndex };
  });
  const figures = read.flatMap((r, i) => (r ? [figuresFrom((list[i] as Record<string, unknown>).figures)] : []));
  return { scenarios: withIds(read), figures, saved: { app: doc.app, data: doc.data, exportedUtc: doc.exportedUtc }, problem: unreadWords(read.filter((r) => r === null).length, 'this file') };
}

/** How the figures worked out now differ from the file's, figure by figure, in words; empty when they agree. */
export function figureDifferences(file: FileFigures, now: FileFigures): string[] {
  const names: Record<keyof FileFigures, string> = {
    timeWithPowerHours: 'time with power (hours)',
    sunlightPercent: 'sunlight (%)',
    earthInViewPercent: 'Earth in view (%)',
    earthInViewWithPowerHours: 'Earth in view with power (hours)',
    longestTimeWithoutEarthHours: 'longest time without Earth (hours)',
    longestNightHours: 'longest night (hours)',
  };
  return (Object.keys(names) as (keyof FileFigures)[]).filter((k) => file[k] !== now[k]).map((k) => `${names[k]}: ${file[k]} in the file, ${now[k]} now`);
}
