import { AU_KM } from './constants';
import { SUN_RADIUS_KM } from './constants';
import { indexForEt, type Ephemeris } from './ephemeris';
import { azElFromBodyVector } from './geometry';

const RAD = 180 / Math.PI;

/** Fraction of a disk of angular radius `diskRadiusDeg` above a straight skyline; delta = centre − skyline. */
export function diskFraction(deltaDeg: number, diskRadiusDeg: number): number {
  const x = Math.max(-1, Math.min(1, deltaDeg / diskRadiusDeg));
  return (Math.acos(-x) + x * Math.sqrt(1 - x * x)) / Math.PI;
}

export function sunRadiusDeg(distKm: number): number {
  return Math.asin(SUN_RADIUS_KM / distKm) * RAD;
}

/** Periodic linear interpolation of a 360° mask sampled at k·360/n. */
export function maskAtAzimuth(mask: ArrayLike<number>, azDeg: number): number {
  const n = mask.length, step = 360 / n;
  const x = (((azDeg % 360) + 360) % 360) / step;
  const i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, f = x - Math.floor(x);
  return mask[i0] * (1 - f) + mask[i1] * f;
}

export interface Series {
  i0: number;
  hours: number;
  sunAz: Float64Array;
  sunEl: Float64Array;
  earthAz: Float64Array;
  earthEl: Float64Array;
  sunFraction: Float64Array;
  earthVisible: Uint8Array;
  /** Sun distance in AU per hour (irradiance scales with 1/au²). */
  sunAu: Float64Array;
}

/** Hourly series on the ephemeris grid, starting at the row nearest `startEt` (site height 0, like Python). */
export function hourlySeries(site: { lat: number; lon: number }, mask: ArrayLike<number>, eph: Ephemeris, startEt: number, hours: number): Series {
  const i0 = indexForEt(eph, startEt);
  if (i0 < 0 || i0 + hours > eph.n) throw new RangeError(`requested span is outside the ephemeris table (rows ${i0}..${i0 + hours}, table 0..${eph.n})`);
  const sunAz = new Float64Array(hours), sunEl = new Float64Array(hours);
  const earthAz = new Float64Array(hours), earthEl = new Float64Array(hours);
  const sunFraction = new Float64Array(hours), earthVisible = new Uint8Array(hours);
  const sunAu = new Float64Array(hours);
  const d = eph.data;
  for (let h = 0; h < hours; h++) {
    const o = (i0 + h) * 6;
    const sun = [d[o], d[o + 1], d[o + 2]], earth = [d[o + 3], d[o + 4], d[o + 5]];
    const s = azElFromBodyVector(sun, site.lat, site.lon, 0);
    const e = azElFromBodyVector(earth, site.lat, site.lon, 0);
    sunAz[h] = s.az; sunEl[h] = s.el; earthAz[h] = e.az; earthEl[h] = e.el;
    const dist = Math.hypot(sun[0], sun[1], sun[2]);
    sunAu[h] = dist / AU_KM;
    sunFraction[h] = diskFraction(s.el - maskAtAzimuth(mask, s.az), sunRadiusDeg(dist));
    earthVisible[h] = e.el - maskAtAzimuth(mask, e.az) > 0 ? 1 : 0;
  }
  return { i0, hours, sunAz, sunEl, earthAz, earthEl, sunFraction, earthVisible, sunAu };
}

/** Same series with Earth visibility re-evaluated against a minimum elevation above the skyline (comms mask). */
export function withCommsThreshold(series: Series, mask: ArrayLike<number>, minElDeg: number): Series {
  const earthVisible = new Uint8Array(series.hours);
  for (let h = 0; h < series.hours; h++) {
    earthVisible[h] = series.earthEl[h] - maskAtAzimuth(mask, series.earthAz[h]) > minElDeg ? 1 : 0;
  }
  return { ...series, earthVisible };
}

export interface ContactWindow {
  start: number;
  end: number;
}

/** Maximal runs of Earth-visible hours as half-open [start, end) hour indexes. */
export function contactWindows(series: Series): ContactWindow[] {
  const out: ContactWindow[] = [];
  let start = -1;
  for (let h = 0; h < series.hours; h++) {
    const v = series.earthVisible[h] === 1;
    if (v && start < 0) start = h;
    if (!v && start >= 0) {
      out.push({ start, end: h });
      start = -1;
    }
  }
  if (start >= 0) out.push({ start, end: series.hours });
  return out;
}

export function longestRun(flags: ArrayLike<number | boolean>, from = 0, to = flags.length): number {
  let best = 0, cur = 0;
  for (let i = from; i < to; i++) {
    cur = flags[i] ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

export interface Summary {
  hours: number;
  illumFraction: number;
  meanSunFraction: number;
  longestDarkH: number;
  earthVisFraction: number;
  longestEarthGapH: number;
  jointFraction: number;
}

export function summarize(series: Series, from = 0, to = series.hours): Summary {
  const n = to - from;
  let lit = 0, vis = 0, joint = 0, sum = 0;
  const dark = new Uint8Array(n), gap = new Uint8Array(n);
  for (let i = from; i < to; i++) {
    const l = series.sunFraction[i] > 0, v = series.earthVisible[i] === 1;
    if (l) lit++;
    if (v) vis++;
    if (l && v) joint++;
    sum += series.sunFraction[i];
    dark[i - from] = l ? 0 : 1;
    gap[i - from] = v ? 0 : 1;
  }
  return {
    hours: n,
    illumFraction: lit / n,
    meanSunFraction: sum / n,
    longestDarkH: longestRun(dark),
    earthVisFraction: vis / n,
    longestEarthGapH: longestRun(gap),
    jointFraction: joint / n,
  };
}

/** Prefix sums so any window's fractions cost O(1); longest runs still cost O(window). */
export class SeriesIndex {
  private lit: Float64Array;
  private vis: Float64Array;
  private joint: Float64Array;
  private sum: Float64Array;

  constructor(readonly series: Series) {
    const n = series.hours;
    this.lit = new Float64Array(n + 1); this.vis = new Float64Array(n + 1);
    this.joint = new Float64Array(n + 1); this.sum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const l = series.sunFraction[i] > 0 ? 1 : 0, v = series.earthVisible[i];
      this.lit[i + 1] = this.lit[i] + l;
      this.vis[i + 1] = this.vis[i] + v;
      this.joint[i + 1] = this.joint[i] + (l && v ? 1 : 0);
      this.sum[i + 1] = this.sum[i] + series.sunFraction[i];
    }
  }

  window(from: number, to: number): Summary {
    const n = to - from;
    const s = this.series;
    let longestDark = 0, longestGap = 0, dark = 0, gap = 0;
    for (let i = from; i < to; i++) {
      dark = s.sunFraction[i] > 0 ? 0 : dark + 1;
      gap = s.earthVisible[i] ? 0 : gap + 1;
      if (dark > longestDark) longestDark = dark;
      if (gap > longestGap) longestGap = gap;
    }
    return {
      hours: n,
      illumFraction: (this.lit[to] - this.lit[from]) / n,
      meanSunFraction: (this.sum[to] - this.sum[from]) / n,
      longestDarkH: longestDark,
      earthVisFraction: (this.vis[to] - this.vis[from]) / n,
      longestEarthGapH: longestGap,
      jointFraction: (this.joint[to] - this.joint[from]) / n,
    };
  }
}

export interface WindowWeights { sun: number; earth: number; gap: number }

/** Window score in [−1, 2]: sunlit and Earth-visible fractions minus the two longest gaps as a share of the window. */
export function windowScore(s: Summary, windowHours: number, weights: WindowWeights = { sun: 1, earth: 1, gap: 1 }): number {
  return weights.sun * s.illumFraction + weights.earth * s.earthVisFraction - (weights.gap * (s.longestDarkH + s.longestEarthGapH)) / (2 * windowHours);
}

/** Element-wise mean of several window summaries; the longest runs take the worst site. */
export function meanSummary(sums: Summary[]): Summary {
  const n = sums.length;
  const mean = (f: (s: Summary) => number) => sums.reduce((a, s) => a + f(s), 0) / n;
  return {
    hours: sums[0].hours,
    illumFraction: mean((s) => s.illumFraction),
    meanSunFraction: mean((s) => s.meanSunFraction),
    longestDarkH: Math.max(...sums.map((s) => s.longestDarkH)),
    earthVisFraction: mean((s) => s.earthVisFraction),
    longestEarthGapH: Math.max(...sums.map((s) => s.longestEarthGapH)),
    jointFraction: mean((s) => s.jointFraction),
  };
}

export interface BestWindow {
  start: number;
  score: number;
  summary: Summary;
}

/**
 * Best-scoring window of `windowHours` over several sites at once: the score of a start is the mean
 * of the per-site window scores, and the returned summary is their mean. Starts are scanned every
 * `stepHours`. `startFilter` restricts the candidate starts (for example to sunlit hours); when it
 * rejects every start the scan falls back to all of them.
 */
export function bestWindowAcross(
  indexes: SeriesIndex[],
  windowHours: number,
  stepHours = 6,
  weights: WindowWeights = { sun: 1, earth: 1, gap: 1 },
  startFilter?: (start: number) => boolean,
): BestWindow {
  if (indexes.length === 0) throw new RangeError('no series to score');
  const n = Math.min(...indexes.map((i) => i.series.hours));
  if (windowHours > n) throw new RangeError(`window ${windowHours} h longer than series ${n} h`);
  const at = (start: number) => {
    const sums = indexes.map((i) => i.window(start, start + windowHours));
    return { score: sums.reduce((a, s) => a + windowScore(s, windowHours, weights), 0) / sums.length, summary: meanSummary(sums) };
  };
  const scan = (filter?: (start: number) => boolean): BestWindow => {
    let best: BestWindow = { start: -1, score: -Infinity, summary: at(0).summary };
    for (let start = 0; start + windowHours <= n; start += stepHours) {
      if (filter && !filter(start)) continue;
      const r = at(start);
      if (r.score > best.score) best = { start, ...r };
    }
    return best;
  };
  const filtered = startFilter ? scan(startFilter) : null;
  const best = filtered && filtered.start >= 0 ? filtered : scan();
  return best.start >= 0 ? best : { start: 0, ...at(0) };
}

/** Best-scoring window of `windowHours` for one series; see `bestWindowAcross`. Score in [−1, 2]. */
export function bestWindow(
  index: SeriesIndex,
  windowHours: number,
  stepHours = 6,
  weights: WindowWeights = { sun: 1, earth: 1, gap: 1 },
  startFilter?: (start: number) => boolean,
): BestWindow {
  return bestWindowAcross([index], windowHours, stepHours, weights, startFilter);
}
