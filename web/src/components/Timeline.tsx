'use client';
import { useMemo, useRef } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { binSeries, dayTicks, hourAtX, xAtHour } from '@/lib/viz/timeline';

const LABEL_W = 44;
const H_SUN = 44;
const H_EARTH = 14;
const H_AXIS = 22;
const GAP = 6;

export function Timeline({
  series,
  startUtc,
  cursor,
  onCursor,
  onHover,
  width = 960,
}: {
  series: Series;
  startUtc: string;
  cursor: number;
  onCursor: (hour: number) => void;
  onHover?: (hour: number | null) => void;
  width?: number;
}) {
  const plotW = width - LABEL_W;
  const bins = Math.min(series.hours, Math.max(48, Math.floor(plotW / 3)));
  const binned = useMemo(() => binSeries(series, bins), [series, bins]);
  const ticks = useMemo(() => dayTicks(startUtc, series.hours, plotW), [startUtc, series.hours, plotW]);
  const dragging = useRef(false);
  const height = H_SUN + GAP + H_EARTH + GAP + H_AXIS;
  const binW = plotW / bins;
  const cursorX = xAtHour(cursor, plotW, series.hours);

  const hourOf = (e: React.PointerEvent<SVGRectElement>): number | null => {
    if (!Number.isFinite(e.clientX)) return null;
    const box = e.currentTarget.getBoundingClientRect();
    return hourAtX(((e.clientX - box.left) / box.width) * plotW, plotW, series.hours);
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="group"
      aria-label="Timeline of sunlit hours and Earth visibility"
      className="block select-none"
    >
      <text x={0} y={H_SUN / 2} dominantBaseline="middle" fill="var(--ink-2)" fontSize={12}>
        Sun
      </text>
      <text x={0} y={H_SUN + GAP + H_EARTH / 2} dominantBaseline="middle" fill="var(--ink-2)" fontSize={12}>
        Earth
      </text>
      <g transform={`translate(${LABEL_W} 0)`}>
        <rect x={0} y={0} width={plotW} height={H_SUN} fill="var(--night)" />
        {Array.from(binned.sunMax, (v, b) =>
          v > 0 ? (
            <rect
              key={b}
              data-part="sun-bar"
              x={b * binW}
              y={H_SUN * (1 - v)}
              width={Math.max(1, binW - 0.5)}
              height={H_SUN * v}
              fill={v >= 0.999 ? 'var(--sun-bright)' : 'var(--sun)'}
            />
          ) : null,
        )}
        <rect x={0} y={H_SUN + GAP} width={plotW} height={H_EARTH} fill="var(--night)" />
        {Array.from(binned.earthFrac, (v, b) =>
          v > 0 ? (
            <rect
              key={b}
              data-part="earth-bar"
              x={b * binW}
              y={H_SUN + GAP}
              width={Math.max(1, binW - 0.5)}
              height={H_EARTH}
              fill="var(--earth)"
              opacity={0.35 + 0.65 * v}
            />
          ) : null,
        )}
        {ticks.map((t) => (
          <g key={t.x}>
            <line x1={t.x} x2={t.x} y1={0} y2={H_SUN + GAP + H_EARTH} stroke="var(--canvas)" strokeOpacity={0.6} />
            <text x={t.x + 3} y={height - 6} fill="var(--ink-3)" fontSize={11}>
              {t.label}
            </text>
          </g>
        ))}
        <line
          data-part="cursor"
          x1={cursorX}
          x2={cursorX}
          y1={0}
          y2={H_SUN + GAP + H_EARTH}
          stroke="var(--ink)"
          strokeWidth={2}
        />
        <rect
          data-part="hit"
          x={0}
          y={0}
          width={plotW}
          height={H_SUN + GAP + H_EARTH}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            const h = hourOf(e);
            if (h !== null) onCursor(h);
          }}
          onPointerMove={(e) => {
            const h = hourOf(e);
            if (h === null) return;
            if (dragging.current) onCursor(h);
            else onHover?.(h);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onPointerLeave={() => {
            dragging.current = false;
            onHover?.(null);
          }}
        />
      </g>
    </svg>
  );
}
