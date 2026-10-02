'use client';
import { useEffect, useRef, useState } from 'react';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { dateTimeUtc, dayMonth } from '@/lib/viz/format';
import { statusSentence } from '@/lib/viz/status';
import { litRuns } from '@/lib/viz/timechart';
import { PLOT_GRID } from './TimeChart';

/** Hours of the period shown per second of playback. */
const HOURS_PER_SECOND = 12;

/**
 * The time bar, pinned to the bottom of the window: Play, the date and hour with one sentence about
 * that hour, and a slider whose track is the sunlight of the period. It uses the chart's grid, inset by
 * the chart panel's edge (1 px border, 24 px padding), so the track runs right under the chart's plot and
 * the handle under the chart's time line. Arrow keys move one hour, Page Up and Page Down one day. While
 * the pointer is on the chart the words follow it; the handle stays.
 */
export function TimeBar({
  series,
  power,
  startUtc,
  cursor,
  hoverHour,
  batteryWh,
  onCursor,
}: {
  series: Series;
  power: PowerResult | null;
  startUtc: string;
  cursor: number;
  hoverHour: number | null;
  batteryWh: number;
  onCursor: (hour: number) => void;
}) {
  const hours = series.hours;
  const last = Math.max(0, hours - 1);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const cursorRef = useRef(cursor);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = cursorRef.current + 1;
      if (next > last) setPlaying(false);
      else onCursor(next);
    }, 1000 / HOURS_PER_SECOND);
    return () => window.clearInterval(id);
  }, [playing, last, onCursor]);

  const shown = Math.min(last, hoverHour ?? cursor);
  const days = Math.round(hours / 24);
  const every = days > 45 ? 10 : days > 20 ? 5 : days > 7 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor((days - 1) / every) + 1 }, (_, k) => k * every);
  const move = (to: number) => onCursor(Math.max(0, Math.min(last, to)));

  return (
    <section aria-label="Time" className="sticky bottom-0 z-30 border-t border-line bg-page">
      <div className="wrap">
        <div data-part="bar-grid" className={`${PLOT_GRID} items-center gap-y-1 px-[25px] py-2.5 max-sm:grid-cols-[auto_minmax(0,1fr)]`}>
          <button
            type="button"
            disabled={reduced}
            onClick={() => {
              if (!playing && cursor >= last) onCursor(0);
              setPlaying((p) => !p);
            }}
            className="btn btn-ink row-span-2 w-full max-sm:row-span-1 max-sm:w-auto"
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
              {playing ? <path d="M3 2h4v12H3zM9 2h4v12H9z" /> : <path d="M4 2l10 6-10 6z" />}
            </svg>
            <span className="max-sm:sr-only">{playing ? 'Pause' : 'Play'}</span>
          </button>
          <p className="flex flex-wrap items-baseline gap-x-3 leading-snug">
            <span data-testid="when" className="text-[17px] font-semibold">
              {dateTimeUtc(startUtc, shown)}
            </span>
            <span data-testid="status" className="text-[15px] text-ink-2">
              {statusSentence(series, power, shown, batteryWh)}
            </span>
            {reduced && <span className="text-[15px] text-ink-2">Playback is off because your system asks for reduced motion.</span>}
          </p>
          <div data-part="track" className="col-start-2 max-sm:col-span-2 max-sm:col-start-1">
            <div className="relative h-8">
              <svg viewBox={`0 0 ${hours} 10`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-[9px] h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
                {litRuns(series.sunFraction).map((r) => (
                  <rect key={r.from} data-part="lit" x={r.from} y={0} width={r.to - r.from} height={10} fill="var(--sun)" />
                ))}
              </svg>
              <input
                type="range"
                aria-label="Time"
                aria-valuetext={`${dateTimeUtc(startUtc, cursor)}: ${statusSentence(series, power, Math.min(last, cursor), batteryWh)}`}
                min={0}
                max={last}
                step={1}
                value={cursor}
                onChange={(e) => onCursor(Number(e.target.value))}
                onKeyDown={(e) => {
                  const step: Record<string, number> = { ArrowRight: cursor + 1, ArrowUp: cursor + 1, ArrowLeft: cursor - 1, ArrowDown: cursor - 1, PageUp: cursor + 24, PageDown: cursor - 24, Home: 0, End: last };
                  if (!(e.key in step)) return;
                  e.preventDefault();
                  move(step[e.key]);
                }}
                className="time-range relative"
              />
            </div>
            {/* On a narrow track every other day gives way, so no two dates touch. */}
            <p data-testid="ticks" aria-hidden="true" className="@container relative h-5 text-[15px] text-ink-2">
              {ticks.map((d, i) => (
                <span key={d} className={`absolute whitespace-nowrap ${i % 2 ? '@max-[480px]:hidden' : ''}`} style={d === 0 ? { left: 0 } : { left: `${((d * 24) / hours) * 100}%`, transform: 'translateX(-50%)' }}>
                  {dayMonth(startUtc, d * 24)}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
