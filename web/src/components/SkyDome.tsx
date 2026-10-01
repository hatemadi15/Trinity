'use client';
import { useMemo } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { domeProject, domeRadius, groundPath, skylinePath, trackPath } from '@/lib/viz/dome';

const R = 260;
const VIEW = 600;
const RINGS = [-5, 0, 5, 10, 30, 60];

function fmtAzEl(az: number, el: number): string {
  return `azimuth ${az.toFixed(0)}°, elevation ${el.toFixed(1)}°`;
}

export function SkyDome({
  mask,
  series,
  cursor,
  size = '100%',
}: {
  mask: ArrayLike<number>;
  series: Series;
  cursor: number;
  size?: number | string;
}) {
  const ground = useMemo(() => groundPath(mask, R), [mask]);
  const skyline = useMemo(() => skylinePath(mask, R), [mask]);
  const sunTrack = useMemo(() => trackPath(series.sunAz, series.sunEl, R, 0, series.hours), [series]);
  const earthTrack = useMemo(() => trackPath(series.earthAz, series.earthEl, R, 0, series.hours), [series]);
  const sun = domeProject(series.sunAz[cursor], series.sunEl[cursor], R);
  const earth = domeProject(series.earthAz[cursor], series.earthEl[cursor], R);
  const lit = series.sunFraction[cursor] > 0;
  const earthUp = series.earthVisible[cursor] === 1;
  const label = `Sky dome. Sun ${fmtAzEl(series.sunAz[cursor], series.sunEl[cursor])}, ${lit ? 'above' : 'below'} the skyline. Earth ${fmtAzEl(series.earthAz[cursor], series.earthEl[cursor])}, ${earthUp ? 'in view' : 'hidden'}.`;
  const compass: [string, number, number][] = [
    ['N', 0, -R - 16],
    ['E', R + 16, 0],
    ['S', 0, R + 20],
    ['W', -R - 16, 0],
  ];
  const halo = {
    paintOrder: 'stroke' as const,
    stroke: 'var(--sky)',
    strokeWidth: 4,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className="block"
    >
      <circle r={R} fill="var(--sky)" />
      {RINGS.map((el) => (
        <circle
          key={el}
          r={domeRadius(el, R)}
          fill="none"
          stroke="var(--stage-line)"
          strokeDasharray={el === 0 ? undefined : '3 5'}
        />
      ))}
      <path data-part="ground" d={ground} fill="var(--terrain)" fillRule="evenodd" />
      <path data-part="skyline" d={skyline} fill="none" stroke="var(--terrain-edge)" strokeWidth={1.5} />
      <path data-part="sun-track" d={sunTrack} fill="none" stroke="var(--stage-sun)" strokeWidth={2} strokeOpacity={0.85} />
      <path data-part="earth-track" d={earthTrack} fill="none" stroke="var(--stage-earth)" strokeWidth={2} strokeOpacity={0.85} />
      <circle
        data-part="earth-now"
        cx={earth.x}
        cy={earth.y}
        r={7}
        fill="var(--stage-earth)"
        stroke="var(--sky)"
        strokeWidth={2}
        opacity={earthUp ? 1 : 0.45}
      />
      <circle
        data-part="sun-now"
        cx={sun.x}
        cy={sun.y}
        r={9}
        fill={lit ? 'var(--stage-sun)' : 'var(--stage-sun)'}
        stroke="var(--sky)"
        strokeWidth={2}
        opacity={lit ? 1 : 0.45}
      />
      {RINGS.map((el) => (
        <text key={el} x={6} y={-domeRadius(el, R) - 4} fill="var(--stage-ink-2)" fontSize={16} style={halo}>
          {el === 0 ? 'horizon' : `${el}°`}
        </text>
      ))}
      <text x={sun.x + 14} y={sun.y + 5} fill="var(--stage-sun)" fontSize={16} style={halo}>
        Sun
      </text>
      <text x={earth.x + 12} y={earth.y + 5} fill="var(--stage-earth)" fontSize={16} style={halo}>
        Earth
      </text>
      {compass.map(([t, x, y]) => (
        <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="var(--stage-ink-2)" fontSize={16}>
          {t}
        </text>
      ))}
    </svg>
  );
}
