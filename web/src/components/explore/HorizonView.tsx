'use client';
import { useMemo } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { dayMonth } from '@/lib/viz/format';
import { horizonGeometry } from '@/lib/viz/horizon';
import { DottedSwatch, HillSwatch, Swatch } from './Swatches';

/** The drawing's own units; the picture is stretched to its box. */
const W = 1000;
const H = 240;
/** The picture's height for its width: a quarter of it, but never flatter than 170 px nor taller than 300 px. */
const heightFor = (widthPx: number) => Math.round(Math.max(170, Math.min(300, widthPx * 0.24)));
const COMPASS: [number, string][] = [
  [0, 'north'],
  [90, 'east'],
  [180, 'south'],
  [270, 'west'],
  [360, 'north'],
];

/**
 * The view all round the site: the hills in grey, the Sun's and Earth's paths over the period (solid
 * while in view, dotted while set), and where both are at the hour of the time bar. North is on the
 * left and again on the right. The caption says which way the Sun goes and how much the heights are
 * stretched for the picture's real size.
 */
export function HorizonView({ mask, series, cursor, lat, startUtc }: { mask: ArrayLike<number>; series: Series; cursor: number; lat: number; startUtc?: string }) {
  const g = useMemo(() => horizonGeometry(mask, series, W, H), [mask, series]);
  const { ref, width } = useElementWidth<HTMLDivElement>(W);
  const heightPx = heightFor(width);
  const stretch = heightPx / (g.maxDeg - g.minDeg) / (width / 360);
  const hour = Math.min(series.hours - 1, Math.max(0, cursor));
  const marker = (az: number, el: number) => ({ left: `${(g.x(az) / W) * 100}%`, top: `${(g.y(el) / H) * 100}%` });
  // The height scale: the horizon at 0°, and a round number of degrees far enough below the top for its words.
  const range = g.maxDeg - g.minDeg;
  const step = range > 40 ? 20 : range > 20 ? 10 : range > 8 ? 5 : 2;
  const top = Math.floor((g.maxDeg - 0.15 * range) / step) * step;
  // The Sun's path is dated where it starts and ends: the first above it, the last below.
  const last = series.hours - 1;
  const ends = startUtc
    ? [
        { key: 'start', hour: 0, below: false },
        { key: 'end', hour: last, below: true },
      ].map((e) => {
        const left = (g.x(series.sunAz[e.hour]) / W) * 100;
        return { ...e, left, top: (g.y(series.sunEl[e.hour]) / H) * 100, words: dayMonth(startUtc, e.hour) };
      })
    : [];
  const scale = [
    ...(g.minDeg < 0 && g.maxDeg > 0 ? [{ deg: 0, words: 'horizon (0°)' }] : []),
    ...(top > 0 ? [{ deg: top, words: `${top}°` }] : []),
  ];
  return (
    <figure className="m-0">
      <p className="mb-2 text-[15px] text-ink-2">Left to right is the direction from the site, not time.</p>
      <div ref={ref} role="img" aria-label="The view all round the site: the hills, and the paths of the Sun and Earth over these days" className="stage relative w-full overflow-hidden" style={{ height: heightPx }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
          <path d={g.skyline} fill="var(--hill)" stroke="var(--hill-edge)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          {scale.map((s) => (
            <line key={s.deg} x1={0} x2={W} y1={g.y(s.deg)} y2={g.y(s.deg)} stroke="var(--stage-ink)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
          ))}
          {g.sun.map((r, i) => (
            <polyline key={`s${i}`} points={r.points} fill="none" stroke="var(--stage-sun)" strokeWidth={r.visible ? 3 : 2.4} strokeDasharray={r.visible ? undefined : '2.5 6'} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {/* Earth over the Sun: its small loop stays visible where the paths cross. */}
          {g.earth.map((r, i) => (
            <polyline key={`e${i}`} points={r.points} fill="none" stroke="var(--stage-earth)" strokeWidth={r.visible ? 3 : 2.4} strokeDasharray={r.visible ? undefined : '2.5 6'} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {scale.map((s) => {
          // Words of a line near the bottom sit above it, near the top below it, elsewhere on it.
          const at = (g.y(s.deg) / H) * 100;
          return (
            <span key={s.deg} aria-hidden="true" className="absolute left-2 whitespace-nowrap rounded-[5px] bg-stage/85 px-1.5 text-[14px] leading-snug text-stage-ink" style={{ top: `${at}%`, transform: at > 85 ? 'translateY(-100%)' : at < 15 ? 'translateY(0)' : 'translateY(-50%)' }}>
              {s.words}
            </span>
          );
        })}
        {ends.map((e) => (
          <span
            key={e.key}
            data-path-date={e.key}
            aria-hidden="true"
            className="absolute whitespace-nowrap rounded-[5px] bg-stage/85 px-1.5 text-[14px] leading-snug text-stage-sun"
            style={{ left: `${Math.min(97, Math.max(3, e.left))}%`, top: `${e.top}%`, transform: `translate(${e.left < 10 ? '0' : e.left > 90 ? '-100%' : '-50%'}, ${e.below ? '35%' : '-135%'})` }}
          >
            {e.words}
          </span>
        ))}
        <span data-marker="earth" aria-hidden="true" className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-stage bg-stage-earth" style={marker(series.earthAz[hour], series.earthEl[hour])} />
        <span data-marker="sun" aria-hidden="true" className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-stage bg-stage-sun" style={marker(series.sunAz[hour], series.sunEl[hour])} />
      </div>
      <div aria-hidden="true" className="relative mt-1 h-6 text-[15px] text-ink-2">
        {COMPASS.map(([az, word], i) => (
          <span key={i} data-compass="" className="absolute whitespace-nowrap" style={az === 0 ? { left: 0 } : az === 360 ? { right: 0 } : { left: `${(az / 360) * 100}%`, transform: 'translateX(-50%)' }}>
            {word}
          </span>
        ))}
      </div>
      <ul aria-label="Key" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-ink-2">
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-sun)" />
          the Sun&apos;s path
        </li>
        <li className="flex items-center gap-2">
          <Swatch color="var(--stage-earth)" />
          Earth&apos;s path
        </li>
        <li className="flex items-center gap-2">
          <DottedSwatch />
          dotted while set
        </li>
        <li className="flex items-center gap-2">
          <HillSwatch />
          the hills all round
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="flex h-5 w-9 shrink-0 items-center justify-center gap-1.5 rounded bg-stage">
            <span className="h-2.5 w-2.5 rounded-full bg-stage-sun" />
            <span className="h-2.5 w-2.5 rounded-full bg-stage-earth" />
          </span>
          the Sun and Earth at the time bar&apos;s hour
        </li>
      </ul>
      <figcaption className="mt-2 text-[15px] text-ink-2">
        The view all round the site, from north through east, south and west.{' '}
        {lat < 0
          ? 'From here the Sun goes once round the sky in a month, passing through the north at both ends of the picture, so it moves from right to left.'
          : 'From here the Sun rises in the east, passes through the south and sets in the west, so it moves from left to right.'}{' '}
        Earth stays in one part of the sky and only wobbles. {stretch >= 1.5 ? `Heights are stretched about ${Math.round(stretch)} times.` : 'Heights are drawn to scale.'}
      </figcaption>
    </figure>
  );
}
