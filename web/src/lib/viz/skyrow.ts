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
  /** The top edge of the hills, left out where they stand above the range (there they run off the top of the row). */
  hillEdge: string;
  /** Whether the hills stand above the range anywhere. */
  clipped: boolean;
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

/**
 * From 1° under the lowest thing in view up to `headroom` above the body's highest point; tall hills run
 * off the top unless `fitHills` makes room for all of them (1° above the highest). `headroomShare` keeps
 * at least that share of the row free above the body, whatever the span.
 */
export function rowRange(
  el: ArrayLike<number>,
  hill: ArrayLike<number>,
  opts: { headroom?: number; headroomShare?: number; floor?: number; fitHills?: boolean } = {},
): Range {
  const headroom = opts.headroom ?? 6;
  const share = Math.min(Math.max(opts.headroomShare ?? 0, 0), 0.9);
  let lo = Infinity;
  let hi = -Infinity;
  let hillTop = -Infinity;
  for (let i = 0; i < el.length; i++) {
    lo = Math.min(lo, el[i], hill[i]);
    hi = Math.max(hi, el[i]);
    hillTop = Math.max(hillTop, hill[i]);
  }
  if (!Number.isFinite(lo)) return { min: -3, max: 6 };
  const min = Math.max(opts.floor ?? -90, lo - 1);
  const max = Math.max(hi + headroom, min + 6, (hi - share * min) / (1 - share));
  return { min, max: opts.fitHills ? Math.max(max, hillTop + 1) : max };
}

/** A label needs this many pixels between two height lines. */
const SCALE_GAP_PX = 26;

/**
 * The height lines drawn across a row for scale, with their words: the horizon (0°, eye level on flat
 * ground) and every 5° above it, or every 10° when 5° is too little room for the words. Lines within 0.4°
 * of the edge of the range are left out.
 */
export function scaleLines(range: Range, heightPx: number): { deg: number; words: string }[] {
  const step = (5 * heightPx) / (range.max - range.min) >= SCALE_GAP_PX ? 5 : 10;
  const out: { deg: number; words: string }[] = [];
  for (let deg = 0; deg < range.max - 0.4; deg += step) {
    if (deg > range.min + 0.4) out.push({ deg, words: deg === 0 ? 'horizon' : `${deg}° up` });
  }
  return out;
}

/**
 * What hides the body over the hours [from, to): the hills, when they stand clearly above eye level and
 * above the body, or the horizon itself, when the body is below eye level and the hills in its direction are low.
 */
export function hiddenBy(el: ArrayLike<number>, hill: ArrayLike<number>, from: number, to: number): 'hills' | 'horizon' {
  let hills = 0;
  let horizon = 0;
  for (let i = from; i < to; i++) {
    if (hill[i] > Math.max(el[i], 0) + 1) hills++;
    else if (el[i] < 0) horizon++;
  }
  return horizon > hills ? 'horizon' : 'hills';
}

export function rowGeometry(el: ArrayLike<number>, hill: ArrayLike<number>, visible: ArrayLike<number | boolean>, box: Box, range: Range): RowGeometry {
  const n = el.length;
  const x = (hour: number) => box.x + ((hour + 0.5) / n) * box.w;
  const y = (deg: number) => box.y + (1 - (Math.min(Math.max(deg, range.min), range.max) - range.min) / (range.max - range.min)) * box.h;
  // The edge runs through the hour centres; the shape extends it flat to both sides of the box and closes along the bottom.
  const pts: string[] = [];
  for (let i = 0; i < n; i++) pts.push(`${f1(x(i))} ${f1(y(hill[i]))}`);
  // No outline between two hours that are both above the range: a line along the top of the row would read as a flat summit.
  let edge = '';
  let penAt = -1;
  let clipped = n > 0 && hill[0] > range.max;
  for (let i = 1; i < n; i++) {
    if (hill[i] > range.max) clipped = true;
    if (hill[i - 1] > range.max && hill[i] > range.max) continue;
    if (penAt !== i - 1) edge += `M${pts[i - 1]}`;
    edge += `L${pts[i]}`;
    penAt = i;
  }
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
  return { hillArea, hillEdge: edge, clipped, runs, events, x, y };
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

/** Every stretch of hours the body is hidden, in order: `from` is its first hidden hour, `to` the first visible hour after it (or the number of hours). */
export function hiddenRuns(visible: ArrayLike<number | boolean>): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  for (let i = 0; i <= visible.length; i++) {
    const hidden = i < visible.length && !visible[i];
    if (hidden && start < 0) start = i;
    if (!hidden && start >= 0) {
      out.push({ from: start, to: i });
      start = -1;
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

/** Share of the width, in percent, that the height-line words need at an edge. */
const SCALE_ROOM = 12;
/** Half the width, in percent, of the words written across the hidden stretch. */
const STRETCH_HALF = 21;

/**
 * The side of the chart for the words on the height lines ("5° up", "horizon"): away from the longest
 * hidden stretch when that side is free of its words, of its sunset and sunrise labels and of the
 * `extra` stretches of the chart that other labels take, otherwise the other side, otherwise nowhere.
 * All positions are percent of the chart's width.
 */
export function scaleLabelSide(
  hidden: { fromPct: number; toPct: number; set: LabelSide; rise: LabelSide } | null,
  need = 17,
  extra: [number, number][] = [],
): 'left' | 'right' | null {
  if (!hidden) return 'right';
  const { fromPct, toPct, set, rise } = hidden;
  const middle = (fromPct + toPct) / 2;
  const taken: [number, number][] = [[middle - STRETCH_HALF, middle + STRETCH_HALF], ...extra];
  if (set === 'inside') taken.push([fromPct, fromPct + need]);
  if (set === 'outside') taken.push([fromPct - need, fromPct]);
  if (rise === 'inside') taken.push([toPct - need, toPct]);
  if (rise === 'outside') taken.push([toPct, toPct + need]);
  const free = (from: number, to: number) => taken.every(([a, b]) => b <= from || a >= to);
  const sides: ['left' | 'right', boolean][] = [
    ['left', free(0, SCALE_ROOM)],
    ['right', free(100 - SCALE_ROOM, 100)],
  ];
  if (middle <= 50) sides.reverse();
  return sides.find(([, ok]) => ok)?.[0] ?? null;
}
