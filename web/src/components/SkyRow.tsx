import { useId, type CSSProperties, type ReactNode } from 'react';
import { dayMonth, spanWords } from '@/lib/viz/format';
import { compassTicks, eventLabelSides, longestHidden, rowGeometry, rowRange, scaleLabelSide } from '@/lib/viz/skyrow';

/** Width of the drawing's own coordinates. The drawing stretches sideways to fill its container; its height is fixed. */
const W = 1216;
/** The height lines drawn across the sky for scale, in degrees, with the words beside them. */
const SCALE: [number, string][] = [
  [5, '5° up'],
  [0, 'level ground'],
];
/** Hills that run off the top of the row fade out over this many pixels, which reads as "continues". */
const FADE = 40;
/** Labels at the sides keep this distance from the edge. A chart that runs from edge to edge of the window sets --chart-inset to the page gutter. */
const AT_LEFT = 'left-[var(--chart-inset,10px)]';
const AT_RIGHT = 'right-[var(--chart-inset,10px)]';

/**
 * A label on the picture. Labels are page text laid over the drawing, not text inside it, so they keep
 * their size when the chart gets narrower. A solid plate stands behind the ones that can sit on the hills.
 */
function Label({ children, size = 15, plate = false, className = '', style }: { children: ReactNode; size?: number; plate?: boolean; className?: string; style?: CSSProperties }) {
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
    <span className={`label-centred absolute ${className}`} style={{ left: `${at - reach}%`, right: `${100 - at - reach}%`, flexDirection: at > 50 ? 'row-reverse' : 'row', ...style }}>
      {children}
    </span>
  );
}

/**
 * What the marks of a sky row mean, each beside a sample drawn the way the chart draws it. The samples
 * sit on small black chips, so the key also reads on a light page. The text takes the colour around it.
 */
export function SkyRowKey({ body, compass = false, className = '' }: { body: 'sun' | 'earth'; compass?: boolean; className?: string }) {
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const chip = 'flex h-5 w-9 shrink-0 items-center justify-center rounded bg-stage';
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-1.5 text-[15px] ${className}`}>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={chip}>
          <svg width={26} height={8}>
            <line x1={2} y1={4} x2={24} y2={4} stroke={color} strokeWidth={3.4} strokeLinecap="round" />
          </svg>
        </span>
        height of {who}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={chip}>
          <svg width={26} height={8}>
            <line x1={2} y1={4} x2={24} y2={4} stroke={color} strokeWidth={2.2} strokeDasharray="2 6" strokeLinecap="round" />
          </svg>
        </span>
        {name} hidden
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={chip}>
          <span className="block h-2.5 w-6 rounded-sm bg-hill" style={{ borderTop: '1.5px solid var(--hill-edge)' }} />
        </span>
        hills in {who}&apos;s direction
      </li>
      {compass && <li>Top row: the compass direction {who} is in on that date.</li>}
    </ul>
  );
}

/**
 * One row of the time chart as a static picture: the body's height (solid while visible, dotted while
 * hidden) against the hills in its direction. With `az` the compass direction of the body runs along
 * the top; `ticks` writes the days along the bottom; `reveal` draws the line once from left to right
 * when the page opens and then shows the words about it.
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
}) {
  const id = useId();
  const hours = el.length;
  const top = az ? 30 : 8;
  const total = top + height + (ticks ? 30 : 8);
  const range = rowRange(el, hill, { headroom: 4, headroomShare: 0.36 });
  const g = rowGeometry(el, hill, visible, { x: 0, y: top, w: W, h: height }, range);
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const subject = body === 'sun' ? 'The Sun' : 'Earth';
  const after = reveal ? 'reveal-after' : '';
  /** Centre of an hour, in percent of the width. */
  const pct = (hour: number) => ((hour + 0.5) / hours) * 100;

  // The longest hidden stretch gets the words on the picture and in the description.
  const dark = longestHidden(visible);
  const span = dark ? spanWords(dark.to - dark.from) : '';
  const fromStart = dark?.from === 0;
  const toEnd = dark ? dark.to >= hours : false;
  let said = `${subject} stays in view.`;
  if (dark && fromStart && toEnd) said = `${subject} is hidden the whole time.`;
  else if (dark && fromStart) said = `${subject} is hidden from the start until ${dayMonth(startUtc, dark.to)}, ${span}.`;
  else if (dark && toEnd) said = `${subject} is hidden from ${dayMonth(startUtc, dark.from)} to the end, ${span}.`;
  else if (dark) said = `${subject} is hidden from ${dayMonth(startUtc, dark.from)} to ${dayMonth(startUtc, dark.to)}, ${span}.`;
  const middle = dark ? ((dark.from + dark.to) / 2 / hours) * 100 : 50;
  const fromPct = dark && !fromStart ? pct(dark.from) : 0;
  const toPct = dark && !toEnd ? pct(dark.to) : 100;
  const sides = dark ? eventLabelSides(fromPct, toPct) : { set: null, rise: null };
  const scaleSide = scaleLabelSide(dark ? { fromPct, toPct, ...sides } : null);
  /** Just under the body's line at that hour, but never down in the row of dates. */
  const under = (hour: number) => Math.min(g.y(el[hour]) + 14, top + height - 27);

  const scale = SCALE.filter(([deg]) => deg < range.max - 0.4 && deg > range.min + 0.4);
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
        {scale.map(([deg]) => (
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
        scale.map(([deg, words]) => (
          <Label key={deg} plate className={`absolute ${scaleSide === 'left' ? AT_LEFT : AT_RIGHT}`} style={{ top: g.y(deg) - 11 }}>
            {words}
          </Label>
        ))}

      {dark && (
        <Centred at={middle} className={after} style={{ top: top + 34 }}>
          <Label size={16} plate className="font-semibold text-stage-ink">
            {body === 'sun' ? 'Night' : 'No contact'} for {span}
            <span className="max-md:hidden">: the hills stand higher than {who}</span>
          </Label>
        </Centred>
      )}
      {dark && sides.set && (
        <Label plate className={`absolute font-semibold ${after}`} style={{ top: under(dark.from), color, ...(sides.set === 'inside' ? { left: `calc(${fromPct}% + 12px)` } : { right: `calc(${100 - fromPct}% + 12px)` }) }}>
          <span className="max-lg:hidden">{name} sets </span>
          {dayMonth(startUtc, dark.from)}
        </Label>
      )}
      {dark && sides.rise && (
        <Label plate className={`absolute font-semibold ${after}`} style={{ top: under(dark.to), color, ...(sides.rise === 'inside' ? { right: `calc(${100 - toPct}% + 12px)` } : { left: `calc(${toPct}% + 12px)` }) }}>
          <span className="max-lg:hidden">{name} rises </span>
          {dayMonth(startUtc, dark.to)}
        </Label>
      )}

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
