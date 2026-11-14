import { indexForEt, type Ephemeris } from './ephemeris';
import { landingScores, YEAR_HOURS } from './landing';
import { hourlySeries, withCommsThreshold, type Series } from './metrics';
import type { PowerConfig } from './power';
import { utcToEt } from './time';

/** The landing days of the year a best-date search covers. */
export const YEAR_DAYS = YEAR_HOURS / 24;
/** Hours of the hourly series worked out between two pauses: two months, a few milliseconds even on a slow phone. */
export const SLICE_HOURS = 61 * 24;

/** What the year is worked out for: the site, its skyline, the first landing, the period's length and the lander. */
export interface YearInput {
  site: { lat: number; lon: number };
  mask: ArrayLike<number>;
  /** The first landing; every later day lands at the same time of day. */
  startUtc: string;
  /** The period's length in days. */
  days: number;
  power: PowerConfig;
  /** Earth counts as in view only this far above the skyline (degrees), as on Explore. */
  minEarthElDeg: number;
}

/**
 * Every landing day of the year from a start, each at the start's time of day, with what a period from it gives: the
 * figures the verdict shows for that period, as the best-date search scores a landing.
 */
export interface YearOfLandings {
  startUtc: string;
  days: number;
  /** Landing days whose whole period fits the table: YEAR_DAYS, or fewer when the table ends first. */
  count: number;
  /** Hours with power from a landing on each day, capped at the period's length. */
  powered: Int32Array;
  /** Of those hours, the ones with Earth in view: the radio contact while the lander has power. */
  contact: Int32Array;
  /** 1 where any part of the Sun shows at the landing hour. */
  sunlit: Uint8Array;
}

/** How many landing days of the year from `startUtc` leave room for a whole period of `days` before the table ends. */
export function yearDayCount(eph: Ephemeris, startUtc: string, days: number): number {
  const i0 = indexForEt(eph, utcToEt(startUtc));
  if (i0 < 0) return 0;
  const rows = eph.n - i0;
  if (rows < days * 24) return 0;
  return Math.min(YEAR_DAYS, Math.floor((rows - days * 24) / 24) + 1);
}

function emptySeries(i0: number, hours: number): Series {
  return {
    i0,
    hours,
    sunAz: new Float64Array(hours),
    sunEl: new Float64Array(hours),
    earthAz: new Float64Array(hours),
    earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours),
    earthVisible: new Uint8Array(hours),
    sunAu: new Float64Array(hours),
  };
}

/**
 * The year worked out a month of hours at a time: the generator pauses (yields) after each slice of the hourly
 * series, then scores every landing day in one go, a millisecond or two. Each hour of the series stands alone, so the
 * slices join into the very series one pass would give, and every day gets the figures of a period from that day.
 */
export function* yearSteps(eph: Ephemeris, input: YearInput): Generator<void, YearOfLandings, void> {
  const { site, mask, startUtc, days, power, minEarthElDeg } = input;
  const count = yearDayCount(eph, startUtc, days);
  const cap = days * 24;
  if (count === 0) return { startUtc, days, count, powered: new Int32Array(0), contact: new Int32Array(0), sunlit: new Uint8Array(0) };
  const hours = (count - 1) * 24 + cap;
  const startEt = utcToEt(startUtc);
  const series = emptySeries(indexForEt(eph, startEt), hours);
  for (let from = 0; from < hours; from += SLICE_HOURS) {
    const part = hourlySeries(site, mask, eph, startEt + from * 3600, Math.min(SLICE_HOURS, hours - from));
    series.sunAz.set(part.sunAz, from);
    series.sunEl.set(part.sunEl, from);
    series.earthAz.set(part.earthAz, from);
    series.earthEl.set(part.earthEl, from);
    series.sunFraction.set(part.sunFraction, from);
    series.earthVisible.set(part.earthVisible, from);
    series.sunAu.set(part.sunAu, from);
    yield;
  }
  const scan = minEarthElDeg > 0 ? withCommsThreshold(series, mask, minEarthElDeg) : series;
  const scores = landingScores(scan, power, { from: 0, to: (count - 1) * 24 + 1, step: 24, capHours: cap });
  return { startUtc, days, count, powered: scores.powered, contact: scores.contact, sunlit: scores.sunlit };
}

/** Runs the steps to the end at once: for tests and for callers off the page. */
export function runAll<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/**
 * A pause that lets the page paint and answer a key before the next slice: the browser's own yield where it has one,
 * which picks the work up again first and skips a timer's 4 ms floor, else a timer.
 */
export function nextTask(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return scheduler?.yield ? scheduler.yield() : new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Runs the steps with a pause after each, as the site list is worked out site by site; null as soon as `stale` says
 * the inputs have moved on (another site, period or lander), so a year for them is never finished or shown.
 */
export async function runSliced<T>(steps: Generator<void, T, void>, stale: () => boolean, pause: () => Promise<void> = nextTask): Promise<T | null> {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
    await pause();
    if (stale()) return null;
  }
}
