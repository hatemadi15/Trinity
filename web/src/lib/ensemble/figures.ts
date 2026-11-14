import { AU_KM } from '../engine/constants';
import { timeWithPower } from '../engine/landing';
import { diskFraction, headSeries, maskAtAzimuth, summarize, sunRadiusDeg, type Series } from '../engine/metrics';
import { powerBudget, type PowerConfig } from '../engine/power';
import { outcomeScanner, periodOutcome } from '../plan/outcome';
import { checkRequirements, holdsIn, type Holds, type Requirements } from '../plan/requirements';

/**
 * The key results of one landing and period under every terrain version of a site: the app's own engine (the hourly
 * Sun and Earth over a skyline, the battery walk), run once per version's skyline. Pure, for the worker.
 */

/** The same hours seen over another skyline: where the Sun and Earth are stays the series' own; what hides them changes. */
export function seriesWithMask(series: Series, mask: ArrayLike<number>, minEarthElDeg = 0): Series {
  const n = series.hours;
  const sunFraction = new Float64Array(n);
  const earthVisible = new Uint8Array(n);
  for (let h = 0; h < n; h++) {
    sunFraction[h] = diskFraction(series.sunEl[h] - maskAtAzimuth(mask, series.sunAz[h]), sunRadiusDeg(series.sunAu[h] * AU_KM));
    earthVisible[h] = series.earthEl[h] - maskAtAzimuth(mask, series.earthAz[h]) > minEarthElDeg ? 1 : 0;
  }
  return { ...series, sunFraction, earthVisible };
}

/** The first hour of a series that has no Sun after one that had some: the first sunset; null when the Sun never sets in it. */
export function firstSunsetHour(series: Series): number | null {
  for (let h = 1; h < series.hours; h++) if (series.sunFraction[h - 1] > 0 && !(series.sunFraction[h] > 0)) return h;
  return null;
}

/** What the verdict and its folds speak of, for one skyline, landing at the period start. Hours throughout. */
export interface Figures {
  /** Power in a row from landing; the whole period when the battery never runs out. */
  poweredH: number;
  /** Whether power lasts the whole period: the verdict's good answer. */
  allPeriod: boolean;
  firstSunsetH: number | null;
  longestNightH: number;
  /** Earth in view while the lander has power, before the first power cut. */
  poweredContactH: number;
  /** Whether this landing meets every requirement set (all but the share of versions itself); null when none is set. */
  meets: boolean | null;
}

export function figuresOf(series: Series, cfg: PowerConfig, req: Requirements): Figures {
  const power = powerBudget(series, cfg);
  const o = periodOutcome(series, power);
  const checks = checkRequirements(o, req);
  return {
    poweredH: timeWithPower(power),
    allPeriod: power.firstBrownoutHour === null,
    firstSunsetH: firstSunsetHour(series),
    longestNightH: summarize(series).longestDarkH,
    poweredContactH: o.poweredContactH,
    meets: checks.length > 0 ? checks.every((c) => c.met) : null,
  };
}

type Span = [number, number];

/** The least and the most of each figure over the versions, and how many still give the landing's answer. */
export interface VersionsSummary {
  versions: number;
  poweredH: Span;
  /** The range of the first sunset over the versions that have one, and how many have none in the period. */
  firstSunsetH: Span | null;
  noSunset: number;
  longestNightH: Span;
  poweredContactH: Span;
  /** What "holds" means here: meets the requirements set, or with none set gives the same verdict as the app's own skyline. */
  basis: 'requirements' | 'verdict';
  held: number;
  /** The app's own figures for the same landing and period, to set against the ranges. */
  main: Figures;
}

const span = (v: number[]): Span => [Math.min(...v), Math.max(...v)];

export function summarizeVersions(versions: Figures[], main: Figures): VersionsSummary {
  const sunsets = versions.flatMap((f) => (f.firstSunsetH === null ? [] : [f.firstSunsetH]));
  const basis = main.meets === null ? 'verdict' : 'requirements';
  return {
    versions: versions.length,
    poweredH: span(versions.map((f) => f.poweredH)),
    firstSunsetH: sunsets.length ? span(sunsets) : null,
    noSunset: versions.length - sunsets.length,
    longestNightH: span(versions.map((f) => f.longestNightH)),
    poweredContactH: span(versions.map((f) => f.poweredContactH)),
    basis,
    held: versions.filter((f) => (basis === 'requirements' ? f.meets === true : f.allPeriod === main.allPeriod)).length,
    main,
  };
}

export interface VersionsInput {
  /**
   * The hours as the app works them out over its own skyline: the period, or, with `byHour`, the series the store scans
   * for the landing search (it runs up to a period past the end). Where the Sun and Earth are is read from it; each
   * version only changes what the hills hide.
   */
  series: Series;
  /** Hours in the period: the stay counted from each landing hour. */
  hours: number;
  /** Each version's skyline. The app's own figures, the ranges are set against, are read from `series` itself. */
  masks: ArrayLike<number>[];
  power: PowerConfig;
  minEarthElDeg: number;
  requirements: Requirements;
  /** Also count, for every landing hour of the period, in how many versions it holds (the optional requirement's share). */
  byHour?: boolean;
}

export interface VersionsResult {
  summary: VersionsSummary;
  /**
   * For each landing hour of the period, in how many versions a stay as long as the period holds; with `byHour` only, and
   * null at an hour without Sun on the app's own skyline, which is never a landing time on offer (the start always counts).
   */
  holdsByHour: (Holds | null)[] | null;
}

/**
 * Every version's figures for landing at the period start, summed up; with `byHour`, also how many versions hold from
 * each sunlit landing hour of the period, for a stay as long as the period.
 */
export function versionsResult(input: VersionsInput): VersionsResult {
  const { series: base, hours, masks, power, minEarthElDeg, requirements } = input;
  const scans = masks.map((m) => seriesWithMask(base, m, minEarthElDeg));
  const main = figuresOf(headSeries(base, hours), power, requirements);
  const summary = summarizeVersions(
    scans.map((s) => figuresOf(headSeries(s, hours), power, requirements)),
    main,
  );
  if (!input.byHour) return { summary, holdsByHour: null };
  const at = scans.map((s) => outcomeScanner(s, power));
  const holdsByHour: (Holds | null)[] = [];
  for (let h = 0; h < hours; h++) {
    if (h > 0 && !(base.sunFraction[h] > 0)) {
      holdsByHour.push(null);
      continue;
    }
    let held = 0;
    for (const f of at) if (holdsIn(f(h, hours), requirements)) held++;
    holdsByHour.push({ held, of: at.length });
  }
  return { summary, holdsByHour };
}
