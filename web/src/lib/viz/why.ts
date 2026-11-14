import catalogue from '../data/catalogue.json';
import { HOME, type HomeDoc } from '../data/home';
import { dayMonth, pct0, spanWords } from './format';

/*
 * The three drawings of "Why the south pole is hard" (spec 23.3), drawn from the app's own month at de Gerlache Rim 2
 * (January 2027) and the crater rim's summit beside it: the Sun's path, the two skylines with the Sun against each,
 * and Earth's small loop over the hills. Worked out on the server, in each drawing's own units (its viewBox), so the
 * page carries the shapes and the few points a played drawing moves through, not the month's numbers.
 */

/** A chart in a drawing: its plot area in the drawing's units, and the directions and heights it spans, in degrees. */
export interface Chart {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  az0: number;
  az1: number;
  el0: number;
  el1: number;
}

export const xOf = (c: Chart, az: number) => c.x0 + ((az - c.az0) / (c.az1 - c.az0)) * (c.x1 - c.x0);
export const yOf = (c: Chart, el: number) => c.y1 - ((el - c.el0) / (c.el1 - c.el0)) * (c.y1 - c.y0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const clampEl = (c: Chart, el: number) => Math.min(c.el1 + 0.6, Math.max(c.el0 - 0.6, el));

/** A tick on an axis, where it stands in the drawing and its label. */
export interface Tick {
  at: number;
  label: string;
}

/** One stop of a played drawing: where the marker stands, whether the body is in view there, and the date. */
export interface Frame {
  x: number;
  y: number;
  shown: boolean;
  date: string;
}

/** A track (the Sun's or Earth's month): the parts in view and the hidden parts as SVG paths, split where it wraps past north. */
export interface Track {
  shown: string;
  hidden: string;
}

/**
 * The month's track as SVG paths: each step between two hours belongs to the in-view path when the body is in view at
 * both, else to the hidden one; a step that wraps past north (from one edge of the chart to the other) is left out.
 * Every `step` hours, which keeps the drawing light.
 */
export function trackPaths(c: Chart, az: number[], el: number[], inView: (h: number) => boolean, step = 2): Track {
  const parts: Record<keyof Track, string[]> = { shown: [], hidden: [] };
  let open: keyof Track | null = null;
  const pt = (h: number) => `${r1(xOf(c, az[h]))} ${r1(yOf(c, clampEl(c, el[h])))}`;
  for (let h = step; h < az.length; h += step) {
    const a = h - step;
    if (Math.abs(az[h] - az[a]) > 180) {
      open = null;
      continue;
    }
    const kind: keyof Track = inView(a) && inView(h) ? 'shown' : 'hidden';
    if (open !== kind) parts[kind].push(`M${pt(a)}`);
    parts[kind].push(`L${pt(h)}`);
    open = kind;
  }
  return { shown: parts.shown.join(''), hidden: parts.hidden.join('') };
}

/** A skyline (heights by direction from north, `step` degrees apart) as the filled ground under it, cut at the chart's top. */
export function groundPath(c: Chart, mask: { az0: number; step: number; el: number[] }): string {
  const pts: string[] = [];
  const n = mask.el.length;
  // One more point than the skyline has, at 360°, so the ground runs to the chart's right edge.
  for (let i = 0; i <= n; i++) {
    const az = mask.az0 + i * mask.step;
    if (az < c.az0 - mask.step || az > c.az1 + mask.step) continue;
    const el = Math.min(c.el1, Math.max(c.el0, mask.el[i % n]));
    pts.push(`${r1(xOf(c, Math.min(c.az1, Math.max(c.az0, az))))} ${r1(yOf(c, el))}`);
  }
  return `M${r1(c.x0)} ${r1(c.y1)}L${pts.join('L')}L${r1(c.x1)} ${r1(c.y1)}Z`;
}

/** The skyline's height in a direction, read from the nearest of its directions. */
export function skylineAt(mask: { az0: number; step: number; el: number[] }, az: number): number {
  const n = mask.el.length;
  const i = Math.round((((az - mask.az0) % 360) + 360) / mask.step) % n;
  return mask.el[i];
}

/** The played drawing's stops, every `step` hours. */
function frames(c: Chart, start: string, az: number[], el: number[], inView: (h: number) => boolean, step = 3): Frame[] {
  const out: Frame[] = [];
  for (let h = 0; h < az.length; h += step) out.push({ x: r1(xOf(c, az[h])), y: r1(yOf(c, clampEl(c, el[h]))), shown: inView(h), date: dayMonth(start, h) });
  return out;
}

const COMPASS: Tick[] = [
  { at: 0, label: 'N' },
  { at: 90, label: 'E' },
  { at: 180, label: 'S' },
  { at: 270, label: 'W' },
  { at: 360, label: 'N' },
];
const degrees = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v)}°`;
const heights = (c: Chart, values: number[]): Tick[] => values.map((v) => ({ at: r1(yOf(c, v)), label: degrees(v) }));
const across = (c: Chart, ticks: Tick[]): Tick[] => ticks.map((t) => ({ at: r1(xOf(c, t.at)), label: t.label }));
/** Rounded to one decimal, with the decimal point the page uses. */
const deg1 = (v: number) => `${(Math.round(v * 10) / 10).toFixed(1)}°`;

export interface SunDrawing {
  w: number;
  h: number;
  chart: Chart;
  /** Ground below the true horizon (0°). */
  ground: string;
  horizonY: number;
  path: string;
  /** Midnight of each day on the path; `label` on a few. */
  days: { x: number; y: number; label?: string }[];
  highest: { x: number; y: number; el: number; date: string };
  /** The contrast: a site at middle latitude, whose Sun climbs off the chart (it rises at `x`, in the east). */
  contrast: { path: string; x: number; peak: number; site: string; lat: number };
  xTicks: Tick[];
  yTicks: Tick[];
  frames: Frame[];
  alt: string;
  notice: string;
}

export interface HillsPanel {
  name: string;
  chart: Chart;
  ground: string;
  track: Track;
  /**
   * The longest stretch of hours the hills hide the Sun, if they do: the directions it crosses meanwhile (a band over
   * the chart; none when the stretch wraps past north), how long it lasts and when.
   */
  hidden: { x0: number; x1: number; span: string; when: string } | null;
  summary: string;
  yTicks: Tick[];
  frames: Frame[];
}

export interface HillsDrawing {
  w: number;
  h: number;
  km: number;
  panels: [HillsPanel, HillsPanel];
  xTicks: Tick[];
  alt: string;
  notice: string;
}

export interface EarthDrawing {
  w: number;
  h: number;
  chart: Chart;
  ground: string;
  track: Track;
  days: { x: number; y: number; label?: string }[];
  xTicks: Tick[];
  yTicks: Tick[];
  highest: { x: number; y: number; el: number; date: string };
  inViewPct: string;
  frames: Frame[];
  alt: string;
  notice: string;
}

export interface WhyDrawings {
  sun: SunDrawing;
  hills: HillsDrawing;
  earth: EarthDrawing;
}

type Site = { id: string; lat: number; lon: number; name: string };
/** The middle-latitude site the Sun's drawing compares the pole with. */
const CONTRAST_SITE = 'apollo_15';

/** The site's name as the page says it, without the catalogue's note in brackets. */
const shortName = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').replace(/ landing site$/, '');

function sunDrawing(doc: HomeDoc): SunDrawing {
  const s = doc.sky, w = 380, h = 250;
  const chart: Chart = { x0: 40, x1: 366, y0: 52, y1: 196, az0: 0, az1: 360, el0: -2, el1: 5 };
  const all = () => true;
  const track = trackPaths(chart, s.sun_az, s.sun_el, all);
  const days: SunDrawing['days'] = [];
  for (let hr = 0; hr < s.hours; hr += 24) {
    const day = hr / 24 + 1;
    days.push({ x: r1(xOf(chart, s.sun_az[hr])), y: r1(yOf(chart, clampEl(chart, s.sun_el[hr]))), label: day > 1 && (day - 1) % 7 === 0 ? dayMonth(s.start_utc, hr) : undefined });
  }
  let top = 0;
  for (let hr = 1; hr < s.hours; hr++) if (s.sun_el[hr] > s.sun_el[top]) top = hr;
  const site = (catalogue.sites as Site[]).find((x) => x.id === CONTRAST_SITE)!;
  // Where the Sun stands highest at a site of latitude φ, the Moon's axis tilted only 1.5°: about 90° − |φ|.
  const peak = Math.round(90 - Math.abs(site.lat));
  // Its month as a curve of the same chart: up out of the top in the east, down in the west; only the parts on the
  // chart are drawn, so it leaves through the top.
  const arc: string[] = [];
  let inside = false;
  for (let az = 90; az <= 270; az += 0.5) {
    const el = peak * Math.sin(((az - 90) / 180) * Math.PI);
    const on = el <= chart.el1;
    if (on) arc.push(`${inside ? 'L' : 'M'}${r1(xOf(chart, az))} ${r1(yOf(chart, el))}`);
    inside = on;
  }
  const maxEl = s.sun_el[top];
  const minEl = Math.min(...s.sun_el);
  const name = doc.hero.name;
  return {
    w,
    h,
    chart,
    ground: `M${chart.x0} ${r1(yOf(chart, 0))}H${chart.x1}V${chart.y1}H${chart.x0}Z`,
    horizonY: r1(yOf(chart, 0)),
    path: track.shown,
    days,
    highest: { x: r1(xOf(chart, s.sun_az[top])), y: r1(yOf(chart, maxEl)), el: maxEl, date: dayMonth(s.start_utc, top) },
    contrast: { path: arc.join(''), x: r1(xOf(chart, 90)), peak, site: shortName(site.name), lat: Math.round(Math.abs(site.lat)) },
    xTicks: across(chart, COMPASS),
    yTicks: heights(chart, [4, 2, 0, -2]),
    frames: frames(chart, s.start_utc, s.sun_az, s.sun_el, all),
    alt: `A chart of the Sun's path seen from ${name} over January 2027, by direction and by height above the horizon: it goes once round the whole horizon and never stands higher than ${deg1(maxEl)}, dipping to ${deg1(minEl)}, below the horizon. At ${shortName(site.name)}, ${Math.round(Math.abs(site.lat))}° from the equator, it would climb to about ${peak}°.`,
    notice: `The Sun circles the horizon once a month and never stands higher than ${deg1(maxEl)}.`,
  };
}

function hillsPanel(name: string, start: string, chart: Chart, az: number[], el: number[], lit: number[], mask: HomeDoc['mask']): HillsPanel {
  const inView = (hr: number) => lit[hr] === 1;
  const track = trackPaths(chart, az, el, inView);
  // The longest run of hours the hills hide the Sun, and the directions it crosses meanwhile.
  let best: [number, number] | null = null;
  let from = -1;
  for (let hr = 0; hr <= lit.length; hr++) {
    const dark = hr < lit.length && lit[hr] === 0;
    if (dark && from < 0) from = hr;
    if (!dark && from >= 0) {
      if (!best || hr - from > best[1] - best[0]) best = [from, hr];
      from = -1;
    }
  }
  let hidden: HillsPanel['hidden'] = null;
  if (best) {
    const [a, b] = best;
    let lo = Infinity, hi = -Infinity, wraps = false;
    for (let hr = a; hr < b; hr++) {
      lo = Math.min(lo, az[hr]);
      hi = Math.max(hi, az[hr]);
      if (hr > a && Math.abs(az[hr] - az[hr - 1]) > 180) wraps = true;
    }
    hidden = { x0: wraps ? chart.x0 : r1(xOf(chart, lo)), x1: wraps ? chart.x0 : r1(xOf(chart, hi)), span: spanWords(b - a), when: `${dayMonth(start, a)} to ${dayMonth(start, b)}` };
  }
  const share = lit.reduce((n, v) => n + v, 0) / lit.length;
  return {
    name,
    chart,
    ground: groundPath(chart, mask),
    track,
    hidden,
    summary: share >= 0.9995 ? 'sunlit all month' : `sunlit ${pct0(share)} of the month`,
    yTicks: heights(chart, [4, 0, -4]),
    frames: frames(chart, start, az, el, inView),
  };
}

function hillsDrawing(doc: HomeDoc): HillsDrawing {
  const w = 380, h = 344;
  const top: Chart = { x0: 40, x1: 366, y0: 64, y1: 150, az0: 0, az1: 360, el0: -4, el1: 5 };
  const bottom: Chart = { ...top, y0: 214, y1: 300 };
  const km = Math.round(doc.pair.distance_km);
  const s = doc.sky, r = doc.rim;
  const site = hillsPanel(doc.hero.name, s.start_utc, top, s.sun_az, s.sun_el, s.lit, doc.mask);
  const rim = hillsPanel(`The rim's summit, ${km} km away`, s.start_utc, bottom, r.sun_az, r.sun_el, r.lit, r.mask);
  const night = site.hidden?.span ?? null;
  return {
    w,
    h,
    km,
    panels: [site, rim],
    xTicks: across(top, COMPASS),
    alt: `Two skylines over January 2027, with the Sun's path against each. At ${doc.hero.name} the hills stand higher than the low Sun in many directions, so it is ${site.summary}${night ? ` and sets behind the hills for ${night} in a row` : ''}. At the crater rim's summit, ${km} km away and higher up, the skyline stays below the Sun all month: ${rim.summary}.`,
    notice: `The same Sun, ${km} km apart: the hills hide it from ${doc.hero.name}${night ? ` for ${night}` : ''}, never from the summit.`,
  };
}

function earthDrawing(doc: HomeDoc): EarthDrawing {
  const s = doc.sky, w = 380, h = 250;
  const lo = Math.floor(Math.min(...s.earth_az) / 5) * 5 - 2, hi = Math.ceil(Math.max(...s.earth_az) / 5) * 5 + 2;
  const chart: Chart = { x0: 40, x1: 366, y0: 52, y1: 196, az0: lo, az1: hi, el0: -10, el1: 11 };
  const inView = (hr: number) => s.earth_visible[hr] === 1;
  const days: EarthDrawing['days'] = [];
  for (let hr = 0; hr < s.hours; hr += 24) days.push({ x: r1(xOf(chart, s.earth_az[hr])), y: r1(yOf(chart, s.earth_el[hr])) });
  let top = 0;
  for (let hr = 1; hr < s.hours; hr++) if (s.earth_el[hr] > s.earth_el[top]) top = hr;
  const ticks: Tick[] = [];
  for (let az = Math.ceil(lo / 5) * 5; az <= hi; az += 5) ticks.push({ at: az, label: `${az}°` });
  // The skyline in Earth's directions, from the site's own.
  const n = doc.mask.el.length;
  const window = { az0: lo, step: doc.mask.step, el: [] as number[] };
  for (let i = 0; lo + i * doc.mask.step <= hi + doc.mask.step && i < n; i++) window.el.push(skylineAt(doc.mask, lo + i * doc.mask.step));
  const share = s.earth_visible.reduce((k, v) => k + v, 0) / s.earth_visible.length;
  const minAz = Math.min(...s.earth_az), maxAz = Math.max(...s.earth_az), minEl = Math.min(...s.earth_el), maxEl = Math.max(...s.earth_el);
  return {
    w,
    h,
    chart,
    ground: windowGround(chart, window),
    track: trackPaths(chart, s.earth_az, s.earth_el, inView),
    days,
    xTicks: across(chart, ticks),
    yTicks: heights(chart, [10, 5, 0, -5]),
    highest: { x: r1(xOf(chart, s.earth_az[top])), y: r1(yOf(chart, s.earth_el[top])), el: s.earth_el[top], date: dayMonth(s.start_utc, top) },
    inViewPct: pct0(share),
    frames: frames(chart, s.start_utc, s.earth_az, s.earth_el, inView),
    alt: `Earth's path in the sky seen from ${doc.hero.name} over January 2027: it stays in one direction, ${Math.round(minAz)}° to ${Math.round(maxAz)}° from north, and wobbles in a small loop from ${deg1(Math.abs(minEl))} below the horizon to ${deg1(maxEl)} above it. It is above the hills, in view for radio, ${pct0(share)} of the month, and set behind them the rest.`,
    notice: `Earth hardly moves: it wobbles up and down and is above the hills, for radio, only ${pct0(share)} of the month.`,
  };
}

/** The ground under a skyline that covers only the chart's directions, from its first direction. */
function windowGround(c: Chart, sky: { az0: number; step: number; el: number[] }): string {
  const pts = sky.el.map((el, i) => `${r1(xOf(c, Math.min(c.az1, sky.az0 + i * sky.step)))} ${r1(yOf(c, Math.min(c.el1, Math.max(c.el0, el))))}`);
  return `M${r1(c.x0)} ${r1(c.y1)}L${pts.join('L')}L${r1(c.x1)} ${r1(c.y1)}Z`;
}

/** The three drawings, from the home page's month. */
export function whyDrawings(doc: HomeDoc = HOME): WhyDrawings {
  return { sun: sunDrawing(doc), hills: hillsDrawing(doc), earth: earthDrawing(doc) };
}
