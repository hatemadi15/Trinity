'use client';
import type { Series } from '@/lib/engine/metrics';
import { domeProject, groundPath, skylinePath, trackPath } from '@/lib/viz/dome';

const R = 260;
const VIEW = 600;

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
  const sun = domeProject(series.sunAz[cursor], series.sunEl[cursor], R);
  const earth = domeProject(series.earthAz[cursor], series.earthEl[cursor], R);
  const lit = series.sunFraction[cursor] > 0;
  const earthUp = series.earthVisible[cursor] === 1;
  const label = `Sky dome. Sun ${fmtAzEl(series.sunAz[cursor], series.sunEl[cursor])}, ${lit ? 'above' : 'below'} the skyline. Earth ${fmtAzEl(series.earthAz[cursor], series.earthEl[cursor])}, ${earthUp ? 'in view' : 'hidden'}.`;
  const rings = [0, 30, 60];
  const compass: [string, number, number][] = [
    ['N', 0, -R - 16],
    ['E', R + 16, 0],
    ['S', 0, R + 20],
    ['W', -R - 16, 0],
  ];
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
      {rings.map((el) => (
        <circle
          key={el}
          r={(R * (90 - el)) / 100}
          fill="none"
          stroke="var(--line)"
          strokeDasharray={el === 0 ? undefined : '3 5'}
        />
      ))}
      <path data-part="ground" d={groundPath(mask, R)} fill="var(--terrain)" fillRule="evenodd" />
      <path data-part="skyline" d={skylinePath(mask, R)} fill="none" stroke="var(--terrain-edge)" strokeWidth={1.5} />
      <path
        data-part="sun-track"
        d={trackPath(series.sunAz, series.sunEl, R, 0, series.hours)}
        fill="none"
        stroke="var(--sun)"
        strokeWidth={2}
        strokeOpacity={0.85}
      />
      <path
        data-part="earth-track"
        d={trackPath(series.earthAz, series.earthEl, R, 0, series.hours)}
        fill="none"
        stroke="var(--earth)"
        strokeWidth={2}
        strokeOpacity={0.85}
      />
      <circle
        data-part="earth-now"
        cx={earth.x}
        cy={earth.y}
        r={7}
        fill="var(--earth)"
        stroke="var(--sky)"
        strokeWidth={2}
        opacity={earthUp ? 1 : 0.45}
      />
      <circle
        data-part="sun-now"
        cx={sun.x}
        cy={sun.y}
        r={9}
        fill={lit ? 'var(--sun-bright)' : 'var(--sun)'}
        stroke="var(--sky)"
        strokeWidth={2}
        opacity={lit ? 1 : 0.45}
      />
      {compass.map(([t, x, y]) => (
        <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="var(--ink-2)" fontSize={14}>
          {t}
        </text>
      ))}
      <text x={-R} y={R + 40} fill="var(--ink-3)" fontSize={12}>
        rings: horizon, 30°, 60°; rim −10°
      </text>
    </svg>
  );
}
