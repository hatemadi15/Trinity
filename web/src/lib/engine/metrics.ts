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
}

/** Hourly series on the ephemeris grid, starting at the row nearest `startEt` (site height 0, like Python). */
export function hourlySeries(site: { lat: number; lon: number }, mask: ArrayLike<number>, eph: Ephemeris, startEt: number, hours: number): Series {
  const i0 = indexForEt(eph, startEt);
  if (i0 < 0 || i0 + hours > eph.n) throw new RangeError(`requested span is outside the ephemeris table (rows ${i0}..${i0 + hours}, table 0..${eph.n})`);
  const sunAz = new Float64Array(hours), sunEl = new Float64Array(hours);
  const earthAz = new Float64Array(hours), earthEl = new Float64Array(hours);
  const sunFraction = new Float64Array(hours), earthVisible = new Uint8Array(hours);
  const d = eph.data;
  for (let h = 0; h < hours; h++) {
    const o = (i0 + h) * 6;
    const sun = [d[o], d[o + 1], d[o + 2]], earth = [d[o + 3], d[o + 4], d[o + 5]];
    const s = azElFromBodyVector(sun, site.lat, site.lon, 0);
    const e = azElFromBodyVector(earth, site.lat, site.lon, 0);
    sunAz[h] = s.az; sunEl[h] = s.el; earthAz[h] = e.az; earthEl[h] = e.el;
    const dist = Math.hypot(sun[0], sun[1], sun[2]);
    sunFraction[h] = diskFraction(s.el - maskAtAzimuth(mask, s.az), sunRadiusDeg(dist));
    earthVisible[h] = e.el - maskAtAzimuth(mask, e.az) > 0 ? 1 : 0;
  }
  return { i0, hours, sunAz, sunEl, earthAz, earthEl, sunFraction, earthVisible };
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

/** Best-scoring window of `windowHours`, scanning starts every `stepHours`. Score in [−1, 2]. */
export function bestWindow(index: SeriesIndex, windowHours: number, stepHours = 6, weights: WindowWeights = { sun: 1, earth: 1, gap: 1 }): { start: number; score: number; summary: Summary } {
  const n = index.series.hours;
  if (windowHours > n) throw new RangeError(`window ${windowHours} h longer than series ${n} h`);
  let best = { start: 0, score: -Infinity, summary: index.window(0, windowHours) };
  for (let start = 0; start + windowHours <= n; start += stepHours) {
    const s = index.window(start, start + windowHours);
    const score = weights.sun * s.illumFraction + weights.earth * s.earthVisFraction - (weights.gap * (s.longestDarkH + s.longestEarthGapH)) / (2 * windowHours);
    if (score > best.score) best = { start, score, summary: s };
  }
  return best;
}
