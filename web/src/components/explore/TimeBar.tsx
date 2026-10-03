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
 * for seven, 504 px for six) every other one gives way; a phone 390 px wide has a 308 px track (358 px when
 * compact). The class names are written out whole so that Tailwind generates them.
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
 * Diagonal stripes of the radio band's green at 45°, the ground between them clear: radio contact that comes
 * only if the lander lives through the night. The class is written out whole so that Tailwind generates it.
 */
const HATCH = 'bg-[repeating-linear-gradient(45deg,var(--good)_0_2px,transparent_2px_4px)]';

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
 * The row of each flag over the track, 0 right above it or 1 above that, for moments in order of time. A
 * flag takes the first row when it clears the flag placed last there. When it does not and its stem would
 * come down behind that flag's words, that flag goes up instead, if its own stem then stays clear of the new
 * one and it clears the second row: as the stem of a flag in the second row comes down past the first, each
 * stem stays in sight. Else the new flag takes the row where it covers less of the words of the flag placed
 * last there, the second on a tie, as there is no third row. A flag that ends at its hour, near the right
 * end, counts where it really runs, its stem on its right edge.
 */
export function momentRows(moments: KeyMoment[], hours: number, trackPx: number): number[] {
  const spans = moments.map((m) => flagSpan(m, hours, trackPx));
  // How far two flags run over each other, in px: 0 when they clear each other, or when either is none (-1).
  const over = (a: number, b: number) => (a < 0 || b < 0 ? 0 : Math.max(0, Math.min(spans[a].to, spans[b].to) - Math.max(spans[a].from, spans[b].from)));
  // Whether the stem of flag a, at its hour, would come down behind the words of flag b.
  const behind = (a: number, b: number) => {
    const at = spans[a].flipped ? spans[a].to : spans[a].from;
    return spans[b].from < at && at < spans[b].to;
  };
  const rows: number[] = [];
  // The flags placed last in the first row and in the second.
  let first = -1;
  let second = -1;
  spans.forEach((_, k) => {
    if (over(k, first) === 0) {
      rows.push(0);
      first = k;
    } else if (behind(k, first) && !behind(first, k) && over(first, second) === 0) {
      rows[first] = 1;
      second = first;
      rows.push(0);
      first = k;
    } else if (over(k, second) <= over(k, first)) {
      rows.push(1);
      second = k;
    } else {
      rows.push(0);
      first = k;
    }
  });
  return rows;
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
 * sunlight, with "lander off" in the key. The blue band sits under the red one, and under the blue, on a
 * row of its own, the hours with both power and Earth in view, when the lander can radio home, are a green
 * band ("radio contact"), so the blue runs whole for as long as Earth is in view. With the dates each band
 * is 6 px tall, 2 px under the one above. Explore leaves all of these to its chart.
 *
 * Once the battery has run out in the night, what the lander does after the power comes back holds only if
 * it survives that night, which the forecast does not work out: from `ifSurvivesFrom` on, the radio band is
 * hatched in its green rather than solid, and the key adds "if it survives the night" after "radio contact".
 *
 * With the dates, `moments` puts a flag right above the track at each of the period's key moments, such as
 * "Sunset 3 Jan": a click on one moves the handle to its hour, then tells the page (`onMoment`). A flag
 * looks like the button it is: a pointer, an edge that stands out on the dark bar, and a lighter fill with a
 * brighter edge under the pointer or the keyboard's focus. It starts at its hour, where a 1 px stem in its
 * edge colour runs from its left edge down to the strip; one whose words would run past the right end of the
 * track ends at its hour instead, the stem on its right edge. Of two flags that would meet, one goes up to a
 * second row (`momentRows`), the most there is: the one whose stem then comes down in sight, so each flag
 * leads the eye to its own hour even when two stand a few pixels apart. The flag of the moment the handle is
 * on shows as chosen, with a gold edge. With `compact`, on a phone each flag is a dot on the top edge of the
 * strip, its words kept for screen readers, with room around it for a finger; the chosen dot is gold and
 * shows its words in a chip just above it, so a tap shows what the dot was.
 *
 * `compact` keeps the bar low for the stand view: no sentence beside the date (the page says it in its own
 * words), and with the dates the keys join the date's line from a medium screen up, where they fit. On a
 * phone the keys are smaller, Play keeps its word, and the bar drops the chart panel's inset to make room
 * for it. `clockNote` puts a few words after the date and hour on a medium screen and up.
 *
 * `bare` is for the stand view's clean view, for a classroom: the picture with as little as possible over
 * it. The bar keeps only Play, the date and hour, and the track with its sunlight and handle.
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
  bare = false,
  moments,
  onMoment,
  ifSurvivesFrom = null,
  clockNote,
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
  /**
   * No sentence beside the date at any width (the page says it in its own words), and with `dates` the keys on
   * the date's line from md up where they fit, so the bar stays low. On a phone: smaller keys, Play with its
   * word, no chart-panel inset, and the chosen flag's words in a chip over its dot.
   */
  compact?: boolean;
  /** Only Play, the date and hour, and the track with its sunlight and handle: no sentence, keys, bands, flags or dates. */
  bare?: boolean;
  /** The period's key moments in order of time, as flags over the track; only with `dates`. */
  moments?: KeyMoment[];
  /** Told which moment it was, once a click on its flag has moved the handle there. */
  onMoment?: (m: KeyMoment) => void;
  /**
   * The hour from which the bar's marks that need power hold only if the lander survives the night: the first
   * hour with power again after the first power cut, or null when it never needs to. From that hour on the
   * radio band is hatched rather than solid, and named "if it survives the night" in the key; only with `dates`.
   */
  ifSurvivesFrom?: number | null;
  /**
   * Words right after the date and hour, in the second ink, on a medium screen and up only (a phone has no
   * room): " (Earth time)" reads "1 Jan 2027, 00:00 UTC (Earth time)". Not shown when `bare`.
   */
  clockNote?: string;
}) {
  const hours = series.hours;
  const last = Math.max(0, hours - 1);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const cursorRef = useRef(cursor);
  // What the dates bring, unless the bar is bare: Earth's band and the radio band, the grey's name, the flags and the dates row.
  const rich = dates && !bare;
  const off = powered && !bare ? offRuns(powered.subarray(0, hours)) : [];
  const lit = litRuns(series.sunFraction);
  const earth = rich ? runsWhere(hours, (h) => series.earthVisible[h] === 1) : [];
  const contact = rich && powered ? runsWhere(hours, (h) => powered[h] === 1 && series.earthVisible[h] === 1) : [];
  // From `ifSurvivesFrom` on the contact holds only if the lander survives the night: those hours are hatched,
  // and a stretch that runs across that hour is split there.
  const survives = ifSurvivesFrom ?? Infinity;
  const contactRuns = contact.flatMap((r) =>
    r.to <= survives
      ? [{ ...r, ifSurvives: false }]
      : r.from >= survives
        ? [{ ...r, ifSurvives: true }]
        : [
            { from: r.from, to: survives, ifSurvives: false },
            { from: survives, to: r.to, ifSurvives: true },
          ],
  );
  const ifSurvives = contactRuns.some((r) => r.ifSurvives);
  // The strip is grey wherever the yellow leaves a gap: by its own rule, an hour with any part of the Sun is yellow.
  const sunless = rich && lit.reduce((n, r) => n + r.to - r.from, 0) < hours;
  // With the dates each band is 6 px tall and at least as wide, so one hour still shows as a dot, and each key's
  // swatch is a line as thick as its band. The off band alone, without the dates, keeps to 4 px.
  const band = dates ? { h: 'h-1.5', minW: 'min-w-1.5', swatch: 'border-y-2' } : { h: 'h-1', minW: 'min-w-1', swatch: 'border-y-[3px]' };
  // The flags come with the dates only, so Explore is drawn as before. Their rows, and which of them end at
  // their hour, depend on the track's width, measured once they are drawn (1000 px until then).
  const flags = rich && moments ? moments : [];
  const { ref: flagsRef, width: trackPx } = useElementWidth<HTMLDivElement>(1000);
  const rows = momentRows(flags, hours, trackPx);
  const flipped = flags.map((m) => flagSpan(m, hours, trackPx).flipped);
  // On a phone when compact the flags are dots; the one the handle is on also shows its words, in a chip.
  const chip = compact ? flags.find((m) => cursor === m.hour) : undefined;

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
  const when = (
    <span data-testid="when" className="text-[17px] font-semibold">
      {dateTimeUtc(startUtc, shown)}
    </span>
  );
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
        {/* Compact (the stand view), no chart is above the bar to line the track up with, so on a phone the bar drops
            the chart panel's inset and spends it on Play's word. */}
        <div data-part="bar-grid" className={`${PLOT_GRID} items-center gap-y-1 px-[25px] py-2.5 max-sm:grid-cols-[auto_minmax(0,1fr)]${compact ? ' max-sm:px-0' : ''}`}>
          {/* On a phone Play is its sign alone, except when compact: there its word stays beside the sign, a little
              tighter at the sides, at a width that holds "Pause" as well, so the date beside it never moves. */}
          <button
            type="button"
            disabled={reduced}
            onClick={() => {
              if (!playing && cursor >= last) onCursor(0);
              setPlaying((p) => !p);
            }}
            className={`btn row-span-2 w-full max-sm:row-span-1 max-sm:w-auto${compact ? ' max-sm:min-w-[92px] max-sm:gap-2 max-sm:px-3' : ''}`}
          >
            <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true">
              {playing ? <path d="M3 2h4v12H3zM9 2h4v12H9z" /> : <path d="M4 2l10 6-10 6z" />}
            </svg>
            <span className={compact ? undefined : 'max-sm:sr-only'}>{playing ? 'Pause' : 'Play'}</span>
          </button>
          <p className="flex flex-wrap items-baseline gap-x-3 leading-snug">
            {clockNote && !bare ? (
              // The note follows the date and hour in the same run of words, never on a line of its own.
              <span className="md:whitespace-nowrap">
                {when}
                <span data-testid="clock-note" className="text-[15px] text-ink-2 max-md:hidden">
                  {clockNote}
                </span>
              </span>
            ) : (
              when
            )}
            {/* Compact, the page says it in its own words; the slider still reads it. Bare, the date and hour are all. */}
            {!compact && !bare && (
              <span data-testid="status" className="text-[15px] text-ink-2">
                {statusSentence(series, power, shown, batteryWh)}
              </span>
            )}
            {reduced && !bare && <span className="text-[15px] text-ink-2">Playback is off because your system asks for reduced motion.</span>}
            {!bare && (sunless || off.length > 0 || earth.length > 0 ? (
              // The keys wrap as one, so none strays to the far side of a new line. Each swatch is a box as
              // tall as the Sun's, so all of them keep one baseline. With the dates there are up to six, too
              // many to fit beside a long sentence even on a wide screen: they take a line of their own, so the
              // bar keeps one height while the words change. Compact, there is no sentence: from md up they
              // take only their own width, so they join the date's line where they fit, at its right end (else
              // they go to the next line whole, at the right all the same), and the bar is a line lower.
              <span className={`${dates ? 'flex basis-full flex-wrap items-baseline gap-x-3 sm:justify-end' : 'flex flex-wrap items-baseline gap-x-3 sm:ml-auto'} ${compact ? `max-sm:gap-x-2 max-sm:[&>span]:text-[13px] max-sm:[&_i]:w-4${dates ? ' md:ml-auto md:basis-auto' : ''}` : ''}`}>
                {sunKey}
                {sunless && (
                  <span data-part="key-no-sun" className="flex items-center gap-2 text-[15px] text-ink-2">
                    {/* The strip's own grey, where no yellow is drawn, with an edge light enough to see on the dark bar. */}
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border border-ink-3 bg-surface-2" />
                    no Sun
                  </span>
                )}
                {off.length > 0 && (
                  <span data-part="key-off" className="flex items-center gap-2 text-[15px] text-ink-2">
                    {/* A line as thick as the band: the box's clear edges above and below leave 6 px of it, 4 px without the dates. */}
                    <i data-swatch="" aria-hidden="true" className={`block h-2.5 w-6 rounded-full ${band.swatch} border-transparent bg-bad bg-clip-padding`} />
                    lander off
                  </span>
                )}
                {earth.length > 0 && (
                  <span data-part="key-earth" className="flex items-center gap-2 text-[15px] text-ink-2">
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border-y-2 border-transparent bg-earth bg-clip-padding" />
                    Earth in view
                  </span>
                )}
                {contact.length > 0 && (
                  <span data-part="key-contact" className="flex items-center gap-2 text-[15px] text-ink-2">
                    <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border-y-2 border-transparent bg-good bg-clip-padding" />
                    radio contact
                  </span>
                )}
                {ifSurvives && (
                  <span data-part="key-if-survives" className="flex items-center gap-2 text-[15px] text-ink-2">
                    {/* The band's own stripes, in a line as thick as the band. */}
                    <i data-swatch="" aria-hidden="true" className={`block h-2.5 w-6 rounded-full border-y-2 border-transparent bg-clip-padding ${HATCH}`} />
                    if it survives the night
                  </span>
                )}
              </span>
            ) : (
              sunKey
            ))}
          </p>
          <div data-part="track" className="col-start-2 max-sm:col-span-2 max-sm:col-start-1">
            {flags.length > 0 && (
              // Right above the strip and on its hours, in rows of 22 px (a flag 20 px tall, 2 px under it), the
              // first row nearest the strip; each flag's stem runs down to the strip in sight (`momentRows`). On a
              // phone when compact the flags are dots on the strip's top edge and the row is 11 px: with the grid's
              // 4 px gap and the slider's 9 px over the strip, room for a 24 px target that stays clear of Play.
              // The row is lifted over the slider there, so the targets win those 9 px.
              <div
                ref={flagsRef}
                data-part="moments"
                role="group"
                aria-label="Jump to a moment"
                className={`relative ${rows.includes(1) ? 'h-[44px]' : 'h-[22px]'}${compact ? ' max-sm:z-[1] max-sm:h-[11px]' : ''}`}
              >
                {flags.map((m, i) => {
                  const left = `${(m.hour / hours) * 100}%`;
                  // The moment the handle is on shows as chosen: the Sun's gold for its edge, on a lighter ground
                  // than the others'; on a phone, a gold dot.
                  const chosen = cursor === m.hour;
                  // A button by its look: a pointer, an edge that stands out on the dark bar, and under the pointer
                  // or the keyboard's focus a lighter fill and a brighter edge (the chosen one's gold brightens).
                  // The keyboard's ring is the page's own, 2 px of gold 2 px out (globals.css); a flag under the
                  // pointer or the focus comes to the front, ring and all. The corner over the stem is square, so
                  // the stem runs on from the flag's edge. On a phone when compact: a 24 px target centred on its
                  // hour, its bottom on the strip's top edge, with the dot in it (one that ends at its hour is
                  // already a whole target to the left, so it comes back half of one).
                  return (
                    <button
                      key={`${m.hour} ${m.label}`}
                      type="button"
                      data-part="moment"
                      data-row={rows[i]}
                      aria-label={compact ? m.label : undefined}
                      aria-current={chosen ? 'true' : undefined}
                      onClick={() => {
                        move(m.hour);
                        onMoment?.(m);
                      }}
                      className={`absolute flex h-5 cursor-pointer items-center whitespace-nowrap rounded border ${chosen ? 'border-sun bg-surface-2 hover:border-sun-hover focus-visible:border-sun-hover' : 'border-ink-3 bg-surface hover:border-ink focus-visible:border-ink'} px-1.5 text-[13px] leading-none text-ink hover:z-10 hover:bg-line focus-visible:z-10 focus-visible:bg-line ${rows[i] === 1 ? 'bottom-[24px]' : 'bottom-[2px]'} ${flipped[i] ? 'rounded-br-none' : 'rounded-bl-none'}${compact ? ` max-sm:-bottom-[9px] max-sm:size-6 max-sm:rounded-full max-sm:border-0 max-sm:bg-transparent max-sm:p-0 ${flipped[i] ? 'max-sm:ml-3' : 'max-sm:-ml-3'}` : ''}`}
                      style={flipped[i] ? { left, transform: 'translateX(-100%)' } : { left }}
                    >
                      <span className={compact ? 'max-sm:sr-only' : undefined}>{m.label}</span>
                      {/* The stem: 1 px of the flag's own edge colour, whatever that is, from 1 px up into its bottom edge
                          down to the strip at its hour, on its left edge or, for a flag that ends at its hour, its
                          right: 2 px under a flag of the first row and 9 px down the box under the row, 22 px more from
                          the second. It takes no taps from the slider under it. */}
                      <i
                        data-part="moment-stem"
                        aria-hidden="true"
                        className={`pointer-events-none absolute top-full w-0 border-l border-inherit ${rows[i] === 1 ? 'h-[34px]' : 'h-[12px]'} ${flipped[i] ? '-right-px' : '-left-px'}${compact ? ' max-sm:hidden' : ''}`}
                      />
                      {compact && <i data-part="moment-dot" aria-hidden="true" className={`absolute bottom-0 left-1/2 hidden size-2 -translate-x-1/2 rounded-full ${chosen ? 'bg-sun' : 'bg-ink'} max-sm:block`} />}
                    </button>
                  );
                })}
                {chip && (
                  // The chosen dot's words, on a phone, so a tap shows what the dot was: 18 px tall with its foot on the
                  // row's, 1 px over the dot. It sits at its hour's share of the track, drawn back by the same share of
                  // its own width, so it never runs off either end of the track and its dot is always under it. A
                  // label only: taps go through it, and the dot's button carries the words for screen readers.
                  <span
                    data-part="moment-chip"
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 hidden h-[18px] items-center whitespace-nowrap rounded border border-sun bg-surface-2 px-1.5 text-[14px] leading-none text-ink max-sm:flex"
                    style={{ left: `${(chip.hour / hours) * 100}%`, transform: `translateX(-${(chip.hour / hours) * 100}%)` }}
                  >
                    {chip.label}
                  </span>
                )}
              </div>
            )}
            {/* With the dates the box is 47 px tall, room for the three bands under the strip; the slider keeps its 32 px at the top. Bare, there are none. */}
            <div className={rich ? 'relative h-[47px]' : 'relative h-8'}>
              <svg viewBox={`0 0 ${hours} 10`} preserveAspectRatio="none" aria-hidden="true" className="absolute inset-x-0 top-[9px] h-3.5 w-full overflow-hidden rounded-full bg-surface-2">
                {lit.map((r) => (
                  <rect key={r.from} data-part="lit" x={r.from} y={0} width={r.to - r.from} height={10} fill="var(--sun)" />
                ))}
              </svg>
              {/* 2 px under the sunlight strip (9 to 23 px), on the same hours: 25 to 31 px with the dates, 25 to 29 px without. A stretch of one hour still shows as a dot. */}
              {off.length > 0 && (
                <div data-part="off" aria-hidden="true" className={`absolute inset-x-0 top-[25px] ${band.h}`}>
                  {off.map((r) => (
                    <i key={r.from} data-part="off-run" className={`absolute inset-y-0 ${band.minW} rounded-full bg-bad`} style={{ left: `${(r.from / hours) * 100}%`, width: `${((r.to - r.from) / hours) * 100}%` }} />
                  ))}
                </div>
              )}
              {/* 2 px under the off band (33 to 39 px), and there whether or not the lander is ever off; one hour still shows as a dot. */}
              {earth.length > 0 && (
                <div data-part="earth" aria-hidden="true" className="absolute inset-x-0 top-[33px] h-1.5">
                  {earth.map((r) => (
                    <i key={r.from} data-part="earth-run" className="absolute inset-y-0 min-w-1.5 rounded-full bg-earth" style={{ left: `${(r.from / hours) * 100}%`, width: `${((r.to - r.from) / hours) * 100}%` }} />
                  ))}
                </div>
              )}
              {/* The hours the lander can radio home, on a row of their own 2 px under Earth's (41 to 47 px), never over
                  it: the blue stays whole for as long as Earth is in view. Hatched where it needs the lander to have
                  survived the night. */}
              {contactRuns.length > 0 && (
                <div data-part="contact" aria-hidden="true" className="absolute inset-x-0 top-[41px] h-1.5">
                  {contactRuns.map((r) => (
                    <i
                      key={r.from}
                      data-part="contact-run"
                      data-if-survives={r.ifSurvives ? '' : undefined}
                      className={`absolute inset-y-0 min-w-1.5 rounded-full ${r.ifSurvives ? HATCH : 'bg-good'}`}
                      style={{ left: `${(r.from / hours) * 100}%`, width: `${((r.to - r.from) / hours) * 100}%` }}
                    />
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
            {rich && (
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
