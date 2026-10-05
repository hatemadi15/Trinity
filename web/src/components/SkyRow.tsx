import { Fragment, useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { LabelGuard } from '@/components/LabelGuard';
import { dayMonth, spanWords } from '@/lib/viz/format';
import { compassTicks, eventLabelSides, hiddenBy, hiddenRuns, longestHidden, rowGeometry, rowRange, scaleLines, scalePreference, scaleWordSides, type LabelSide, type RowBox } from '@/lib/viz/skyrow';

/** Width of the drawing's own coordinates. The drawing stretches sideways to fill its container; its height is fixed. */
const W = 1216;
/** Hills that run off the top of the row fade out over this many pixels, which reads as "continues". */
const FADE = 40;
/** Labels at the sides keep this distance from the edge. A chart that runs from edge to edge of the window sets --chart-inset to the page gutter. */
const AT_LEFT = 'left-[var(--chart-inset,10px)]';
const AT_RIGHT = 'right-[var(--chart-inset,10px)]';

/**
 * A label on the picture. Labels are page text laid over the drawing, not text inside it, so they keep
 * their size when the chart gets narrower. A solid plate stands behind the ones that can sit on the hills.
 */
/** A word on the picture. `priority` ranks it for the guard that hides overlaps (0 is kept first). */
function Label({ children, size = 16, plate = false, className = '', style, priority = 5 }: { children: ReactNode; size?: number; plate?: boolean; className?: string; style?: CSSProperties; priority?: number }) {
  return (
    <span data-label="" data-priority={priority} className={`whitespace-nowrap ${plate ? 'rounded-[5px] bg-stage/80 px-1.5' : ''} ${className}`} style={{ fontSize: size, lineHeight: `${size + 8}px`, ...style }}>
      {children}
    </span>
  );
}

/** Centres a label on a point given in percent of the width; where the point is too near an edge the label stays inside the picture. */
function Centred({ at, children, className = '', style }: { at: number; children: ReactNode; className?: string; style: CSSProperties }) {
  const reach = Math.min(at, 100 - at);
  return (
    <span
      className={`label-centred absolute ${className}`}
      style={{ left: `${at - reach}%`, right: `${100 - at - reach}%`, paddingInline: reach < 25 ? 'var(--chart-inset, 10px)' : undefined, flexDirection: at > 50 ? 'row-reverse' : 'row', ...style }}
    >
      {children}
    </span>
  );
}

/** A label's lines: one, or several stacked, with a space between them so the page's text still reads them as one phrase. */
function Lines({ lines }: { lines: string[] }) {
  if (lines.length === 1) return <>{lines[0]}</>;
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span className="block">{line}</span>
        </Fragment>
      ))}
    </>
  );
}

/** A small black chip with a sample of a mark, so the key also reads on a light page. */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage">
      {children}
    </span>
  );
}

function LineSample({ color, dotted = false }: { color: string; dotted?: boolean }) {
  return (
    <svg width={26} height={8}>
      <line x1={2} y1={4} x2={24} y2={4} stroke={color} strokeWidth={dotted ? 2.2 : 3.4} strokeDasharray={dotted ? '2 6' : undefined} strokeLinecap="round" />
    </svg>
  );
}

const HILL_SAMPLE = <span className="block h-2.5 w-6 rounded-sm bg-hill" style={{ borderTop: '1.5px solid var(--hill-edge)' }} />;

/**
 * What the marks of a sky row mean, each beside a sample drawn the way the chart draws it. `both` covers
 * a Sun row and an Earth row shown together. The text takes the colour around it.
 */
export function SkyRowKey({ body, compass = false, className = '' }: { body: 'sun' | 'earth' | 'both'; compass?: boolean; className?: string }) {
  const item = 'flex items-center gap-2';
  if (body === 'both') {
    return (
      <ul className={`flex flex-wrap gap-x-6 gap-y-1.5 text-base ${className}`}>
        <li className={item}>
          <Chip>
            <LineSample color="var(--stage-sun)" />
          </Chip>
          the Sun&apos;s height
        </li>
        <li className={item}>
          <Chip>
            <LineSample color="var(--stage-earth)" />
          </Chip>
          Earth&apos;s height
        </li>
        <li className={item}>
          <Chip>
            <svg width={26} height={10}>
              <line x1={2} y1={3} x2={24} y2={3} stroke="var(--stage-sun)" strokeWidth={2.2} strokeDasharray="2 6" strokeLinecap="round" />
              <line x1={2} y1={7.5} x2={24} y2={7.5} stroke="var(--stage-earth)" strokeWidth={2.2} strokeDasharray="2 6" strokeLinecap="round" />
            </svg>
          </Chip>
          dotted while hidden
        </li>
        <li className={item}>
          <Chip>{HILL_SAMPLE}</Chip>
          the hills in its direction at that time
        </li>
      </ul>
    );
  }
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-1.5 text-base ${className}`}>
      <li className={item}>
        <Chip>
          <LineSample color={color} />
        </Chip>
        height of {who}
      </li>
      <li className={item}>
        <Chip>
          <LineSample color={color} dotted />
        </Chip>
        {name} hidden
      </li>
      <li className={item}>
        <Chip>{HILL_SAMPLE}</Chip>
        hills in {who}&apos;s direction at that time
      </li>
      {compass && <li>Top row: the direction {who} is in on that date.</li>}
    </ul>
  );
}

/** Half the width, in percent, that the words on a hidden stretch take: the full sentence, and the short form. */
const LONG_HALF = 21;
const SHORT_HALF = 9;
/** A hidden stretch narrower than this, in percent of the width, gets no words of its own. */
const SHORT_MIN = 22;
/** The share of the width one sunset or sunrise label needs. */
const EVENT_NEED = 17;

type Run = { from: number; to: number };
/** The words placed for one hidden stretch: the sentence (or not), and where its sunset and sunrise labels sit. */
interface RunWords {
  run: Run;
  long: boolean;
  words: boolean;
  middle: number;
  fromPct: number;
  toPct: number;
  set: LabelSide;
  rise: LabelSide;
}

const overlaps = (lane: [number, number][], a: number, b: number) => lane.some(([x, y]) => y > a && x < b);

/** A sky row's data and how it is drawn, as SkyRow takes them. */
interface RowProps {
  el: ArrayLike<number>;
  hill: ArrayLike<number>;
  visible: ArrayLike<number | boolean>;
  az?: ArrayLike<number>;
  startUtc: string;
  body: 'sun' | 'earth';
  height?: number;
  ticks?: boolean;
  fitHills?: boolean;
  title?: string;
  pxPerDeg?: number;
  /** The spacing of the height lines, when rows drawn together must agree on it. */
  scaleStep?: 5 | 10;
}

/** The row's frame: the plot's top, the range of heights it shows and its height in px, the row's height, and its drawing. */
function rowFrame({ el, hill, visible, az, height = 200, ticks = true, fitHills = false, pxPerDeg }: RowProps) {
  const top = az ? 30 : 8;
  const range = pxPerDeg ? rowRange(el, hill, { headroom: 1, fitHills }) : rowRange(el, hill, { headroom: 4, headroomShare: 0.36, fitHills });
  const rowHeight = pxPerDeg ? (range.max - range.min) * pxPerDeg : height;
  const total = top + rowHeight + (ticks ? 30 : 8);
  return { top, range, rowHeight, total, g: rowGeometry(el, hill, visible, { x: 0, y: top, w: W, h: rowHeight }, range) };
}

/** Why the body is hidden over a stretch: the Sun behind a ridge and Earth below a flat horizon call for different words. */
function whyHidden(el: ArrayLike<number>, hill: ArrayLike<number>, run: Run, who: string): string {
  return hiddenBy(el, hill, run.from, Math.min(run.to, el.length)) === 'horizon' ? `${who} is below the horizon` : `the hills stand higher than ${who}`;
}

/*
 * On a narrow chart. A phone's chart has no room for the words where the wide chart puts them: its markers would
 * shrink to bare dates, and the height lines and the second hidden stretch would lose their words. So on a narrow
 * chart the words are placed again, for its own width. The row's name and each hidden stretch's words go to a band
 * above the chart, each stretch's words over a bracket that spans it; on the chart, each sunset and sunrise keeps
 * its words and its date, on one line or on two, by its own marker and nearer it than any other, in the markers'
 * order from left to right (or, where there is no room beside its marker, over or under it on a stem), and the
 * height lines keep theirs. Where each word goes is worked
 * out from its width in the page's typeface before the page is laid out, at a few chart widths, and each set of
 * places is shown from its width up to the next: everything stands at a share of the width or at an edge and keeps
 * its size, so words that fit at one width fit at any wider one.
 */

/**
 * The widths a narrow chart's words are placed for, the page's side gutter there (the chart's --chart-inset: 16 px
 * on a phone, 32 px from 640 px), and the classes that show them from that width up to the next: charts in a
 * phone's panel (Explore's are 220 to 340 px wide), the narrowest phones, the most common ones (390 px and up),
 * and a tablet, from 640 px in a window narrower than 1024 px.
 */
const NARROW = [
  { width: 220, inset: 16, shown: '@min-[280px]:hidden' },
  { width: 280, inset: 16, shown: '@max-[280px]:hidden @min-[360px]:hidden' },
  { width: 360, inset: 16, shown: '@max-[360px]:hidden @min-[390px]:hidden' },
  { width: 390, inset: 16, shown: '@max-[390px]:hidden @min-[640px]:hidden' },
  { width: 640, inset: 32, shown: '@max-[640px]:hidden lg:hidden' },
] as const;
/** The wide chart's own words, as they always were: from 640 px wide in a window at least 1024 px wide. */
const WIDE = '@max-[640px]:hidden max-lg:hidden';

/**
 * IBM Plex Sans's widths in ems at semibold, as a browser draws them, rounded up: a word's width is worked out
 * before the page is laid out, with nothing to measure it on. Capitals not listed take 0.72 em.
 */
const EMS: [string, number][] = [
  [" '", 0.27],
  ['ijl,.:', 0.32],
  ['()ft', 0.37],
  ['rI-', 0.43],
  ['°', 0.47],
  ['csvyzJ', 0.54],
  ['aegkox', 0.57],
  ['bdhnpqu0123456789EFLSTZ', 0.6],
  ['wM', 0.82],
  ['m', 0.89],
  ['W', 0.96],
];
const EM = new Map(EMS.flatMap(([chars, em]) => [...chars].map((c) => [c, em] as const)));

/** A word's width on the chart at `size` px, with the 6 px of its plate on either side: a little over the browser's. */
export function wordWidth(text: string, size: number): number {
  let em = 0;
  for (const c of text) em += EM.get(c) ?? 0.72;
  return em * size + 12;
}

/** A word's box on a narrow chart, in px at the width it is placed for: across from the left, down from the top. */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const meets = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** What a row's words on a narrow chart are placed by: the same at every width. */
export interface NarrowRow {
  hours: number;
  /** The plot's top, the lowest a sunset's or sunrise's words may reach (above the dates along the bottom), and the row's height, in px. */
  top: number;
  bottom: number;
  total: number;
  /** Strips no word may enter: the compass row along the top and the dates along the bottom. */
  reserved: { y0: number; y1: number }[];
  title?: string;
  /** The body's line hour by hour: its height on the row in px, and whether the body shows. */
  lineY: number[];
  shown: boolean[];
  /** The marks where the body goes or comes back, as drawn: across in percent of the width, down in px. */
  dots: { pct: number; y: number }[];
  /** The hidden stretches with words of their own, the longest first, worded as on the wide chart, on one line or on two. */
  stretches: { key: number; fromPct: number; toPct: number; middle: number; long: boolean; words: string; lines: [string, string]; reason?: string }[];
  /** Each sunset and sunrise, the longest stretch's first: its share of the width, the body's height there in px, its words and date. */
  events: { key: string; kind: 'set' | 'rise'; at: number; lineY: number; words: string; date: string; long: boolean }[];
  /** The height lines: where they cross the row, their words, and the shorter words the 0° line can do with. */
  scale: { deg: number; y: number; words: string; short?: string }[];
  /** The edges to try for the height lines' words, as the wide chart tries them. */
  prefer: ('left' | 'right')[];
}

/** The facts a narrow chart's words are placed by, from the row's data: its stretches, events and height lines, as the wide chart words them. */
export function narrowRowOf(p: RowProps): NarrowRow {
  const { el, hill, visible, startUtc, body, title, ticks = true } = p;
  const hours = el.length;
  const { top, range, rowHeight, total, g } = rowFrame(p);
  const pct = (hour: number) => ((hour + 0.5) / hours) * 100;
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const gap = body === 'sun' ? 'Night' : 'No contact';
  const dark = longestHidden(visible);
  const runs = dark ? [dark, ...hiddenRuns(visible).filter((r) => r.from !== dark.from)] : [];
  const stretches: NarrowRow['stretches'] = [];
  const events: NarrowRow['events'] = [];
  for (const run of runs) {
    const long = run === dark;
    const fromPct = run.from === 0 ? 0 : pct(run.from);
    const toPct = run.to >= hours ? 100 : pct(run.to);
    const span = spanWords(run.to - run.from);
    // As on the wide chart: the longest stretch's words, and those of any other wide enough for words of its own,
    // with its sunset and sunrise. A narrow chart has no room for the dates of the short ones as well: their
    // marks stay without words, as where Earth flickers in and out of view behind the hills.
    if (!long && toPct - fromPct < SHORT_MIN) continue;
    stretches.push({ key: run.from, fromPct, toPct, middle: ((run.from + run.to) / 2 / hours) * 100, long, words: `${gap} for ${span}`, lines: [`${gap} for`, span], reason: long ? whyHidden(el, hill, run, who) : undefined });
    if (run.from > 0) events.push({ key: `set-${run.from}`, kind: 'set', at: pct(run.from), lineY: g.y(el[run.from]), words: `${name} sets`, date: dayMonth(startUtc, run.from), long });
    if (run.to < hours) events.push({ key: `rise-${run.to}`, kind: 'rise', at: pct(run.to), lineY: g.y(el[run.to]), words: `${name} rises`, date: dayMonth(startUtc, run.to), long });
  }
  return {
    hours,
    top,
    bottom: top + rowHeight - 3,
    total,
    reserved: [...(p.az ? [{ y0: 0, y1: top }] : []), ...(ticks ? [{ y0: top + rowHeight, y1: total }] : [])],
    title,
    lineY: Array.from({ length: hours }, (_, h) => g.y(el[h])),
    shown: Array.from({ length: hours }, (_, h) => Boolean(visible[h])),
    dots: g.events.map((e) => ({ pct: (e.hour / hours) * 100, y: g.y((el[e.hour - 1] + el[e.hour]) / 2) })),
    stretches,
    events,
    scale: scaleLines(range, rowHeight, p.scaleStep).map(({ deg, words }) => ({ deg, y: g.y(deg), words, short: deg === 0 ? '0°' : undefined })),
    prefer: scalePreference(dark ? ((dark.from + dark.to) / 2 / hours) * 100 : null),
  };
}

/** A word placed on a narrow chart: a sunset's or sunrise's, or a height line's. */
export interface NarrowWord {
  key: string;
  kind: 'event' | 'scale';
  lines: string[];
  size: number;
  /**
   * Its near edge 12 px from its mark at `at` % of the width, on the mark's right (`after`) or its left; over or
   * under its mark at `at` %, its left edge `from` px from the mark, tied to it by its stem; or at an edge of the chart.
   */
  place: { after: boolean; at: number } | { over: boolean; at: number; from: number } | { edge: 'left' | 'right' };
  top: number;
  box: Box;
  /** A tied word's stem, from its mark's dot to the words: across at `at` % of the width, down from `y0` to `y1` px. */
  stem?: { at: number; y0: number; y1: number };
  priority: number;
}
type Spot = { word: NarrowWord; cost: number };

/** The room a placed word takes on a chart `width` px wide: its box, and a tied word's stem, 2 px wide. */
const roomOf = (w: NarrowWord, width: number): Box[] => (w.stem ? [w.box, { x0: (w.stem.at / 100) * width - 1, x1: (w.stem.at / 100) * width + 1, y0: w.stem.y0, y1: w.stem.y1 }] : [w.box]);

/** How near a sunset's or sunrise's words may come to any mark but their own, in px: twice as far as they stand from their own. */
const CLEAR = 24;

/**
 * A sunset's or sunrise's own mark on a chart `width` px wide, as drawn (`x` and `y` in px, `pct` in percent of the
 * width), and how far its words may reach across (`from`, `to`): to CLEAR short of the mark before it and of the one
 * after it, or halfway to one nearer than twice that, and inside the chart. Marks without words of their own within
 * CLEAR of it stand with it, as where the Sun flickers in and out at the skyline before it goes: the words may reach
 * past those (never over them). So they stand nearer their own mark than any other named one; plotWords keeps them
 * in their marks' order besides, none over or under another's.
 */
function markOf(row: NarrowRow, e: NarrowRow['events'][number], width: number) {
  const markAt = (at: number) => row.dots.reduce((a, d) => (Math.abs(d.pct - at) < Math.abs(a.pct - at) ? d : a));
  const own = markAt(e.at), named = new Set(row.events.map((v) => markAt(v.at)));
  const x = (own.pct / 100) * width;
  let from = 2, to = width - 2;
  for (const d of row.dots) {
    const dx = (d.pct / 100) * width, off = Math.abs(dx - x);
    if (d === own || (off < CLEAR && !named.has(d))) continue;
    if (dx < x) from = Math.max(from, off >= 2 * CLEAR ? dx + CLEAR : (dx + x) / 2);
    if (dx > x) to = Math.min(to, off >= 2 * CLEAR ? dx - CLEAR : (dx + x) / 2);
  }
  return { pct: own.pct, x, y: own.y, from, to };
}

/** How far apart, in px, two sunsets' or sunrises' words stand at the least, so that they never run on as one. */
const APART = 8;

/**
 * Whether two sunsets' or sunrises' words read in their marks' order, from left to right: the earlier one's wholly
 * before the later one's and APART from it, so neither stands over or under the other.
 */
function inOrder(a: NarrowWord, b: NarrowWord): boolean {
  if (!('at' in a.place) || !('at' in b.place)) return true;
  return a.place.at < b.place.at ? a.box.x1 + APART <= b.box.x0 : b.box.x1 + APART <= a.box.x0;
}

/** How much of the body's line a box would hide, from 0 to 3: where the body shows counts three times, as that line is the data. */
function hidesLine(row: NarrowRow, width: number, b: Box): number {
  const first = Math.max(0, Math.floor((b.x0 / width) * row.hours));
  const last = Math.min(row.hours - 1, Math.floor((b.x1 / width) * row.hours));
  let sum = 0;
  for (let h = first; h <= last; h++) if (row.lineY[h] > b.y0 - 3 && row.lineY[h] < b.y1 + 3) sum += row.shown[h] ? 3 : 1;
  return last >= first ? sum / (last - first + 1) : 0;
}

/**
 * A sunset's or sunrise's words, with what each form costs: on one line, on two, at 14 px where 16 px has no room,
 * and last, before its mark is left without words, without the body's name, which its row and colour give: "Rises"
 * over "18 Jan".
 */
const EVENT_FORMS = [
  { size: 16, two: false, short: false, cost: 0 },
  { size: 16, two: true, short: false, cost: 2.5 },
  { size: 14, two: false, short: false, cost: 3 },
  { size: 14, two: true, short: false, cost: 5 },
  { size: 14, two: false, short: true, cost: 8 },
  { size: 14, two: true, short: true, cost: 9 },
] as const;

/** How far above or below its mark a sunset's or sunrise's words may stand beside it, in px: farther off, it takes a stem. */
const BESIDE = 16;
/** A stem's shortest length in px, from just outside its mark's dot (7 px from its middle) to the words. */
const STEM = 6;
/**
 * What standing on a stem costs: as much as the dearest of an event's full forms beside its mark (two lines at 14 px,
 * outside its stretch), so its words take a stem where they have no room beside it; and, its forms counting a
 * quarter of what they do beside it, less than leaving out the body's name beside it.
 */
const TIED = 6;

/**
 * The places a sunset's or sunrise's words may take on a chart `width` px wide, the cheapest first, in any of its
 * forms and always within its mark's reach (markOf): beside its mark, 12 px from it inside its hidden stretch or
 * outside it, level with it or not far above or below it; or, where there is no room beside it, over or under it,
 * across it, on a stem to it. Best is one line at 16 px, inside the stretch, just under the body's line as on the wide
 * chart; each step away from that costs, and so does hiding the body's line.
 */
function eventSpots(row: NarrowRow, e: NarrowRow['events'][number], width: number): Spot[] {
  const spots: Spot[] = [];
  const x = (e.at / 100) * width, mark = markOf(row, e, width);
  for (const form of EVENT_FORMS) {
    // "Sun sets" without its name: "Sets".
    const words = form.short ? `${e.kind === 'set' ? 'Sets' : 'Rises'}` : e.words;
    const lines = form.two ? [words, e.date] : [`${words} ${e.date}`];
    const w = Math.max(...lines.map((l) => wordWidth(l, form.size)));
    const h = (form.size + 8) * lines.length;
    const under = Math.min(e.lineY + 14, row.bottom - h);
    const word = (place: NarrowWord['place'], box: Box, stem?: NarrowWord['stem']): NarrowWord => ({ key: e.key, kind: 'event', lines, size: form.size, place, top: box.y0, box, stem, priority: e.long ? 2 : 3 });
    for (const inside of [true, false]) {
      // A sunset's hidden stretch lies after its mark, a sunrise's before it.
      const after = (e.kind === 'set') === inside;
      const x0 = after ? x + 12 : x - 12 - w;
      if (x0 < mark.from || x0 + w > mark.to) continue;
      for (let top = under - Math.floor((under - row.top) / 6) * 6; top + h <= row.bottom; top += 6) {
        const box = { x0, x1: x0 + w, y0: top, y1: top + h };
        if (Math.max(top - mark.y, 0, mark.y - box.y1) > BESIDE) continue;
        spots.push({ word: word({ after, at: e.at }, box), cost: form.cost + (inside ? 0 : 1) + Math.abs(top - under) / 10 + 3 * hidesLine(row, width, box) });
      }
    }
    // Over or under its mark, the mark 8 px or more inside the words' ends: centred on it as near as its reach allows,
    // or as far to either side; from the shortest stem out to the top or the bottom of the plot.
    const lo = Math.max(mark.from, mark.x + 8 - w), hi = Math.min(mark.to - w, mark.x - 8);
    if (lo > hi) continue;
    const tops: [boolean, number][] = [];
    for (let top = mark.y - 7 - STEM - h; top >= row.top; top -= 6) tops.push([true, top]);
    for (let top = mark.y + 7 + STEM; top + h <= row.bottom; top += 6) tops.push([false, top]);
    for (const x0 of new Set([Math.min(Math.max(mark.x - w / 2, lo), hi), lo, hi])) {
      for (const [over, top] of tops) {
        const box = { x0, x1: x0 + w, y0: top, y1: top + h };
        const stem = over ? { at: mark.pct, y0: box.y1, y1: mark.y - 7 } : { at: mark.pct, y0: mark.y + 7, y1: box.y0 };
        const cost = TIED + form.cost / 4 + (stem.y1 - stem.y0 - STEM) / 10 + Math.abs(x0 + w / 2 - mark.x) / 20 + 3 * hidesLine(row, width, box);
        spots.push({ word: word({ over, at: mark.pct, from: x0 - mark.x }, box, stem), cost });
      }
    }
  }
  return spots.sort((a, b) => a.cost - b.cost);
}

/** The places a height line's words may take: at the edge the wide chart prefers, then the other, and the 0° line's in short at either. */
function scaleSpots(row: NarrowRow, s: NarrowRow['scale'][number], width: number, inset: number): Spot[] {
  const spots: Spot[] = [];
  const forms: [string, number][] = [[s.words, 0], ...(s.short ? [[s.short, 5] as [string, number]] : [])];
  for (const [text, shorter] of forms) {
    const w = wordWidth(text, 16);
    row.prefer.forEach((edge, i) => {
      const x0 = edge === 'left' ? inset : width - inset - w;
      const box = { x0, x1: x0 + w, y0: s.y - 11, y1: s.y + 13 };
      if (box.y0 < 0 || box.y1 > row.total) return;
      spots.push({ word: { key: `deg-${s.deg}`, kind: 'scale', lines: [text], size: 16, place: { edge }, top: s.y - 11, box, priority: 4 }, cost: shorter + i + hidesLine(row, width, box) });
    });
  }
  return spots.sort((a, b) => a.cost - b.cost);
}

/**
 * The words on a narrow chart `width` px wide: each sunset and sunrise, then the 0° line, then the other height
 * lines, at the cheapest places where no two meet (a stem as well as its words), none covers a mark or enters a
 * reserved strip, and the sunsets' and sunrises' words read in their marks' order (inOrder). Leaving a word
 * out costs more than any place: an event's most (the longest stretch's above all), then the 0° line's, then each
 * height's, and every height's at once as much again. The search tries the cheapest places first, so its first
 * answer is already a good one; looking for a better one stops after 20,000 places tried.
 */
function plotWords(row: NarrowRow, width: number, inset: number): NarrowWord[] {
  const items = [
    ...row.events.map((e) => ({ spots: eventSpots(row, e, width), none: e.long ? 2000 : 1000 })),
    ...[...row.scale].sort((a, b) => a.deg - b.deg).map((s) => ({ spots: scaleSpots(row, s, width, inset), none: s.deg === 0 ? 400 : 30 })),
  ];
  const heights = row.scale.some((s) => s.deg > 0);
  const boxes: Box[] = [
    ...row.dots.map((d) => ({ x0: (d.pct / 100) * width - 7, x1: (d.pct / 100) * width + 7, y0: d.y - 7, y1: d.y + 7 })),
    ...row.reserved.map((r) => ({ x0: 0, x1: width, y0: r.y0, y1: r.y1 })),
  ];
  const chosen: (NarrowWord | null)[] = [];
  let best: (NarrowWord | null)[] = [];
  let bestCost = Infinity;
  let steps = 20_000;
  const walk = (i: number, cost: number) => {
    if (cost >= bestCost || steps <= 0) return;
    if (i === items.length) {
      const total = cost + (heights && !chosen.some((c) => c?.kind === 'scale' && c.key !== 'deg-0') ? 400 : 0);
      if (total < bestCost) {
        bestCost = total;
        best = [...chosen];
      }
      return;
    }
    for (const s of items[i].spots) {
      if (cost + s.cost >= bestCost) break;
      // The places tried count only once there is an answer to keep.
      if (bestCost < Infinity && --steps <= 0) return;
      const room = roomOf(s.word, width);
      if (room.some((r) => boxes.some((b) => meets(b, r))) || chosen.some((c) => c && !inOrder(c, s.word))) continue;
      chosen.push(s.word);
      boxes.push(...room);
      walk(i + 1, cost + s.cost);
      chosen.pop();
      boxes.length -= room.length;
    }
    chosen.push(null);
    walk(i + 1, cost + items[i].none);
    chosen.pop();
  };
  walk(0, 0);
  return best.filter((w): w is NarrowWord => w !== null);
}

/** A word in the band over a narrow chart: the row's name, or a hidden stretch's words centred on its middle (`middle`, percent). */
export interface BandWord {
  key: number | 'title';
  lines: string[];
  size: number;
  middle: number;
  long: boolean;
  top: number;
  box: Box;
}
/** The band over a narrow chart: the row's name, each hidden stretch's words, and under them a bracket for each stretch. */
export interface NarrowBand {
  height: number;
  title?: BandWord;
  names: BandWord[];
  brackets: { key: number; fromPct: number; toPct: number }[];
}

/** The band's top padding, the height of a lane of words, the room left for the brackets along its bottom, and the most lanes of words. */
const BAND_PAD = 6;
const LANE = 26;
const BRACKET = 11;
const MAX_LANES = 4;

/** Where Centred puts a word `w` px wide that it centres on `at` % of a chart `width` px wide: across, its left edge. */
function centredLeft(at: number, w: number, width: number, inset: number): number {
  const reach = Math.min(at, 100 - at);
  const pad = reach < 25 ? inset : 0;
  const lo = ((at - reach) / 100) * width + pad;
  const hi = ((at + reach) / 100) * width - pad;
  if (w <= hi - lo) return (at / 100) * width - w / 2;
  return at > 50 ? hi - w : lo;
}

/**
 * The band over a narrow chart `width` px wide: the row's name in the first lane, then the hidden stretches' words,
 * each centred on its stretch as on the wide chart. All of them side by side in one lane when they fit, on one line
 * each and then on two, at 17 px and then 16, the longest stretch's reason added where it still fits; otherwise
 * each in the first lanes where it stands clear, on one line where the chart has room for it.
 */
function narrowBand(row: NarrowRow, width: number, inset: number): NarrowBand | null {
  if (!row.title && row.stretches.length === 0) return null;
  const first = row.title ? 1 : 0;
  const laneTop = (lane: number) => BAND_PAD + (first + lane) * LANE;
  const across = (s: NarrowRow['stretches'][number], lines: string[], size: number) => {
    const w = Math.max(...lines.map((l) => wordWidth(l, size)));
    const x0 = centredLeft(s.middle, w, width, inset);
    return { x0, x1: x0 + w };
  };
  type Across = { x0: number; x1: number };
  const inside = (x: Across) => x.x0 >= 0 && x.x1 <= width;
  const apart = (xs: Across[]) => xs.every((a, i) => xs.every((b, j) => i === j || a.x1 <= b.x0 || b.x1 <= a.x0));
  type Placed = { s: NarrowRow['stretches'][number]; lines: string[]; size: number; lane: number; x: Across };
  let placed: Placed[] | null = null;
  for (const size of [17, 16]) {
    for (const two of [false, true]) {
      if (placed) break;
      const lines = row.stretches.map((s) => (two ? [...s.lines] : [s.words]));
      const xs = row.stretches.map((s, i) => across(s, lines[i], size));
      if (xs.every(inside) && apart(xs)) placed = row.stretches.map((s, i) => ({ s, lines: lines[i], size, lane: 0, x: xs[i] }));
    }
  }
  const long = placed?.findIndex((p) => p.s.long && p.s.reason && p.lines.length === 1) ?? -1;
  if (placed && long >= 0) {
    const p = placed[long];
    const lines = [`${p.s.words}: ${p.s.reason}`];
    const x = across(p.s, lines, p.size);
    if (inside(x) && apart(placed.map((q, i) => (i === long ? x : q.x)))) placed[long] = { ...p, lines, x };
  }
  if (!placed) {
    placed = [];
    const lanes: Across[][] = [];
    for (const s of row.stretches) {
      const one = across(s, [s.words], 16);
      const lines = inside(one) ? [s.words] : [...s.lines];
      const x = lines.length === 1 ? one : across(s, lines, 16);
      if (!inside(x)) continue;
      for (let lane = 0; lane + lines.length <= MAX_LANES; lane++) {
        const free = lines.every((_, k) => (lanes[lane + k] ?? []).every((o) => o.x1 <= x.x0 || x.x1 <= o.x0));
        if (!free) continue;
        for (let k = 0; k < lines.length; k++) (lanes[lane + k] ??= []).push(x);
        placed.push({ s, lines, size: 16, lane, x });
        break;
      }
    }
  }
  const lanes = Math.max(0, ...placed.map((p) => p.lane + p.lines.length));
  const titleWidth = row.title ? wordWidth(row.title, 16) : 0;
  return {
    height: BAND_PAD + (first + lanes) * LANE + (placed.length ? BRACKET : 0),
    title: row.title ? { key: 'title', lines: [row.title], size: 16, middle: 0, long: false, top: BAND_PAD, box: { x0: inset, x1: inset + titleWidth, y0: BAND_PAD, y1: BAND_PAD + 24 } } : undefined,
    names: placed.map((p) => ({ key: p.s.key, lines: p.lines, size: p.size, middle: p.s.middle, long: p.s.long, top: laneTop(p.lane), box: { ...p.x, y0: laneTop(p.lane), y1: laneTop(p.lane) + p.lines.length * (p.size + 8) } })),
    brackets: placed.map((p) => ({ key: p.s.key, fromPct: p.s.fromPct, toPct: p.s.toPct })),
  };
}

/** A row's words on a narrow chart `width` px wide, with the page's side gutter `inset` px: the band above it and the words on it. */
export function narrowLayout(row: NarrowRow, width: number, inset: number): { band: NarrowBand | null; words: NarrowWord[] } {
  return { band: narrowBand(row, width, inset), words: plotWords(row, width, inset) };
}

/** The band over a narrow chart, shown only at the widths it was placed for (`shown`). */
function Band({ band, shown, color }: { band: NarrowBand; shown: string; color: string }) {
  return (
    <LabelGuard aria-hidden="true" className={`relative w-full overflow-hidden ${shown}`} style={{ height: band.height, background: 'var(--stage)' }}>
      {band.title && (
        <Label priority={0} className={`absolute font-semibold text-stage-ink ${AT_LEFT}`} style={{ top: band.title.top }}>
          {band.title.lines[0]}
        </Label>
      )}
      {band.names.map((n) => (
        <Centred key={n.key} at={n.middle} style={{ top: n.top }}>
          <Label size={n.size} priority={n.long ? 1 : 3} className="text-center font-semibold text-stage-ink">
            <Lines lines={n.lines} />
          </Label>
        </Centred>
      ))}
      {/* Each stretch's bracket reaches down to the chart, from its first hour to its last. */}
      {band.brackets.map((b) => (
        <span key={b.key} data-bracket="" aria-hidden="true" className={`absolute bottom-0 h-[7px] border-x-2 border-t-2`} style={{ left: `${b.fromPct}%`, right: `${100 - b.toPct}%`, borderColor: color, opacity: 0.75 }} />
      ))}
    </LabelGuard>
  );
}

/**
 * A word placed on a narrow chart: a sunset's or sunrise's in the body's colour, its lines towards its mark, or
 * centred over or under it on a stem in that colour; or a height line's at an edge.
 */
function NarrowLabel({ word, color }: { word: NarrowWord; color: string }) {
  if ('edge' in word.place) {
    return (
      <Label priority={word.priority} plate className={`absolute ${word.place.edge === 'left' ? AT_LEFT : AT_RIGHT}`} style={{ top: word.top }}>
        {word.lines[0]}
      </Label>
    );
  }
  if ('over' in word.place) {
    const { at, from } = word.place, { y0, y1 } = word.stem!;
    return (
      <>
        <span data-stem="" aria-hidden="true" className={`absolute w-0.5 -translate-x-1/2`} style={{ left: `${at}%`, top: y0, height: y1 - y0, background: color }} />
        <Label size={word.size} priority={word.priority} plate className={`absolute text-center font-semibold`} style={{ top: word.top, color, left: `calc(${at}% ${from < 0 ? '-' : '+'} ${Math.abs(from)}px)` }}>
          <Lines lines={word.lines} />
        </Label>
      </>
    );
  }
  const { after: right, at } = word.place;
  return (
    <Label
      size={word.size}
      priority={word.priority}
      plate
      className={`absolute font-semibold ${right ? '' : 'text-right'}`}
      style={{ top: word.top, color, ...(right ? { left: `calc(${at}% + 12px)` } : { right: `calc(${100 - at}% + 12px)` }) }}
    >
      <Lines lines={word.lines} />
    </Label>
  );
}

/**
 * One row of the time chart as a static picture: the body's height (solid while visible, dotted while
 * hidden) against the hills in its direction. With `az` the compass direction of the body runs along
 * the top; `ticks` writes the days along the bottom. `fitHills` makes room for the whole of the
 * hills instead of letting tall ones run off the top; `title` names the row in its top left corner.
 * `pxPerDeg` makes the row as tall as its range needs at that many pixels a degree, so rows drawn
 * together share one height scale. On a narrow chart the words are placed for its width (narrowLayout):
 * the row's name and the hidden stretches' words in a band above it, the rest on it.
 */
export function SkyRow({
  el,
  hill,
  visible,
  az,
  startUtc,
  body,
  caption,
  height = 200,
  ticks = true,
  fitHills = false,
  title,
  pxPerDeg,
  scaleStep,
}: RowProps & { caption: string }) {
  const id = useId();
  const hours = el.length;
  const { top, range, rowHeight, total, g } = rowFrame({ el, hill, visible, az, startUtc, body, height, ticks, fitHills, pxPerDeg });
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const subject = body === 'sun' ? 'The Sun' : 'Earth';
  const gap = body === 'sun' ? 'Night' : 'No contact';
  /** Centre of an hour, in percent of the width. */
  const pct = (hour: number) => ((hour + 0.5) / hours) * 100;
  // The words of a narrow chart at each width they are placed for: worked out once, and kept between renders.
  const narrow = useMemo(() => {
    const row = narrowRowOf({ el, hill, visible, az, startUtc, body, height, ticks, fitHills, title, pxPerDeg, scaleStep });
    return NARROW.map((f) => ({ ...f, ...narrowLayout(row, f.width, f.inset) }));
  }, [el, hill, visible, az, startUtc, body, height, ticks, fitHills, title, pxPerDeg, scaleStep]);

  // The longest hidden stretch gets the full sentence on the picture and in the description.
  const dark = longestHidden(visible);
  const span = dark ? spanWords(dark.to - dark.from) : '';
  const fromStart = dark?.from === 0;
  const toEnd = dark ? dark.to >= hours : false;
  let said = `${subject} stays in view.`;
  if (dark && fromStart && toEnd) said = `${subject} is hidden the whole time.`;
  else if (dark && fromStart) said = `${subject} is hidden from the start until ${dayMonth(startUtc, dark.to)}, ${span}.`;
  else if (dark && toEnd) said = `${subject} is hidden from ${dayMonth(startUtc, dark.from)} to the end, ${span}.`;
  else if (dark) said = `${subject} is hidden from ${dayMonth(startUtc, dark.from)} to ${dayMonth(startUtc, dark.to)}, ${span}.`;
  const reason = dark ? whyHidden(el, hill, dark, who) : '';

  // Words for every hidden stretch, the longest first: the others get a short sentence and their dates
  // only where these do not collide with words already placed (one lane along the top, one along the line).
  const topLane: [number, number][] = [];
  const lineLane: [number, number][] = [];
  const placed: RunWords[] = [];
  const ordered = dark ? [dark, ...hiddenRuns(visible).filter((r) => r.from !== dark.from)] : [];
  for (const run of ordered) {
    const long = run === dark;
    const fromPct = run.from === 0 ? 0 : pct(run.from);
    const toPct = run.to >= hours ? 100 : pct(run.to);
    const middle = ((run.from + run.to) / 2 / hours) * 100;
    const half = long ? LONG_HALF : SHORT_HALF;
    const words = long || (toPct - fromPct >= SHORT_MIN && !overlaps(topLane, middle - half, middle + half));
    if (words) topLane.push([middle - half, middle + half]);
    const sides = eventLabelSides(fromPct, toPct, EVENT_NEED);
    const setAt: [number, number] = sides.set === 'inside' ? [fromPct, fromPct + EVENT_NEED] : [fromPct - EVENT_NEED, fromPct];
    const riseAt: [number, number] = sides.rise === 'inside' ? [toPct - EVENT_NEED, toPct] : [toPct, toPct + EVENT_NEED];
    const set = sides.set && (long || !overlaps(lineLane, ...setAt)) ? sides.set : null;
    if (set) lineLane.push(setAt);
    const rise = sides.rise && (long || !overlaps(lineLane, ...riseAt)) ? sides.rise : null;
    if (rise) lineLane.push(riseAt);
    placed.push({ run, long, words, middle, fromPct, toPct, set, rise });
  }
  /** Just under the body's line at that hour, but never down in the row of dates. */
  const under = (hour: number) => Math.min(g.y(el[hour]) + 14, top + rowHeight - 27);
  const titleTop = top + 6;

  // The words of each height line go to an edge where they meet no other label: the stretch words along
  // the top lane, the sunset and sunrise labels under the line, the title and the compass row.
  const taken: RowBox[] = [];
  for (const p of placed) {
    const half = p.long ? LONG_HALF : SHORT_HALF;
    if (p.words) taken.push({ x0: p.middle - half, x1: p.middle + half, y0: top + 34, y1: top + 60 });
    if (p.set) {
      const [x0, x1] = p.set === 'inside' ? [p.fromPct, p.fromPct + EVENT_NEED] : [p.fromPct - EVENT_NEED, p.fromPct];
      taken.push({ x0, x1, y0: under(p.run.from), y1: under(p.run.from) + 24 });
    }
    if (p.rise) {
      const [x0, x1] = p.rise === 'inside' ? [p.toPct - EVENT_NEED, p.toPct] : [p.toPct, p.toPct + EVENT_NEED];
      taken.push({ x0, x1, y0: under(p.run.to), y1: under(p.run.to) + 24 });
    }
  }
  if (title) taken.push({ x0: 0, x1: 30, y0: titleTop, y1: titleTop + 25 });
  if (az) taken.push({ x0: 0, x1: 100, y0: 0, y1: top });
  const scale = scaleLines(range, rowHeight, scaleStep);
  const scaleSides = scaleWordSides(
    scale.map(({ deg }) => ({ deg, y: g.y(deg) })),
    taken,
    scalePreference(placed[0] ? placed[0].middle : null),
  );
  const days = Math.round(hours / 24);
  const every = days > 45 ? 10 : 5;
  const dayTicks = ticks ? Array.from({ length: Math.floor(days / every) + 1 }, (_, k) => k * every) : [];
  let last = -Infinity;
  const compass = az
    ? compassTicks(az).filter((t) => {
        const p = pct(t.hour);
        if (p < 15 || p > 96 || p - last < 8) return false;
        last = p;
        return true;
      })
    : [];

  return (
    <div className="@container w-full">
      {narrow.map((f) => f.band && <Band key={f.width} band={f.band} shown={f.shown} color={color} />)}
      <LabelGuard role="img" aria-label={`${caption}. ${said}`} className="@container relative w-full overflow-hidden text-stage-ink-2" style={{ height: total, background: 'var(--stage)' }}>
        <svg viewBox={`0 0 ${W} ${total}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
          {g.clipped && (
            <defs>
              <linearGradient id={`${id}-fade`} gradientUnits="userSpaceOnUse" x1={0} y1={top} x2={0} y2={top + FADE}>
                <stop offset={0} stopColor="#fff" stopOpacity={0} />
                <stop offset={1} stopColor="#fff" stopOpacity={1} />
              </linearGradient>
              <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={total}>
                <rect x={0} y={0} width={W} height={total} fill={`url(#${id}-fade)`} />
              </mask>
            </defs>
          )}
          {/* Height lines are solid hairlines: a dotted line means a hidden Sun or Earth. */}
          {scale.map(({ deg }) => (
            <line key={deg} data-height="" x1={0} x2={W} y1={g.y(deg)} y2={g.y(deg)} stroke="var(--stage-ink-2)" strokeOpacity={0.3} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <g mask={g.clipped ? `url(#${id}-mask)` : undefined}>
            <path d={g.hillArea} fill="var(--hill)" />
            <path d={g.hillEdge} fill="none" stroke="var(--hill-edge)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </g>
        </svg>
        {/* The body's line is its own layer, over the hills. */}
        <svg viewBox={`0 0 ${W} ${total}`} preserveAspectRatio="none" aria-hidden="true" className={`absolute inset-0 h-full w-full`}>
          {g.runs.map((r, i) => (
            <polyline key={i} points={r.points} fill="none" stroke={color} strokeWidth={r.visible ? 3.4 : 2.6} strokeDasharray={r.visible ? undefined : '2.5 6'} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {title && (
          <Label priority={0} plate className={`absolute font-semibold text-stage-ink ${AT_LEFT} ${WIDE}`} style={{ top: titleTop }}>
            {title}
          </Label>
        )}
        {az && (
          <Label className={`absolute font-medium text-stage-ink max-lg:hidden ${AT_LEFT}`} style={{ top: 4 }}>
            Direction of {who}
          </Label>
        )}
        {compass.map((t, i) => (
          <Centred key={t.hour} at={pct(t.hour)} className={i % 2 ? 'max-md:hidden' : ''} style={{ top: 4 }}>
            <Label>{t.label}</Label>
          </Centred>
        ))}

        {scale.map(({ deg, words }, i) =>
          scaleSides[i] ? (
            <Label key={deg} priority={4} plate className={`absolute ${scaleSides[i] === 'left' ? AT_LEFT : AT_RIGHT} ${WIDE}`} style={{ top: g.y(deg) - 11 }}>
              {words}
            </Label>
          ) : null,
        )}

        {/* A dot where the body goes behind the hills or comes back. */}
        {g.events.map((e) => (
          <span
            key={e.hour}
            data-event={e.kind}
            aria-hidden="true"
            className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-stage`}
            style={{ left: `${(e.hour / hours) * 100}%`, top: g.y((el[e.hour - 1] + el[e.hour]) / 2), background: color }}
          />
        ))}

        {placed.map((p) => (
          <span key={p.run.from} className={`contents ${WIDE}`}>
            {p.words && (
              <Centred at={p.middle} className={p.long ? '' : '@max-[900px]:hidden'} style={{ top: top + 34 }}>
                <Label size={17} priority={p.long ? 1 : 3} plate className="font-semibold text-stage-ink">
                  {gap} for {spanWords(p.run.to - p.run.from)}
                  {p.long && `: ${reason}`}
                </Label>
              </Centred>
            )}
            {p.set && (
              <Label priority={p.long ? 2 : 3} plate className={`absolute font-semibold`} style={{ top: under(p.run.from), color, ...(p.set === 'inside' ? { left: `calc(${p.fromPct}% + 12px)` } : { right: `calc(${100 - p.fromPct}% + 12px)` }) }}>
                {name} sets {dayMonth(startUtc, p.run.from)}
              </Label>
            )}
            {p.rise && (
              <Label priority={p.long ? 2 : 3} plate className={`absolute font-semibold`} style={{ top: under(p.run.to), color, ...(p.rise === 'inside' ? { right: `calc(${100 - p.toPct}% + 12px)` } : { left: `calc(${p.toPct}% + 12px)` }) }}>
                {name} rises {dayMonth(startUtc, p.run.to)}
              </Label>
            )}
          </span>
        ))}

        {/* On a narrow chart, its own words for the sunsets, sunrises and height lines, placed for its width. */}
        {narrow.map((f) => (
          <span key={f.width} className={`contents ${f.shown}`}>
            {f.words.map((w) => (
              <NarrowLabel key={w.key} word={w} color={color} />
            ))}
          </span>
        ))}

        {dayTicks.map((d, i) => {
          const text = dayMonth(startUtc, d * 24);
          const hide = i % 2 ? 'max-sm:hidden' : '';
          if (d === 0) {
            return (
              <Label key={d} className={`absolute ${AT_LEFT} ${hide}`} style={{ bottom: 3 }}>
                {text}
              </Label>
            );
          }
          if (d * 24 >= hours) {
            return (
              <Label key={d} className={`absolute ${AT_RIGHT} ${hide}`} style={{ bottom: 3 }}>
                {text}
              </Label>
            );
          }
          return (
            <Centred key={d} at={((d * 24) / hours) * 100} className={hide} style={{ bottom: 3 }}>
              <Label>{text}</Label>
            </Centred>
          );
        })}
      </LabelGuard>
    </div>
  );
}
