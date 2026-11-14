import type { PowerConfig } from '../engine/power';
import type { PlannerParams } from '../store/explore';
import { spanWords } from '../viz/format';
import { shiftPeriod, snapToHour } from './period';

/**
 * How a scenario's landing time was chosen: `set` by the planner (or a slip of a time they set), or `site-best`, the
 * site's own best landing time found by a search. A comparison says which, so a same-day comparison and a comparison of
 * each site at its own best time are never mixed silently.
 */
export type Timing = 'set' | 'site-best';

/** Every setting that changes a result, with a label: one column of a comparison. */
export interface Scenario {
  id: string;
  label: string;
  /** A catalogue id, or a clicked point's id (`custom_-88.2800_-64.3100`). */
  siteId: string;
  /** The landing, UTC, on a whole hour: "2027-01-06T00:00:00". */
  startUtc: string;
  /** The period's length in whole days. */
  days: number;
  power: PowerConfig;
  /** The mast height shared by the panel and the antenna: the skyline is traced from it (m). */
  mastM: number;
  /** The lowest height of Earth above the hills that counts as in view (degrees). */
  minEarthElDeg: number;
  timing: Timing;
  /** The scenario this one was made from, for the reasons ("than the five-day delay"). */
  from?: string;
}

/** A scenario made by a slip, with the sentence that says where the slip stopped when it hit an end of the table. */
export type Slipped = Scenario & { note?: string };

/** The settings of Explore's store that a baseline takes. */
export interface ExploreSettings {
  siteId: string;
  startUtc: string;
  days: number;
  params: PlannerParams;
}

/** What the result of a scenario is computed from. */
export function paramsOf(s: Scenario): PlannerParams {
  return { power: s.power, mastM: s.mastM, minEarthElDeg: s.minEarthElDeg };
}

/** Explore's settings as the baseline of a comparison: the landing it shows, named the original landing. */
export function baselineFrom(e: ExploreSettings, id: string, label = 'Original landing'): Scenario {
  return {
    id,
    label,
    siteId: e.siteId,
    startUtc: snapToHour(e.startUtc),
    days: e.days,
    power: e.params.power,
    mastM: e.params.mastM,
    minEarthElDeg: e.params.minEarthElDeg,
    timing: 'set',
  };
}

/** A slip in words: "5 days later", "6 hours earlier", "1 day 6 hours later". */
export function slipLabel(hours: number): string {
  return `${spanWords(Math.abs(hours))} ${hours < 0 ? 'earlier' : 'later'}`;
}

/** A copy of a scenario with the landing moved by `hours` (later when positive); everything else is kept. */
export function slipOf(s: Scenario, hours: number, id: string): Slipped {
  const moved = shiftPeriod(s.startUtc, s.days, hours);
  const out: Slipped = { ...s, id, startUtc: moved.startUtc, label: slipLabel(hours), from: s.id, timing: 'set' };
  if (moved.note) out.note = moved.note;
  return out;
}

/** A copy of a scenario to change, made from it. */
export function duplicateOf(s: Scenario, id: string): Scenario {
  return { ...s, id, label: `Copy of ${s.label}`, from: s.id };
}

/** The settings alone, as a string: a result computed for one key holds for every scenario with that key. */
export function scenarioKey(s: Scenario): string {
  const p = s.power;
  return [s.siteId, s.startUtc, s.days, p.panel, p.panelAzimuthDeg, p.areaM2, p.efficiency, p.loadW, p.batteryWh, p.initialSocFraction, s.mastM, s.minEarthElDeg].join('|');
}

/** Whether every scenario lands at the same hour. */
export function sameLanding(list: Scenario[]): boolean {
  return list.every((s) => s.startUtc === list[0]?.startUtc);
}
