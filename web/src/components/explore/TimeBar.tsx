'use client';
import { useEffect, useRef, useState } from 'react';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { dateTimeUtc, dayMonth } from '@/lib/viz/format';
import { statusSentence } from '@/lib/viz/status';
import { litRuns, offRuns, runsWhere } from '@/lib/viz/timechart';
import { PLOT_GRID } from './TimeChart';

/** Hours of the period shown per second of playback. */
const HOURS_PER_SECOND = 12;

/** Days between dates under the track: the first of these that leaves at most seven, so every 2 days over 14 days, 5 over 30, 15 over 90. */
const DATE_STEPS = [1, 2, 5, 10, 15, 30, 60];

/**
 * The dates under the track, at whole days from the start like the chart's date row. Two dates need about
 * 84 px from centre to centre: at 15 px the widest, "31 May", is 49 px, and the first date sits against the
 * left end, so it reaches its whole width to the right. On a track narrower than that for all of them (588 px
 * for seven, 504 px for six) every other one gives way; a phone 390 px wide has a 308 px track. The class
 * names are written out whole so that Tailwind generates them.
 */
function dateMarks(hours: number): { hour: number; narrow: string }[] {
  const days = hours / 24;
  const step = DATE_STEPS.find((s) => days / s <= 7) ?? Math.ceil(days / 7);
  const narrow = days / step > 6 ? '@max-[588px]:hidden' : '@max-[504px]:hidden';
  const out: { hour: number; narrow: string }[] = [];
  // Each centre stays half a step from the right end: room for half a date.
  for (let k = 0; k * step + step / 2 <= days; k++) out.push({ hour: k * step * 24, narrow: k % 2 === 1 ? narrow : '' });
  return out;
}

/**
 * The time bar, pinned to the bottom of the window: Play, the date and hour with one sentence about
 * that hour, and a slider whose track is the sunlight of the period. It uses the chart's grid, inset by
 * the chart panel's edge (1 px border, 24 px padding), so the track runs right under the chart's plot and
 * the handle under the chart's time line. Arrow keys move one hour, Page Up and Page Down one day. While
 * the pointer is on the chart the words follow it; the handle stays.
 *
 * Where no chart is above it (the stand view), `dates` writes the dates under the track, draws the hours
 * Earth is in view as a blue band and names the strip's grey, the hours without the Sun; `powered` (1 for
 * each hour with power, 0 without) draws the hours the lander is off as a red band right under the
 * sunlight, with "lander off" in the key. The blue band sits under the red one; the hours with both power
 * and Earth in view, when the lander can radio home, are a thicker green band over it ("radio contact").
 * Explore leaves all of these to its chart.
 */
export function TimeBar({
  series,
  power,
  startUtc,
  cursor,
  hoverHour,
  batteryWh,
  onCursor,
  dates = false,
  powered = null,
  compact = false,
}: {
  series: Series;
  power: PowerResult | null;
  startUtc: string;
  cursor: number;
  hoverHour: number | null;
  batteryWh: number;
  onCursor: (hour: number) => void;
  dates?: boolean;
  powered?: Uint8Array | null;
  /** On a phone: no sentence beside the date (the page says it already) and smaller keys, so the bar stays low. */
  compact?: boolean;
}) {
  const hours = series.hours;
  const last = Math.max(0, hours - 1);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const cursorRef = useRef(cursor);
  const off = powered ? offRuns(powered.subarray(0, hours)) : [];
  const lit = litRuns(series.sunFraction);
  const earth = dates ? runsWhere(hours, (h) => series.earthVisible[h] === 1) : [];
  const contact = dates && powered ? runsWhere(hours, (h) => powered[h] === 1 && series.earthVisible[h] === 1) : [];
  // The strip is grey wherever the yellow leaves a gap: by its own rule, an hour with any part of the Sun is yellow.
  const sunless = dates && lit.reduce((n, r) => n + r.to - r.from, 0) < hours;

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
  const move = (to: number) => onCursor(Math.max(0, Math.min(last, to)));
  // The track's yellow is the Sun, not progress: a key says so.
  const sunKey = (
    <span data-part="key" className="flex items-center gap-2 text-[15px] text-ink-2 sm:ml-auto">
      <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full bg-sun" />
      Sun up
    </span>
  );

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
            className="btn row-span-2 w-full max-sm:row-span-1 max-sm:w-auto"
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
            <span data-testid="status" className={`text-[15px] text-ink-2 ${compact ? 'max-sm:hidden' : ''}`}>
              {statusSentence(series, power, shown, batteryWh)}
            </span>
            {reduced && <span className="text-[15px] text-ink-2">Playback is off because your system asks for reduced motion.</span>}
            {sunless || off.length > 0 || earth.length > 0 ? (
              // The keys wrap as one, so none strays to the far side of a new line. Each swatch is a box as
              // tall as the Sun's, so all of them keep one baseline. With the dates there are up to four, too
              // many to fit beside a long sentence even on a wide screen: they take a line of their own, so the
              // bar keeps one height while the words change.
              <span className={`${dates ? 'flex basis-full flex-wrap items-baseline gap-x-3 sm:justify-end' : 'flex flex-wrap items-baseline gap-x-3 sm:ml-auto'} ${compact ? 'max-sm:gap-x-2 max-sm:[&>span]:text-[13px] max-sm:[&_i]:w-4' : ''}`}>
                {sunKey}
                {sunless && (
                  <span data-part="key-no-sun" className="flex items-center gap-2 text-[15px] text-ink-2">
                    {/* The strip's own grey, where no yellow is drawn. */}
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border border-line-strong bg-surface-2" />
                    no Sun
                  </span>
                )}
                {off.length > 0 && (
                  <span data-part="key-off" className="flex items-center gap-2 text-[15px] text-ink-2">
                    {/* A 4 px line, like the band. */}
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border-y-[3px] border-transparent bg-bad bg-clip-padding" />
                    lander off
                  </span>
                )}
                {earth.length > 0 && (
                  <span data-part="key-earth" className="flex items-center gap-2 text-[15px] text-ink-2">
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border-y-[3px] border-transparent bg-earth bg-clip-padding" />
                    Earth in view
                  </span>
                )}
                {contact.length > 0 && (
                  <span data-part="key-contact" className="flex items-center gap-2 text-[15px] text-ink-2">
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full bg-good" />
                    radio contact
                  </span>
                )}
              </span>
            ) : (
              sunKey
            )}
          </p>
          <div data-part="track" className="col-start-2 max-sm:col-span-2 max-sm:col-start-1">
            {/* With the dates the box is 4 px taller, room for Earth's band; the slider keeps its 32 px at the top. */}
            <div className={dates ? 'relative h-9' : 'relative h-8'}>
              <svg viewBox={`0 0 ${hours} 10`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-[9px] h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
                {lit.map((r) => (
                  <rect key={r.from} data-part="lit" x={r.from} y={0} width={r.to - r.from} height={10} fill="var(--sun)" />
                ))}
              </svg>
              {/* 2 px under the sunlight strip (9 to 23 px), on the same hours; a stretch of one hour still shows as a dot. */}
              {off.length > 0 && (
                <div data-part="off" aria-hidden="true" className="absolute inset-x-0 top-[25px] h-1">
                  {off.map((r) => (
                    <i key={r.from} data-part="off-run" className="absolute inset-y-0 min-w-1 rounded-full bg-bad" style={{ left: `${(r.from / hours) * 100}%`, width: `${((r.to - r.from) / hours) * 100}%` }} />
                  ))}
                </div>
              )}
              {/* 2 px under the off band (25 to 29 px), and there whether or not the lander is ever off; one hour still shows as a dot. */}
              {earth.length > 0 && (
                <div data-part="earth" aria-hidden="true" className="absolute inset-x-0 top-[31px] h-1">
                  {earth.map((r) => (
                    <i key={r.from} data-part="earth-run" className="absolute inset-y-0 min-w-1 rounded-full bg-earth" style={{ left: `${(r.from / hours) * 100}%`, width: `${((r.to - r.from) / hours) * 100}%` }} />
                  ))}
                </div>
              )}
              {/* Over the Earth band (30 to 36 px), thicker: the hours the lander can radio home. */}
              {contact.length > 0 && (
                <div data-part="contact" aria-hidden="true" className="absolute inset-x-0 top-[30px] h-1.5">
                  {contact.map((r) => (
                    <i key={r.from} data-part="contact-run" className="absolute inset-y-0 min-w-1.5 rounded-full bg-good" style={{ left: `${(r.from / hours) * 100}%`, width: `${((r.to - r.from) / hours) * 100}%` }} />
                  ))}
                </div>
              )}
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
            {dates && (
              <div data-testid="dates" aria-hidden="true" className="@container relative h-6 text-[15px] text-ink-2">
                {dateMarks(hours).map((d, i) => (
                  <span
                    key={d.hour}
                    data-date=""
                    className={`absolute whitespace-nowrap ${d.narrow}`}
                    style={i === 0 ? { left: 0 } : { left: `${(d.hour / hours) * 100}%`, transform: 'translateX(-50%)' }}
                  >
                    {dayMonth(startUtc, d.hour)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
