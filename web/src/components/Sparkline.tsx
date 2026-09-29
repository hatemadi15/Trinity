import { useMemo } from 'react';
import type { Series } from '@/lib/engine/metrics';
import { binSeries } from '@/lib/viz/timeline';

/** The timeline's Sun bars and Earth strip at thumbnail size, without labels or interaction. */
export function Sparkline({ series, width = 240, height = 40 }: { series: Series; width?: number; height?: number }) {
  const bins = Math.min(series.hours, Math.max(24, Math.floor(width / 2)));
  const b = useMemo(() => binSeries(series, bins), [series, bins]);
  const sunH = height - 8;
  const w = width / bins;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="Sunlit hours (bars) and Earth visibility (strip)"
      className="block"
    >
      <rect x={0} y={0} width={width} height={sunH} fill="var(--night)" />
      {Array.from(b.sunMax, (v, i) =>
        v > 0 ? (
          <rect
            key={i}
            x={i * w}
            y={sunH * (1 - v)}
            width={Math.max(1, w - 0.3)}
            height={sunH * v}
            fill={v >= 0.999 ? 'var(--sun-bright)' : 'var(--sun)'}
          />
        ) : null,
      )}
      <rect x={0} y={sunH + 2} width={width} height={6} fill="var(--night)" />
      {Array.from(b.earthFrac, (v, i) =>
        v > 0 ? (
          <rect key={i} x={i * w} y={sunH + 2} width={Math.max(1, w - 0.3)} height={6} fill="var(--earth)" opacity={0.35 + 0.65 * v} />
        ) : null,
      )}
    </svg>
  );
}
