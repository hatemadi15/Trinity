import type { CSSProperties, ReactNode } from 'react';
import { dayMonth, spanWords } from '@/lib/viz/format';
import { compassTicks, eventLabelSides, longestHidden, rowGeometry, rowRange } from '@/lib/viz/skyrow';

/** Width of the drawing's own coordinates. The drawing stretches sideways to fill its container; its height is fixed. */
const W = 1216;
/** The height line drawn across the sky for scale, in degrees. */
const SCALE_DEG = 5;

/**
 * A label on the picture. Labels are page text laid over the drawing, not text inside it, so they keep
 * their size when the chart gets narrower. A solid plate stands behind the ones that sit on the hills.
 */
function Label({ children, size = 14, plate = false, className = '', style }: { children: ReactNode; size?: number; plate?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span data-label="" className={`whitespace-nowrap ${plate ? 'rounded-[5px] bg-stage/80 px-1.5 font-semibold' : ''} ${className}`} style={{ fontSize: size, lineHeight: `${size + 8}px`, ...style }}>
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
 * One row of the time chart as a static picture: the body's height (solid while visible, dotted while
 * hidden) against the hills in its direction, with the days along the bottom and, when `az` is given,
 * the compass direction of the body along the top.
 */
export function SkyRow({
  el,
  hill,
  visible,
  az,
  startUtc,
  body,
  caption,
  height = 150,
}: {
  el: ArrayLike<number>;
  hill: ArrayLike<number>;
  visible: ArrayLike<number | boolean>;
  az?: ArrayLike<number>;
  startUtc: string;
  body: 'sun' | 'earth';
  caption: string;
  height?: number;
}) {
  const hours = el.length;
  const top = az ? 26 : 6;
  const total = top + height + 28;
  const range = rowRange(el, hill);
  const g = rowGeometry(el, hill, visible, { x: 0, y: top, w: W, h: height }, range);
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const who = body === 'sun' ? 'the Sun' : 'Earth';
  const subject = body === 'sun' ? 'The Sun' : 'Earth';
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
  const sides = dark ? eventLabelSides(fromStart ? 0 : pct(dark.from), toEnd ? 100 : pct(dark.to)) : { set: null, rise: null };
  /** Just under the body's line at that hour, but never down in the row of dates. */
  const under = (hour: number) => Math.min(g.y(el[hour]) + 14, top + height - 26);

  const showScale = SCALE_DEG < range.max - 0.5 && SCALE_DEG > range.min + 0.5;
  const days = Math.round(hours / 24);
  const every = days > 45 ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(days / every) + 1 }, (_, k) => k * every);
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
        {showScale && <line x1={0} x2={W} y1={g.y(SCALE_DEG)} y2={g.y(SCALE_DEG)} stroke="var(--stage-line)" strokeWidth={1} strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />}
        <path d={g.hillArea} fill="var(--hill)" />
        <path d={g.hillEdge} fill="none" stroke="var(--hill-edge)" strokeWidth={1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {g.runs.map((r, i) => (
          <polyline key={i} points={r.points} fill="none" stroke={color} strokeWidth={r.visible ? 3.4 : 2} strokeDasharray={r.visible ? undefined : '2 7'} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {az && (
        <Label className="absolute left-1 font-medium text-stage-ink max-lg:hidden" style={{ top: 2 }}>
          Direction of {who}
        </Label>
      )}
      {compass.map((t, i) => (
        <Centred key={t.hour} at={pct(t.hour)} className={i % 2 ? 'max-md:hidden' : ''} style={{ top: 2 }}>
          <Label>{t.label}</Label>
        </Centred>
      ))}

      {showScale && (
        <Label className="absolute" style={{ top: g.y(SCALE_DEG) - 11, ...(middle > 50 ? { left: 6 } : { right: 6 }) }}>
          {SCALE_DEG}° up
        </Label>
      )}

      {dark && (
        <Centred at={middle} style={{ top: top + 11 }}>
          <Label size={16} plate className="text-stage-ink">
            {body === 'sun' ? 'Night' : 'No contact'} for {span}
            <span className="max-md:hidden">: the hills stand higher than {who}</span>
          </Label>
        </Centred>
      )}
      {dark && sides.set && (
        <Label size={15} plate className="absolute" style={{ top: under(dark.from), color, ...(sides.set === 'inside' ? { left: `calc(${pct(dark.from)}% + 12px)` } : { right: `calc(${100 - pct(dark.from)}% + 12px)` }) }}>
          <span className="max-lg:hidden">{name} sets </span>
          {dayMonth(startUtc, dark.from)}
        </Label>
      )}
      {dark && sides.rise && (
        <Label size={15} plate className="absolute" style={{ top: under(dark.to), color, ...(sides.rise === 'inside' ? { right: `calc(${100 - pct(dark.to)}% + 12px)` } : { left: `calc(${pct(dark.to)}% + 12px)` }) }}>
          <span className="max-lg:hidden">{name} rises </span>
          {dayMonth(startUtc, dark.to)}
        </Label>
      )}

      {ticks.map((d, i) => {
        const text = dayMonth(startUtc, d * 24);
        const hide = i % 2 ? 'max-sm:hidden' : '';
        if (d === 0) {
          return (
            <Label key={d} className={`absolute left-1 ${hide}`} style={{ bottom: 3 }}>
              {text}
            </Label>
          );
        }
        if (d * 24 >= hours) {
          return (
            <Label key={d} className={`absolute right-1 ${hide}`} style={{ bottom: 3 }}>
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
