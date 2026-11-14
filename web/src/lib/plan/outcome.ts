import { poweredFrom, timeWithPower } from '../engine/landing';
import type { Series } from '../engine/metrics';
import { powerSeries, type PowerConfig, type PowerResult } from '../engine/power';

/**
 * What a lander gets from one landing hour at one place, over its stay: the figures a recommendation is ranked
 * and checked on. Every figure is in hours, counted on the hours of the series it was worked out on.
 */
export interface Outcome {
  /** The landing hour, as an index into that series. */
  hour: number;
  /** Hours of stay counted: the stay asked for, fewer where the series ends. */
  stayH: number;
  /** Hours with power in a row from landing, to the first hour the battery cannot cover, at most the stay. */
  poweredH: number;
  /** Hours of the stay with any part of the Sun in view. */
  sunH: number;
  /** Hours of the stay with Earth in view. */
  contactH: number;
  /** Hours with Earth in view while the lander has power, before the first power cut. */
  poweredContactH: number;
  /** The longest stretch of the stay without Earth in view; stretches cut short by the stay's ends count as they are. */
  outageH: number;
  /** Hours from landing to the first hour with Earth in view (0 when it is in view at landing); null when it never is in the stay. */
  firstContactH: number | null;
  /** Whether any part of the Sun shows at the landing hour: a lander lands in daylight. */
  sunlitAtLanding: boolean;
}

/** Sums and stretches of a series that every landing hour's figures are read from. */
interface Index {
  hours: number;
  /** Prefix sums of the hours with Earth in view and of the hours with some Sun. */
  vis: Int32Array;
  lit: Int32Array;
  /** For each hour, the first hour from it with Earth in view, or -1. */
  nextVis: Int32Array;
  /** Stretches without Earth in view, as [start, end) pairs, in order. */
  gaps: number[];
  sunlit: (hour: number) => boolean;
}

function indexOf(series: Series): Index {
  const n = series.hours;
  const vis = new Int32Array(n + 1);
  const lit = new Int32Array(n + 1);
  for (let h = 0; h < n; h++) {
    vis[h + 1] = vis[h] + series.earthVisible[h];
    lit[h + 1] = lit[h] + (series.sunFraction[h] > 0 ? 1 : 0);
  }
  const nextVis = new Int32Array(n + 1).fill(-1);
  for (let h = n - 1; h >= 0; h--) nextVis[h] = series.earthVisible[h] === 1 ? h : nextVis[h + 1];
  const gaps: number[] = [];
  let start = -1;
  for (let h = 0; h <= n; h++) {
    const out = h < n && series.earthVisible[h] !== 1;
    if (out && start < 0) start = h;
    if (!out && start >= 0) {
      gaps.push(start, h);
      start = -1;
    }
  }
  return { hours: n, vis, lit, nextVis, gaps, sunlit: (h) => h < n && series.sunFraction[h] > 0 };
}

/** The longest stretch without Earth in view inside [from, to). */
function longestGap(ix: Index, from: number, to: number): number {
  const g = ix.gaps;
  // The first stretch that ends after `from`: the stretches are in order, so a binary search finds it.
  let lo = 0;
  let hi = g.length / 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g[2 * mid + 1] <= from) lo = mid + 1;
    else hi = mid;
  }
  let best = 0;
  for (let k = lo; k < g.length / 2 && g[2 * k] < to; k++) best = Math.max(best, Math.min(g[2 * k + 1], to) - Math.max(g[2 * k], from));
  return best;
}

function measure(ix: Index, hour: number, stay: number, powered: (end: number) => number): Outcome {
  const end = Math.min(ix.hours, hour + Math.max(0, stay));
  const stayH = Math.max(0, end - hour);
  const poweredH = Math.min(stayH, powered(stayH));
  const first = hour < ix.hours ? ix.nextVis[hour] : -1;
  return {
    hour,
    stayH,
    poweredH,
    sunH: stayH > 0 ? ix.lit[end] - ix.lit[hour] : 0,
    contactH: stayH > 0 ? ix.vis[end] - ix.vis[hour] : 0,
    poweredContactH: poweredH > 0 ? ix.vis[hour + poweredH] - ix.vis[hour] : 0,
    outageH: stayH > 0 ? longestGap(ix, hour, end) : 0,
    firstContactH: first >= 0 && first < end ? first - hour : null,
    sunlitAtLanding: ix.sunlit(hour),
  };
}

/**
 * The outcome of any landing hour of a series for a stay of `stayH` hours, for one lander: the sums are worked out
 * once, so a search can ask for every hour of a year. The battery walk is the engine's (`poweredFrom`).
 */
export function outcomeScanner(series: Series, cfg: PowerConfig): (hour: number, stayH: number) => Outcome {
  const ix = indexOf(series);
  const powerW = powerSeries(series, cfg);
  return (hour, stayH) => measure(ix, hour, stayH, (n) => poweredFrom(powerW, cfg, hour, n));
}

/** The outcome of landing at the start of a period, read from the period's own battery walk: what Explore shows. */
export function periodOutcome(series: Series, power: Pick<PowerResult, 'firstBrownoutHour' | 'powerW'>): Outcome {
  return measure(indexOf(series), 0, series.hours, () => timeWithPower(power));
}

/**
 * The worst of several sites' outcomes for the same landing hour, figure by figure: the least power, sunlight and
 * contact, the longest time without Earth, the latest first contact. A choice for several sites is ranked on this,
 * so no site's poor result hides behind the others' good ones.
 */
export function worstOf(outcomes: Outcome[]): Outcome {
  const [first, ...rest] = outcomes;
  return rest.reduce<Outcome>(
    (w, o) => ({
      hour: w.hour,
      stayH: Math.min(w.stayH, o.stayH),
      poweredH: Math.min(w.poweredH, o.poweredH),
      sunH: Math.min(w.sunH, o.sunH),
      contactH: Math.min(w.contactH, o.contactH),
      poweredContactH: Math.min(w.poweredContactH, o.poweredContactH),
      outageH: Math.max(w.outageH, o.outageH),
      firstContactH: w.firstContactH === null || o.firstContactH === null ? null : Math.max(w.firstContactH, o.firstContactH),
      sunlitAtLanding: w.sunlitAtLanding && o.sunlitAtLanding,
    }),
    first,
  );
}
