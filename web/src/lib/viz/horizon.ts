import type { Series } from '../engine/metrics';

/** One stretch of a body's path across the panorama: shown solid while visible, dotted while hidden. */
export interface PathRun {
  visible: boolean;
  points: string;
}

export interface HorizonGeometry {
  /** The hills all round as a closed shape down to the bottom of the picture. */
  skyline: string;
  sun: PathRun[];
  earth: PathRun[];
  x: (azDeg: number) => number;
  y: (elDeg: number) => number;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** A body's path split where its visibility changes and where it crosses north (so it never runs across the picture). */
function runs(az: ArrayLike<number>, el: ArrayLike<number>, visible: (h: number) => boolean, x: (a: number) => number, y: (e: number) => number): PathRun[] {
  const out: PathRun[] = [];
  let points: string[] = [];
  let state: boolean | null = null;
  for (let h = 0; h < az.length; h++) {
    const v = visible(h);
    const p = `${f1(x(az[h]))},${f1(y(el[h]))}`;
    const wrapped = h > 0 && Math.abs(az[h] - az[h - 1]) > 180;
    if (state === null) {
      state = v;
    } else if (wrapped) {
      out.push({ visible: state, points: points.join(' ') });
      points = [];
      state = v;
    } else if (v !== state) {
      out.push({ visible: state, points: points.join(' ') });
      points = [points[points.length - 1]];
      state = v;
    }
    points.push(p);
  }
  if (state !== null && points.length > 0) out.push({ visible: state, points: points.join(' ') });
  return out;
}

/** The picture reaches no further below the horizon than this (deg): a mid-latitude night would squash the sky. */
const LOWEST_DEG = -10;

/**
 * The 360° picture of the horizon around a site: azimuth runs from north on the left through east,
 * south and west back to north; heights fit the skyline and both paths with a degree to spare, down to
 * 10° below the horizon at most. Seen from the southern hemisphere the Sun's azimuth falls through the
 * month, so it moves right to left; from the northern, left to right.
 */
export function horizonGeometry(mask: ArrayLike<number>, series: Series, width: number, height: number): HorizonGeometry {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    lo = Math.min(lo, mask[i]);
    hi = Math.max(hi, mask[i]);
  }
  for (let h = 0; h < series.hours; h++) {
    lo = Math.min(lo, series.sunEl[h], series.earthEl[h]);
    hi = Math.max(hi, series.sunEl[h], series.earthEl[h]);
  }
  const min = Math.max(lo, LOWEST_DEG) - 1;
  const max = hi + 1;
  const x = (azDeg: number) => (azDeg / 360) * width;
  const y = (elDeg: number) => height * (1 - (elDeg - min) / (max - min));
  const n = mask.length;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) pts.push(`${f1(x((i * 360) / n))} ${f1(y(mask[i % n]))}`);
  const skyline = `M0 ${f1(height)}L${pts.join('L')}L${f1(width)} ${f1(height)}Z`;
  return {
    skyline,
    sun: runs(series.sunAz, series.sunEl, (h) => series.sunFraction[h] > 0, x, y),
    earth: runs(series.earthAz, series.earthEl, (h) => series.earthVisible[h] === 1, x, y),
    x,
    y,
  };
}
