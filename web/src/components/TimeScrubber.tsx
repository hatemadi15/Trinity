'use client';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { utcLabel } from '@/lib/viz/format';

export function TimeScrubber({
  startUtc,
  cursor,
  hours,
  onCursor,
}: {
  startUtc: string;
  cursor: number;
  hours: number;
  onCursor: (hour: number) => void;
}) {
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
      if (next >= hours) setPlaying(false);
      else onCursor(next);
    }, 1000 / 12);
    return () => window.clearInterval(id);
  }, [playing, hours, onCursor]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        disabled={reduced}
        className="rounded-md border border-line px-3 py-1 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      {reduced && (
        <span className="text-xs text-ink-3">Autoplay is off because your system prefers reduced motion.</span>
      )}
      <input
        type="range"
        aria-label="Time cursor"
        min={0}
        max={Math.max(0, hours - 1)}
        step={1}
        value={cursor}
        onChange={(e) => onCursor(Number(e.target.value))}
        className="min-w-[240px] flex-1 accent-[var(--sun)]"
      />
      <span className="w-[170px] text-right text-sm text-ink">{utcLabel(startUtc, cursor)}</span>
    </div>
  );
}
