'use client';
import { useMemo } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { horizonGeometry } from '@/lib/viz/horizon';
import { DottedSwatch, HillSwatch, Swatch } from './Swatches';

const W = 1000;
const H = 240;
const COMPASS: [number, string][] = [
  [0, 'north'],
  [90, 'east'],
  [180, 'south'],
  [270, 'west'],
  [360, 'north'],
];

/**
 * The 360° picture of the horizon around the site: the hills all round in grey, the Sun's and Earth's
 * paths over the period (solid while in view, dotted while hidden), and where both are at the hour of
 * the time bar. North is on the left and again on the right.
 */
export function HorizonView({ mask, series, cursor, lat }: { mask: ArrayLike<number>; series: Series; cursor: number; lat: number }) {
  const g = useMemo(() => horizonGeometry(mask, series, W, H), [mask, series]);
  const hour = Math.min(series.hours - 1, Math.max(0, cursor));
  const marker = (az: number, el: number) => ({ left: `${(g.x(az) / W) * 100}%`, top: `${(g.y(el) / H) * 100}%` });
  // The height scale: the horizon at 0°, and the highest whole degree with room for its words.
  const top = Math.floor(g.maxDeg - 0.5);
  const scale = [
    ...(g.minDeg < 0 && g.maxDeg > 0 ? [{ deg: 0, words: 'horizon (0°)' }] : []),
    ...(top > 0 ? [{ deg: top, words: `${top}°` }] : []),
  ];
  return (
    <figure className="m-0">
      <div role="img" aria-label="The horizon all round the site, with the paths of the Sun and Earth over these days" className="stage relative w-full overflow-hidden" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
          <path d={g.skyline} fill="var(--hill)" stroke="var(--hill-edge)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
          {scale.map((s) => (
            <line key={s.deg} x1={0} x2={W} y1={g.y(s.deg)} y2={g.y(s.deg)} stroke="var(--stage-ink)" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="5 6" vectorEffect="non-scaling-stroke" />
          ))}
          {g.earth.map((r, i) => (
            <polyline key={`e${i}`} points={r.points} fill="none" stroke="var(--stage-earth)" strokeWidth={r.visible ? 3 : 2.4} strokeDasharray={r.visible ? undefined : '2.5 6'} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {g.sun.map((r, i) => (
            <polyline key={`s${i}`} points={r.points} fill="none" stroke="var(--stage-sun)" strokeWidth={r.visible ? 3 : 2.4} strokeDasharray={r.visible ? undefined : '2.5 6'} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {scale.map((s) => (
          <span key={s.deg} aria-hidden="true" className="absolute left-2 -translate-y-1/2 whitespace-nowrap rounded-[5px] bg-stage/85 px-1.5 text-[14px] leading-snug text-stage-ink" style={{ top: `${(g.y(s.deg) / H) * 100}%` }}>
            {s.words}
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
          dotted while hidden
        </li>
        <li className="flex items-center gap-2">
          <HillSwatch />
          the hills all round
        </li>
      </ul>
      <figcaption className="mt-2 text-[15px] text-ink-2">
        The whole horizon around the site, from north through east, south and west. Over these days the Sun moves from {lat < 0 ? 'right to left' : 'left to right'} along its path.
      </figcaption>
    </figure>
  );
}
