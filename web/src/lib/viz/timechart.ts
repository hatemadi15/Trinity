import { maskAtAzimuth } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { dateLong, spanWords } from './format';

/** Height of the hills in the direction a body is in, hour by hour (degrees). */
export function hillsToward(mask: ArrayLike<number>, az: ArrayLike<number>): Float64Array {
  const out = new Float64Array(az.length);
  for (let h = 0; h < az.length; h++) out[h] = maskAtAzimuth(mask, az[h]);
  return out;
}

/** Maximal runs of hours that pass a test, as half-open hour ranges. */
export function runsWhere(length: number, test: (hour: number) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let from = -1;
  for (let h = 0; h <= length; h++) {
    const yes = h < length && test(h);
    if (yes && from < 0) from = h;
    if (!yes && from >= 0) {
      out.push({ from, to: h });
      from = -1;
    }
  }
  return out;
}

/** The stretches with any sunlight. */
export function litRuns(sunFraction: ArrayLike<number>): { from: number; to: number }[] {
  return runsWhere(sunFraction.length, (h) => sunFraction[h] > 0);
}

/** The stretches without power. */
export function offRuns(powered: ArrayLike<number>): { from: number; to: number }[] {
  return runsWhere(powered.length, (h) => powered[h] === 0);
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * The battery charge as a closed shape `width` by `height`: one step per hour, full at the top and
 * empty at the bottom. Empty string for a lander without a battery.
 */
export function chargeArea(energyWh: ArrayLike<number>, capWh: number, width: number, height: number): string {
  const n = energyWh.length;
  if (capWh <= 0 || n === 0) return '';
  let d = `M0 ${f1(height)}`;
  for (let h = 0; h < n; h++) {
    const y = f1(height * (1 - Math.min(1, Math.max(0, energyWh[h] / capWh))));
    d += `L${f1((h / n) * width)} ${y}L${f1(((h + 1) / n) * width)} ${y}`;
  }
  return `${d}L${f1(width)} ${f1(height)}Z`;
}

/** The hour under a pointer `x` pixels into a plot `width` pixels wide, clamped to the period. */
export function hourAt(x: number, width: number, hours: number): number {
  if (!(width > 0)) return 0;
  return Math.max(0, Math.min(hours - 1, Math.floor((x / width) * hours)));
}

/** One sentence for the battery row: when the battery first runs out and how long the lander is off. */
/**
 * The days from the start that the chart's date row names: every 10 days over more than 45, every 5 down to 11,
 * every other day down to 5 and every day below, so a week's chart has dates and a long one does not crowd them.
 */
export function dayTicks(days: number): number[] {
  const every = days > 45 ? 10 : days > 10 ? 5 : days > 4 ? 2 : 1;
  return Array.from({ length: Math.floor((days - 1) / every) + 1 }, (_, k) => k * every);
}

export function batteryWords(power: PowerResult, startUtc: string, days: number): string {
  if (power.firstBrownoutHour === null) return `The battery never runs out in these ${days} days.`;
  return `The battery first runs out on ${dateLong(startUtc, power.firstBrownoutHour)} and the lander is off for ${spanWords(power.brownoutHours)} of these ${days} days.`;
}
