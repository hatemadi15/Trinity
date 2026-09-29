'use client';
import { useEffect, useRef, useState } from 'react';
import { WINDOW_DAYS, type WindowDays } from '@/lib/store/explore';
import { utcLabel } from '@/lib/viz/format';

export function WindowControls({
  startUtc,
  days,
  cursor,
  hours,
  onWindow,
  onCursor,
}: {
  startUtc: string;
  days: WindowDays;
  cursor: number;
  hours: number;
  onWindow: (startUtc: string, days: WindowDays) => void;
  onCursor: (hour: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const next = cursorRef.current + 1;
      if (next >= hours) setPlaying(false);
      else onCursor(next);
    }, 1000 / 12);
    return () => window.clearInterval(id);
  }, [playing, hours, onCursor]);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <label className="flex flex-col gap-1 text-sm text-ink-2">
        Start date (UTC)
        <input
          type="date"
          value={startUtc.slice(0, 10)}
          min="2024-01-02"
          max="2036-12-30"
          onChange={(e) => e.target.value && onWindow(`${e.target.value}T00:00:00`, days)}
          className="rounded-md border border-line bg-panel px-2 py-1 text-ink"
        />
      </label>
      <fieldset className="flex items-center gap-1 text-sm">
        <legend className="mb-1 text-ink-2">Window</legend>
        {WINDOW_DAYS.map((d) => (
          <label
            key={d}
            className={`cursor-pointer rounded-md border px-3 py-1 ${d === days ? 'border-sun bg-panel text-ink' : 'border-line text-ink-2'}`}
          >
            <input
              type="radio"
              name="window"
              className="sr-only"
              checked={d === days}
              onChange={() => onWindow(startUtc, d)}
              aria-label={`${d} days`}
            />
            {d} days
          </label>
        ))}
      </fieldset>
      <div className="flex min-w-[320px] flex-1 items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          disabled={reduced}
          title={reduced ? 'Autoplay is off because your system prefers reduced motion' : undefined}
          className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          aria-label="Time cursor"
          min={0}
          max={Math.max(0, hours - 1)}
          step={1}
          value={cursor}
          onChange={(e) => onCursor(Number(e.target.value))}
          className="flex-1 accent-[var(--sun)]"
        />
        <span className="w-[170px] text-right text-sm text-ink">{utcLabel(startUtc, cursor)}</span>
      </div>
    </div>
  );
}
