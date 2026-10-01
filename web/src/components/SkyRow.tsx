import { dayMonth, spanWords } from '@/lib/viz/format';
import { compassTicks, plateWidth, rowGeometry, rowRange } from '@/lib/viz/skyrow';

const FONT = 'var(--font-plex), "IBM Plex Sans", system-ui, sans-serif';

/** A label on the picture with a solid plate behind it (outlined text read as smudged in the blind test). */
export function Plate({ x, y, text, anchor = 'middle', color = 'var(--stage-ink)', size = 15, weight = 600 }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; color?: string; size?: number; weight?: number }) {
  const w = plateWidth(text, size);
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w + 6 : x - 6;
  return (
    <g>
      <rect x={left} y={y - size + 1} width={w} height={size + 8} rx={5} fill="var(--stage)" fillOpacity={0.82} />
      <text x={x} y={y + 2} textAnchor={anchor} fill={color} fontSize={size} fontWeight={weight} fontFamily={FONT}>
        {text}
      </text>
    </g>
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
  width = 1216,
  height = 150,
}: {
  el: ArrayLike<number>;
  hill: ArrayLike<number>;
  visible: ArrayLike<number | boolean>;
  az?: ArrayLike<number>;
  startUtc: string;
  body: 'sun' | 'earth';
  caption: string;
  width?: number;
  height?: number;
}) {
  const hours = el.length;
  const top = az ? 26 : 6;
  const box = { x: 0, y: top, w: width, h: height };
  const g = rowGeometry(el, hill, visible, box, rowRange(el, hill));
  const color = body === 'sun' ? 'var(--stage-sun)' : 'var(--stage-earth)';
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const total = top + height + 28;
  // The longest hidden stretch, for the words on the picture and the description.
  let dark: { from: number; to: number } | null = null;
  for (let i = 0; i < g.events.length; i++) {
    if (g.events[i].kind !== 'set') continue;
    const to = g.events[i + 1]?.hour ?? hours;
    if (!dark || to - g.events[i].hour > dark.to - dark.from) dark = { from: g.events[i].hour, to };
  }
  const label = dark
    ? `${caption}. ${name === 'Sun' ? 'The Sun' : 'Earth'} is hidden from ${dayMonth(startUtc, dark.from)} to ${dayMonth(startUtc, dark.to)}, ${spanWords(dark.to - dark.from)}.`
    : `${caption}. ${name === 'Sun' ? 'The Sun' : 'Earth'} stays in view.`;
  const days = Math.round(hours / 24);
  const every = days > 45 ? 10 : 5;
  let lastTick = -Infinity;
  return (
    <svg viewBox={`0 0 ${width} ${total}`} width="100%" role="img" aria-label={label} className="block">
      <rect x={0} y={0} width={width} height={total} fill="var(--stage)" />
      {az &&
        compassTicks(az).map((t) => {
          const x = g.x(t.hour);
          if (x - lastTick < 96 || x < 60 || x > width - 60) return null;
          lastTick = x;
          return (
            <text key={t.hour} x={x} y={17} textAnchor="middle" fill="var(--stage-ink-2)" fontSize={14} fontFamily={FONT}>
              {t.label}
            </text>
          );
        })}
      <path d={g.hillArea} fill="var(--hill)" />
      <path d={g.hillEdge} fill="none" stroke="var(--hill-edge)" strokeWidth={1.4} strokeLinejoin="round" />
      {g.runs.map((r, i) => (
        <polyline key={i} points={r.points} fill="none" stroke={color} strokeWidth={r.visible ? 3.4 : 2} strokeDasharray={r.visible ? undefined : '2 7'} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {dark && (
        <>
          <Plate x={g.x((dark.from + dark.to) / 2)} y={top + 26} text={`Night: the hills stand higher than the ${name} for ${spanWords(dark.to - dark.from)}`} size={16} />
          <Plate x={g.x(dark.from) + 12} y={g.y(el[dark.from]) + 28} text={`${name} sets ${dayMonth(startUtc, dark.from)}`} anchor="start" color={color} />
          {dark.to < hours && <Plate x={g.x(dark.to) - 12} y={g.y(el[dark.to]) + 28} text={`${name} rises ${dayMonth(startUtc, dark.to)}`} anchor="end" color={color} />}
        </>
      )}
      {Array.from({ length: Math.floor(days / every) + 1 }, (_, k) => k * every).map((d) => (
        <text key={d} x={d === 0 ? 4 : Math.min(g.x(d * 24) - width / hours / 2, width - 4)} y={total - 8} textAnchor={d === 0 ? 'start' : d * 24 >= hours ? 'end' : 'middle'} fill="var(--stage-ink-2)" fontSize={14} fontFamily={FONT}>
          {dayMonth(startUtc, d * 24)}
        </text>
      ))}
    </svg>
  );
}
