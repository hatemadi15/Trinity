/** Geometry of one row of the time chart: a body's height against the hills in its direction, hour by hour. */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Range {
  min: number;
  max: number;
}

export interface RowGeometry {
  /** The hills as a closed shape down to the bottom of the box. */
  hillArea: string;
  /** The top edge of the hills. */
  hillEdge: string;
  /** The body's line, split where it goes behind the hills; each run starts at the last point of the run before. */
  runs: { visible: boolean; points: string }[];
  /** Hours at which the body disappears ('set') or comes back ('rise'). */
  events: { hour: number; kind: 'set' | 'rise' }[];
  /** Centre of an hour. */
  x: (hour: number) => number;
  /** Height in degrees, clamped to the range. */
  y: (deg: number) => number;
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/** From 1° under the lowest thing in view up to `headroom` above the body's highest point; tall hills run off the top. */
export function rowRange(el: ArrayLike<number>, hill: ArrayLike<number>, opts: { headroom?: number; floor?: number } = {}): Range {
  const headroom = opts.headroom ?? 6;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < el.length; i++) {
    lo = Math.min(lo, el[i], hill[i]);
    hi = Math.max(hi, el[i]);
  }
  if (!Number.isFinite(lo)) return { min: -3, max: 6 };
  const min = Math.max(opts.floor ?? -90, lo - 1);
  return { min, max: Math.max(hi + headroom, min + 6) };
}

export function rowGeometry(el: ArrayLike<number>, hill: ArrayLike<number>, visible: ArrayLike<number | boolean>, box: Box, range: Range): RowGeometry {
  const n = el.length;
  const x = (hour: number) => box.x + ((hour + 0.5) / n) * box.w;
  const y = (deg: number) => box.y + (1 - (Math.min(Math.max(deg, range.min), range.max) - range.min) / (range.max - range.min)) * box.h;
  // The edge runs through the hour centres; the shape extends it flat to both sides of the box and closes along the bottom.
  const pts: string[] = [];
  for (let i = 0; i < n; i++) pts.push(`${f1(x(i))} ${f1(y(hill[i]))}`);
  const edge = `M${pts.join('L')}`;
  const left = f1(box.x);
  const right = f1(box.x + box.w);
  const bottom = f1(box.y + box.h);
  const hillArea = `M${left} ${bottom}L${left} ${f1(y(hill[0]))}L${pts.join('L')}L${right} ${f1(y(hill[n - 1]))}L${right} ${bottom}Z`;
  const runs: { visible: boolean; points: string }[] = [];
  const events: { hour: number; kind: 'set' | 'rise' }[] = [];
  let line: string[] = [];
  let state: boolean | null = null;
  for (let i = 0; i < n; i++) {
    const v = Boolean(visible[i]);
    const p = `${f1(x(i))},${f1(y(el[i]))}`;
    if (state === null) {
      state = v;
    } else if (v !== state) {
      runs.push({ visible: state, points: line.join(' ') });
      events.push({ hour: i, kind: v ? 'rise' : 'set' });
      line = [line[line.length - 1]];
      state = v;
    }
    line.push(p);
  }
  if (state !== null) runs.push({ visible: state, points: line.join(' ') });
  return { hillArea, hillEdge: edge, runs, events, x, y };
}

const DIRECTIONS: [number, string][] = [
  [0, 'north'],
  [45, 'north-east'],
  [90, 'east'],
  [135, 'south-east'],
  [180, 'south'],
  [225, 'south-west'],
  [270, 'west'],
  [315, 'north-west'],
];

/** Hours at which the azimuth crosses one of the eight compass directions (either way round, including the wrap through north). */
export function compassTicks(az: ArrayLike<number>): { hour: number; label: string }[] {
  const out: { hour: number; label: string }[] = [];
  for (let i = 1; i < az.length; i++) {
    const a0 = az[i - 1];
    const a1 = az[i];
    const wrapped = Math.abs(a1 - a0) > 180;
    for (const [deg, label] of DIRECTIONS) {
      const hit = deg === 0 ? wrapped : !wrapped && (a0 - deg) * (a1 - deg) <= 0 && a0 !== a1 && a0 !== deg;
      if (hit) out.push({ hour: i, label });
    }
  }
  return out;
}

/** The longest stretch of hours the body is hidden: `from` is its first hidden hour, `to` the first visible hour after it (or the number of hours). */
export function longestHidden(visible: ArrayLike<number | boolean>): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  let start = -1;
  for (let i = 0; i <= visible.length; i++) {
    const hidden = i < visible.length && !visible[i];
    if (hidden && start < 0) start = i;
    if (!hidden && start >= 0) {
      if (!best || i - start > best.to - best.from) best = { from: start, to: i };
      start = -1;
    }
  }
  return best;
}

export type LabelSide = 'inside' | 'outside' | null;

/**
 * Where the "sets" and "rises" labels sit, given the hidden stretch in percent of the chart's width and
 * the share of the width one label needs. Inside the stretch when they fit there; otherwise outside it
 * (before the setting, after the rising) when that side has room; otherwise nowhere. A stretch that
 * touches an edge of the chart has no event at that edge.
 */
export function eventLabelSides(fromPct: number, toPct: number, need = 17): { set: LabelSide; rise: LabelSide } {
  const hasSet = fromPct > 0;
  const hasRise = toPct < 100;
  const inside = toPct - fromPct >= need * (Number(hasSet) + Number(hasRise)) + 2;
  const side = (has: boolean, room: number): LabelSide => (!has ? null : inside ? 'inside' : room >= need ? 'outside' : null);
  return { set: side(hasSet, fromPct), rise: side(hasRise, 100 - toPct) };
}
