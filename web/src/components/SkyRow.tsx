import { useId, type CSSProperties, type ReactNode } from 'react';
import { dayMonth, spanWords } from '@/lib/viz/format';
import { compassTicks, eventLabelSides, hiddenBy, hiddenRuns, longestHidden, rowGeometry, rowRange, scaleLabelSide, scaleLines, type LabelSide } from '@/lib/viz/skyrow';

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
function Label({ children, size = 16, plate = false, className = '', style }: { children: ReactNode; size?: number; plate?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span data-label="" className={`whitespace-nowrap ${plate ? 'rounded-[5px] bg-stage/80 px-1.5' : ''} ${className}`} style={{ fontSize: size, lineHeight: `${size + 8}px`, ...style }}>
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

/**
 * One row of the time chart as a static picture: the body's height (solid while visible, dotted while
 * hidden) against the hills in its direction. With `az` the compass direction of the body runs along
 * the top; `ticks` writes the days along the bottom; `reveal` draws the line once from left to right
 * when the page opens and then shows the words about it. `fitHills` makes room for the whole of the
 * hills instead of letting tall ones run off the top; `title` names the row in its top left corner.
 * `pxPerDeg` makes the row as tall as its range needs at that many pixels a degree, so rows drawn
 * together share one height scale.
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
  reveal = false,
  fitHills = false,
  title,
  pxPerDeg,
  scaleStep,
}: {
  el: ArrayLike<number>;
  hill: ArrayLike<number>;
  visible: ArrayLike<number | boolean>;
  az?: ArrayLike<number>;
  startUtc: string;
  body: 'sun' | 'earth';
  caption: string;
  height?: number;
  ticks?: boolean;
  reveal?: boolean;
  fitHills?: boolean;
  title?: string;
  pxPerDeg?: number;
  /** The spacing of the height lines, when rows drawn together must agree on it. */
  scaleStep?: 5 | 10;
}) {
  const id = useId();
  const hours = el.length;
  const top = az ? 30 : 8;
  const range = pxPerDeg ? rowRange(el, hill, { headroom: 1, fitHills }) : rowRange(el, hill, { headroom: 4, headroomShare: 0.36, fitHills });
  const rowHeight = pxPerDeg ? (range.max - range.min) * pxPerDeg : height;
  const total = top + rowHeight + (ticks ? 30 : 8);
  const g = rowGeometry(el, hill, visible, { x: 0, y: top, w: W, h: rowHeight }, range);
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const subject = body === 'sun' ? 'The Sun' : 'Earth';
  const gap = body === 'sun' ? 'Night' : 'No contact';
  const after = reveal ? 'reveal-after' : '';
  /** Centre of an hour, in percent of the width. */
  const pct = (hour: number) => ((hour + 0.5) / hours) * 100;

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
  // The Sun behind a ridge and Earth below a flat horizon call for different words.
  const reason = dark && hiddenBy(el, hill, dark.from, Math.min(dark.to, hours)) === 'horizon' ? `${who} is below the horizon` : `the hills stand higher than ${who}`;

  // Words for every hidden stretch, the longest first: the others get a short sentence and their dates
  // only where these do not collide with words already placed (one lane along the top, one along the line).
  const topLane: [number, number][] = [];
  const lineLane: [number, number][] = [];
  const others: [number, number][] = [];
  const placed: RunWords[] = [];
  const ordered = dark ? [dark, ...hiddenRuns(visible).filter((r) => r.from !== dark.from)] : [];
  for (const run of ordered) {
    const long = run === dark;
    const fromPct = run.from === 0 ? 0 : pct(run.from);
    const toPct = run.to >= hours ? 100 : pct(run.to);
    const middle = ((run.from + run.to) / 2 / hours) * 100;
    const half = long ? LONG_HALF : SHORT_HALF;
    const words = long || (toPct - fromPct >= SHORT_MIN && !overlaps(topLane, middle - half, middle + half));
    if (words) {
      topLane.push([middle - half, middle + half]);
      if (!long) others.push([middle - half, middle + half]);
    }
    const sides = eventLabelSides(fromPct, toPct, EVENT_NEED);
    const setAt: [number, number] = sides.set === 'inside' ? [fromPct, fromPct + EVENT_NEED] : [fromPct - EVENT_NEED, fromPct];
    const riseAt: [number, number] = sides.rise === 'inside' ? [toPct - EVENT_NEED, toPct] : [toPct, toPct + EVENT_NEED];
    const set = sides.set && (long || !overlaps(lineLane, ...setAt)) ? sides.set : null;
    if (set) {
      lineLane.push(setAt);
      if (!long) others.push(setAt);
    }
    const rise = sides.rise && (long || !overlaps(lineLane, ...riseAt)) ? sides.rise : null;
    if (rise) {
      lineLane.push(riseAt);
      if (!long) others.push(riseAt);
    }
    placed.push({ run, long, words, middle, fromPct, toPct, set, rise });
  }
  const main = placed[0];
  const scaleSide = scaleLabelSide(main ? { fromPct: main.fromPct, toPct: main.toPct, set: main.set, rise: main.rise } : null, EVENT_NEED, others);
  /** Just under the body's line at that hour, but never down in the row of dates. */
  const under = (hour: number) => Math.min(g.y(el[hour]) + 14, top + rowHeight - 27);

  const scale = scaleLines(range, rowHeight, scaleStep);
  /** The title sits in the top left corner; height-line words on that side keep clear of it. */
  const titleTop = top + 6;
  const clearOfTitle = (y: number) => !title || scaleSide !== 'left' || y - 11 > titleTop + 25;
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
    <div role="img" aria-label={`${caption}. ${said}`} className="relative w-full overflow-hidden text-stage-ink-2" style={{ height: total, background: 'var(--stage)' }}>
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
        {scale.map(({ deg }) => (
          <line key={deg} x1={0} x2={W} y1={g.y(deg)} y2={g.y(deg)} stroke="var(--stage-ink-2)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />
        ))}
        <g mask={g.clipped ? `url(#${id}-mask)` : undefined}>
          <path d={g.hillArea} fill="var(--hill)" />
          <path d={g.hillEdge} fill="none" stroke="var(--hill-edge)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {/* The body's line is its own layer, so that it can be drawn from left to right when the page opens. */}
      <svg viewBox={`0 0 ${W} ${total}`} preserveAspectRatio="none" aria-hidden="true" className={`absolute inset-0 h-full w-full ${reveal ? 'reveal-line' : ''}`}>
        {g.runs.map((r, i) => (
          <polyline key={i} points={r.points} fill="none" stroke={color} strokeWidth={r.visible ? 3.4 : 2.2} strokeDasharray={r.visible ? undefined : '2 7'} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {title && (
        <Label plate className={`absolute font-semibold text-stage-ink ${AT_LEFT}`} style={{ top: titleTop }}>
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

      {scaleSide &&
        scale
          .filter(({ deg }) => clearOfTitle(g.y(deg)))
          .map(({ deg, words }) => (
            <Label key={deg} plate className={`absolute ${scaleSide === 'left' ? AT_LEFT : AT_RIGHT}`} style={{ top: g.y(deg) - 11 }}>
              {words}
            </Label>
          ))}

      {/* A dot where the body goes behind the hills or comes back. */}
      {g.events.map((e) => (
        <span
          key={e.hour}
          data-event={e.kind}
          aria-hidden="true"
          className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-stage ${after}`}
          style={{ left: `${(e.hour / hours) * 100}%`, top: g.y((el[e.hour - 1] + el[e.hour]) / 2), background: color }}
        />
      ))}

      {placed.map((p) => (
        <span key={p.run.from} className="contents">
          {p.words && (
            <Centred at={p.middle} className={`${after} ${p.long ? '' : 'max-md:hidden'}`} style={{ top: top + 34 }}>
              <Label size={17} plate className="font-semibold text-stage-ink">
                {gap} for {spanWords(p.run.to - p.run.from)}
                {p.long && <span className="max-md:hidden">: {reason}</span>}
              </Label>
            </Centred>
          )}
          {p.set && (
            <Label plate className={`absolute font-semibold ${after}`} style={{ top: under(p.run.from), color, ...(p.set === 'inside' ? { left: `calc(${p.fromPct}% + 12px)` } : { right: `calc(${100 - p.fromPct}% + 12px)` }) }}>
              <span className="max-lg:hidden">{name} sets </span>
              {dayMonth(startUtc, p.run.from)}
            </Label>
          )}
          {p.rise && (
            <Label plate className={`absolute font-semibold ${after}`} style={{ top: under(p.run.to), color, ...(p.rise === 'inside' ? { right: `calc(${100 - p.toPct}% + 12px)` } : { left: `calc(${p.toPct}% + 12px)` }) }}>
              <span className="max-lg:hidden">{name} rises </span>
              {dayMonth(startUtc, p.run.to)}
            </Label>
          )}
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
    </div>
  );
}
