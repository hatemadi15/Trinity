'use client';
import { useMemo, useRef } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { binSeries, dayTicks, hourAtX, xAtHour } from '@/lib/viz/timeline';

const H_SUN = 44;
const H_EARTH = 14;
const H_AXIS = 22;
const GAP = 6;

export function Timeline({
  series,
  startUtc,
  cursor,
  onCursor,
  width = 960,
}: {
  series: Series;
  startUtc: string;
  cursor: number;
  onCursor: (hour: number) => void;
  width?: number;
}) {
  const bins = Math.min(series.hours, Math.max(48, Math.floor(width / 3)));
  const binned = useMemo(() => binSeries(series, bins), [series, bins]);
  const ticks = useMemo(() => dayTicks(startUtc, series.hours, width), [startUtc, series.hours, width]);
  const dragging = useRef(false);
  const height = H_SUN + GAP + H_EARTH + GAP + H_AXIS;
  const binW = width / bins;
  const cursorX = xAtHour(cursor, width, series.hours);

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    if (!Number.isFinite(e.clientX)) return;
    const box = e.currentTarget.getBoundingClientRect();
    onCursor(hourAtX(((e.clientX - box.left) / box.width) * width, width, series.hours));
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="group"
      aria-label="Timeline of sunlit hours and Earth visibility"
      className="block select-none"
    >
      <rect x={0} y={0} width={width} height={H_SUN} fill="var(--night)" />
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
      <rect x={0} y={H_SUN + GAP} width={width} height={H_EARTH} fill="var(--night)" />
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
      <line data-part="cursor" x1={cursorX} x2={cursorX} y1={0} y2={H_SUN + GAP + H_EARTH} stroke="var(--ink)" strokeWidth={2} />
      <rect
        data-part="hit"
        x={0}
        y={0}
        width={width}
        height={H_SUN + GAP + H_EARTH}
        fill="transparent"
        style={{ cursor: 'crosshair' }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current) pick(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerLeave={() => {
          dragging.current = false;
        }}
      />
    </svg>
  );
}
