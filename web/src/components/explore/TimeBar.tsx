'use client';
import { useEffect, useRef, useState } from 'react';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { useElementWidth } from '@/lib/hooks/useElementWidth';
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

/** A moment of the period worth a jump: what happens, and its hour from the start. */
type KeyMoment = { label: string; hour: number };

/**
 * Where a flag runs along a track `trackPx` wide, in px. Its width is a guess from its words: 13 px type
 * takes about 7.2 px a letter, and the padding and edge 14 px more. It starts at its hour or, when it would
 * run past the right end of the track, ends there (`flipped`).
 */
function flagSpan(m: KeyMoment, hours: number, trackPx: number): { from: number; to: number; flipped: boolean } {
  const at = hours > 0 ? (m.hour / hours) * trackPx : 0;
  const width = m.label.length * 7.2 + 14;
  return at + width > trackPx ? { from: at - width, to: at, flipped: true } : { from: at, to: at + width, flipped: false };
}

/**
 * The row of each flag over the track, 0 right above it or 1 above that, for moments in order of time: a
 * flag takes the first row where it clears the flag placed before it in that row, and row 1 all the same
 * when neither has room, as there is no third. A flag that ends at its hour, near the right end, counts
 * where it really runs.
 */
export function momentRows(moments: KeyMoment[], hours: number, trackPx: number): number[] {
  // The flag placed last in the first row.
  let first: { from: number; to: number } | null = null;
  return moments.map((m) => {
    const span = flagSpan(m, hours, trackPx);
    if (first && span.from < first.to && first.from < span.to) return 1;
    first = span;
    return 0;
  });
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
 *
 * With the dates, `moments` puts a flag right above the track at each of the period's key moments, such as
 * "Sunset 3 Jan": a click on one moves the handle to its hour, then tells the page (`onMoment`). A flag
 * starts at its hour, where a 1 px tick on its left edge points down to the strip; one whose words would
 * run past the right end of the track ends at its hour instead, the tick on its right edge. A flag that
 * would cover the one before it goes up to a second row (`momentRows`), the most there is; the ticks of
 * that row run down behind the flags of the first. With `compact`, on a phone each flag is a dot on the
 * top edge of the strip, its words kept for screen readers, with room around it for a finger.
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
  moments,
  onMoment,
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
  /** The period's key moments in order of time, as flags over the track; only with `dates`. */
  moments?: KeyMoment[];
  /** Told which moment it was, once a click on its flag has moved the handle there. */
  onMoment?: (m: KeyMoment) => void;
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
  // The flags come with the dates only, so Explore is drawn as before. Their rows, and which of them end at
  // their hour, depend on the track's width, measured once they are drawn (1000 px until then).
  const flags = dates && moments ? moments : [];
  const { ref: flagsRef, width: trackPx } = useElementWidth<HTMLDivElement>(1000);
  const rows = momentRows(flags, hours, trackPx);
  const flipped = flags.map((m) => flagSpan(m, hours, trackPx).flipped);

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
            {flags.length > 0 && (
              // Right above the strip and on its hours, in rows of 22 px (a flag 20 px tall, 2 px under it), the
              // first row nearest the strip. The ticks come first, so one from the second row runs down behind the
              // flags of the first. On a phone when compact the flags are dots on the strip's top edge and the row
              // is 11 px: with the grid's 4 px gap and the slider's 9 px over the strip, room for a 24 px target
              // that stays clear of Play. The row is lifted over the slider there, so the targets win those 9 px.
              <div
                ref={flagsRef}
                data-part="moments"
                role="group"
                aria-label="Jump to a moment"
                className={`relative ${rows.includes(1) ? 'h-[44px]' : 'h-[22px]'}${compact ? ' max-sm:z-[1] max-sm:h-[11px]' : ''}`}
              >
                {flags.map((m, i) => (
                  // From the bottom of the flag to the strip, which starts 9 px down the box under the flags.
                  <i
                    key={`${m.hour} ${m.label}`}
                    data-part="moment-tick"
                    aria-hidden="true"
                    className={`absolute -bottom-[9px] w-px bg-ink-2 ${rows[i] === 1 ? 'h-[33px]' : 'h-[11px]'}${flipped[i] ? ' -ml-px' : ''}${compact ? ' max-sm:hidden' : ''}`}
                    style={{ left: `${(m.hour / hours) * 100}%` }}
                  />
                ))}
                {flags.map((m, i) => {
                  const left = `${(m.hour / hours) * 100}%`;
                  // The corner over the tick is square, so the tick runs on from the flag's edge. The keyboard's
                  // ring is the page's own (globals.css); a flag under the pointer or the focus comes to the front.
                  // On a phone when compact: a 24 px target centred on its hour, its bottom on the strip's top
                  // edge, with the dot in it (one that ends at its hour is already a whole target to the left,
                  // so it comes back half of one).
                  return (
                    <button
                      key={`${m.hour} ${m.label}`}
                      type="button"
                      data-part="moment"
                      data-row={rows[i]}
                      aria-label={compact ? m.label : undefined}
                      onClick={() => {
                        move(m.hour);
                        onMoment?.(m);
                      }}
                      className={`absolute flex h-5 items-center whitespace-nowrap rounded border border-line-strong bg-surface px-1.5 text-[13px] leading-none text-ink hover:z-10 hover:bg-surface-2 focus-visible:z-10 ${rows[i] === 1 ? 'bottom-[24px]' : 'bottom-[2px]'} ${flipped[i] ? 'rounded-br-none' : 'rounded-bl-none'}${compact ? ` max-sm:-bottom-[9px] max-sm:size-6 max-sm:rounded-full max-sm:border-0 max-sm:bg-transparent max-sm:p-0 ${flipped[i] ? 'max-sm:ml-3' : 'max-sm:-ml-3'}` : ''}`}
                      style={flipped[i] ? { left, transform: 'translateX(-100%)' } : { left }}
                    >
                      <span className={compact ? 'max-sm:sr-only' : undefined}>{m.label}</span>
                      {compact && <i data-part="moment-dot" aria-hidden="true" className="absolute bottom-0 left-1/2 hidden size-2 -translate-x-1/2 rounded-full bg-ink max-sm:block" />}
                    </button>
                  );
                })}
              </div>
            )}
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
