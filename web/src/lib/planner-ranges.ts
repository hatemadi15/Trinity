import type { PanelModel, PowerConfig } from './engine/power';

export interface NumberRange {
  min: number;
  max: number;
  step: number;
}

export const PANEL_MODELS: readonly PanelModel[] = ['horizontal', 'vertical', 'vertical_tracking', 'full_tracking'];

/**
 * Ranges for the numeric power fields, shared by the planner panel and the action validator so a
 * typed value and a model-proposed value are bounded the same way. Fractions stay fractions here
 * (efficiency 0.30 = 30 %); the panel scales them to percent for display.
 */
export const POWER_RANGES: Record<Exclude<keyof PowerConfig, 'panel'>, NumberRange> = {
  panelAzimuthDeg: { min: 0, max: 360, step: 5 },
  areaM2: { min: 0.5, max: 50, step: 0.5 },
  efficiency: { min: 0.05, max: 0.45, step: 0.01 },
  loadW: { min: 10, max: 2000, step: 10 },
  batteryWh: { min: 100, max: 50000, step: 100 },
  initialSocFraction: { min: 0, max: 1, step: 0.05 },
};

export const PARAM_RANGES: Record<'minEarthElDeg' | 'mastM', NumberRange> = {
  minEarthElDeg: { min: 0, max: 10, step: 0.5 },
  mastM: { min: 0, max: 10, step: 1 },
};

/**
 * The period's length in whole days, for the period controls, links and the assistant alike. At most 90: the
 * figures are worked out hour by hour, and the cost grows with the length (the site list works out every site for
 * up to twice the period, the 12-month search a year and a period at each site), so 90 days is the longest the app
 * is timed at. At least 2: every sentence of a forecast counts its days and nights in the plural ("these 7 days");
 * a shorter stay is one stretch of the time bar, which shows any hour of any period.
 */
export const DAYS_RANGE: NumberRange = { min: 2, max: 90, step: 1 };

export function clampTo(range: NumberRange, value: number): number {
  return Math.min(range.max, Math.max(range.min, value));
}

/** The same range in percent, for the panel's efficiency and state-of-charge inputs. */
export function percentRange(r: NumberRange): NumberRange {
  const pct = (x: number) => Math.round(x * 100 * 1e6) / 1e6;
  return { min: pct(r.min), max: pct(r.max), step: pct(r.step) };
}
