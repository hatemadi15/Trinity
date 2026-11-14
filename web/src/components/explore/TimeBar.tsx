'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLunaControls } from '@/lib/luna/controls';
import type { Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { useElementWidth } from '@/lib/hooks/useElementWidth';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { clockUtc, dateTimeUtc, dayMonth } from '@/lib/viz/format';
import { statusSentence } from '@/lib/viz/status';
import { litRuns, offRuns, runsWhere } from '@/lib/viz/timechart';
import { CountdownLine } from './CountdownLine';
import { PLOT_GRID } from './TimeChart';

/** Steps Play takes each second, whatever its speed. */
const STEPS_PER_SECOND = 12;

/** Hours of the period Play moves each second at 1×: a day a second, two hours a step. */
export const PLAY_HPS = 24;

/** The speeds the speed button takes in turn: 1× (a day a second), 2× and 4×. */
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** What each speed means, for a screen reader. */
const SPEED_WORDS: Record<Speed, string> = { 1: 'a day a second', 2: 'two days a second', 4: 'four days a second' };

/**
 * How wide the slider's handle is, in px, in WebKit and Firefox alike (globals.css). Its middle runs from half of
 * that in from one end of the track to half of it in from the other, so the hour under the pointer is reckoned so.
 */
const THUMB_PX = 14;

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
 * The widest date and hour of each month the period runs into, as the bar writes them: the 28th, two figures for
 * the day, at 00:00 (the page's figures are tabular, each as wide as any other). The date and hour keep the width
 * of the widest of these, so what follows them on the line never moves as the time does.
 */
function widestDates(startUtc: string, last: number): string[] {
  const start = Date.parse(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const out: string[] = [];
  for (let h = 0; h < last + 24; h += 24) {
    const d = new Date(start + Math.min(h, last) * 3_600_000);
    const text = dateTimeUtc(startUtc, (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 28) - start) / 3_600_000);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

/** Words as a CSS string, for generated content: quoted, its quotes and backslashes escaped. */
const cssString = (words: string) => `"${words.replace(/["\\]/g, '\\$&').replace(/\s+/g, ' ')}"`;

/**
 * Diagonal stripes of the radio band's green at 45°, the ground between them clear: radio contact that comes
 * only if the lander lives through the cold of the night. The class is written out whole so that Tailwind
 * generates it.
 */
const HATCH = 'bg-[repeating-linear-gradient(45deg,var(--good)_0_2px,transparent_2px_4px)]';

/** A moment of the period worth a jump: what happens, and its hour from the start. */
export type KeyMoment = { label: string; hour: number };
const NO_MOMENTS: KeyMoment[] = [];

/** The first moment after `hour`, or none. */
const after = (moments: KeyMoment[], hour: number) => moments.reduce<KeyMoment | undefined>((best, m) => (m.hour > hour && (!best || m.hour < best.hour) ? m : best), undefined);
/** The last moment before `hour`, or none. */
const before = (moments: KeyMoment[], hour: number) => moments.reduce<KeyMoment | undefined>((best, m) => (m.hour < hour && (!best || m.hour >= best.hour) ? m : best), undefined);

/** How wide the target of a moment's dot is, in px; it is 40 px tall. */
const DOT_TARGET = 24;

/**
 * How far each moment's dot moves from its hour along a track `trackPx` wide, in px, so that no two targets
 * (each 24 px wide, centred on its dot) cover each other and a finger meant for one dot never gets the other.
 * A dot whose target clears its neighbours' stays on its hour. A run of dots too close for that, such as a
 * sunset and a flat battery a day apart on a phone, spreads out side by side about the middle of their hours,
 * and a run that then reaches the target of the dot before it takes that one in too. No dot leaves the track:
 * a run near either end moves inwards instead. In order of time, like the moments.
 */
export function dotShifts(moments: KeyMoment[], hours: number, trackPx: number): number[] {
  const at = moments.map((m) => (hours > 0 ? (m.hour / hours) * trackPx : 0));
  // Runs of dots side by side: how many, and the sum of their hours' places on the track.
  const runs: { n: number; sum: number }[] = [];
  // Where a run's first target starts: centred on the middle of its hours, its dots kept on the track.
  const start = (r: { n: number; sum: number }) => Math.max(-DOT_TARGET / 2, Math.min(trackPx + DOT_TARGET / 2 - r.n * DOT_TARGET, r.sum / r.n - (r.n * DOT_TARGET) / 2));
  for (const x of at) {
    runs.push({ n: 1, sum: x });
    // While the last run reaches into the one before it (by more than a rounding error), the two become one.
    while (runs.length > 1) {
      const [a, b] = runs.slice(-2);
      if (start(a) + a.n * DOT_TARGET <= start(b) + 1e-6) break;
      runs.splice(-2, 2, { n: a.n + b.n, sum: a.sum + b.sum });
    }
  }
  const out: number[] = [];
  for (const r of runs) {
    const s = start(r);
    for (let i = 0; i < r.n; i++) out.push(r.n === 1 ? 0 : s + (i + 0.5) * DOT_TARGET - at[out.length]);
  }
  return out;
}

/**
 * Where Space belongs to what has the focus, not to Play: a button or a link presses, a field types, an editable
 * element writes, and a dialog keeps the keyboard to itself. By their roles too.
 */
const SPACE_IS_THEIRS = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  'dialog',
  ...['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option', 'slider', 'spinbutton', 'textbox', 'combobox', 'dialog', 'alertdialog'].map((r) => `[role="${r}"]`),
].join(', ');

/** The plate over the track: where along it (0 at the start, 1 at the end), the hour it names, and the moment, over a dot. */
type Peek = { share: number; hour: number; moment?: KeyMoment };

/**
 * The time bar, pinned to the bottom of the window: Play and its speed, the date and hour with one sentence
 * about that hour, and a slider whose track is the sunlight of the period. It uses the chart's grid, inset by
 * the chart panel's edge (1 px border, 24 px padding), so the track runs right under the chart's plot and the
 * handle under the chart's time line, Play in the column of the chart's row names. No word in the bar, in any
 * of its modes, is set smaller than 14 px.
 *
 * Play is the bar's one primary control, filled with the ink (gold is the page's one other action), and keeps
 * its word on a phone. It moves a day a second at 1× (PLAY_HPS), in twelve steps of two hours, and the speed
 * button after it, which keeps one width, takes 2× and 4× in turn (`speed`, `onSpeed`). No step jumps a key
 * moment: Play stops on the moment's hour, tells the page (`onArrive`), holds there for `holdMs` still reading
 * Pause, then goes on, never holding on the hour it starts from. The last step stops on the last hour, where the
 * button reads Replay and plays again from the first. The button keeps one width for Play, Pause and Replay, so
 * nothing beside it moves. Play gives way to the hand: a press on the track, a dot or Next, or a key on the
 * slider, pauses it until Play is pressed again. Space on the slider plays and pauses, and with `spaceToPlay`
 * Space anywhere on the page does too, but in a button, a link, a field, editable text or a dialog. With reduced
 * motion Play and its speed are off, and a line says why.
 *
 * The slider covers the strip and every lane under it, so a press on any of them scrubs. Arrow keys move one
 * hour, Page Up and Page Down one day, and Shift with the arrows to the next or the previous moment. A mouse over
 * the track, or a finger or pen held down on it, shows a plate above it, kept inside the track: the date and
 * hour there and, where the bar draws lanes, what they say then in the key's words; over a dot, its moment. The
 * plate only previews, and tells the page the hour (`onHover`). While the pointer is on Explore's chart the
 * date and the words follow it (`hoverHour`); the handle stays.
 *
 * The key names the track's yellow "in sunlight": the hours with any part of the Sun in view from the site,
 * not all those with the Sun up, as a Sun up behind the hills leaves the strip grey. Where no chart is above
 * it (the stand view), `dates` writes the dates under the track, draws the hours Earth is in view as a blue
 * band and names the strip's grey, the hours with none of the Sun in view, "night"; `powered` (1 for each hour
 * with power, 0 without) draws the hours the lander is off as a red band right under the sunlight, with
 * "lander off" in the key. The blue band sits under the red one, and under the blue, on a row of its own, the
 * hours with both power and Earth in view, when the lander can radio home, are a green band ("radio
 * contact"), so the blue runs whole for as long as Earth is in view. With the dates each band is 6 px tall,
 * 2 px under the one above. Explore leaves all of these to its chart.
 *
 * Once the battery has run out in the night, what the lander does after the power comes back holds only if
 * it survives the cold of that night, which the forecast does not work out (it counts energy only): from
 * `ifSurvivesFrom` on, the radio band is hatched in its green rather than solid, and the key names it "radio,
 * if the lander survives the cold" (18.2), after "radio contact" when some of the band is still solid, the
 * hatching named so that the words never read as a fragment.
 *
 * The key names only what the bar draws for the period shown, so no reader goes looking for a band that is
 * not there: each entry comes only with at least one hour of its own band, in its usual place among the
 * others. "in sunlight" needs an hour with some of the Sun, "night" one with none of it, "lander off" one
 * without power, "Earth in view" one with Earth in view, "radio contact" one of solid green and "radio, if the
 * lander survives the cold" one of hatched green. So where the battery runs out before Earth comes into view,
 * all the radio contact comes after the night and the key names only the hatched band; and on Explore, whose
 * key names the yellow alone, a period with no sunlight has no key at all. On a phone a key of more than the
 * yellow folds behind a "Key ▾" button after the date, and opens under it.
 *
 * `moments` puts a 12 px dot on the strip's top edge at each of the period's key moments, at every width and
 * with or without the dates, gold for the one the time is on: a press moves the time there, then tells the page
 * (`onMoment`). Each dot sits at the foot of a target 24 px wide and 40 px tall, over the slider but not over the
 * strip, and dots too close for their targets move apart (`dotShifts`). The keyboard leaves them out, as Next
 * and Shift with the arrows reach every moment; they keep their names for screen readers. Next, after the date
 * and hour, names the moment after the time ("Next: Sunset, 3 Jan ›") and takes the time there as a dot does;
 * after the last moment its place stays, empty. From 640 px up the date and hour keep the width of their widest
 * and Next that of its longest name, so neither moves as the time does; on a phone Next starts a row of its own
 * under Play, with the Key button at its end.
 *
 * `compact` keeps the bar low for the stand view: no sentence beside the date (the page says it in its own
 * words), and with the dates the keys join the date's line from a medium screen up where 28rem is left for them,
 * in two lines at most. With no chart above it to line the track up with, the bar drops the chart panel's inset,
 * and on a phone its keys are a little smaller. `clockNote` puts a few words after the date and hour on a medium
 * screen and up.
 *
 * `bare` is for the stand view's clean view, for a classroom: the picture with as little as possible over it.
 * The bar keeps only Play, the date and hour, the track with its sunlight and handle, and the moments' dots,
 * which name themselves on the plate, so a class can still go from moment to moment without the words coming
 * back.
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
  onArrive,
  onPlay,
  onHover,
  speed: givenSpeed,
  onSpeed,
  holdMs = 1000,
  spaceToPlay = false,
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
   * the date's line from md up where they have room, so the bar stays low. No chart-panel inset at any width, as
   * no chart is above it; on a phone the keys, once opened, a little smaller.
   */
  compact?: boolean;
  /**
   * Only Play, the date and hour, the track with its sunlight and handle, and the moments as dots, at every
   * width: no speed, Next, sentence, keys, lanes or dates.
   */
  bare?: boolean;
  /** The period's key moments in order of time, as dots on the strip's top edge, and named in turn by Next. */
  moments?: KeyMoment[];
  /** Told which moment it was, once a dot, Next or Shift with an arrow key has moved the time there. */
  onMoment?: (m: KeyMoment) => void;
  /** Told which moment it was when Play has stopped on its hour, before it holds there. */
  onArrive?: (m: KeyMoment) => void;
  /** Told when Play starts, Replay and Space too: not when it pauses, nor when the slider, a key or a dot moves the time. */
  onPlay?: () => void;
  /** Told the hour under the pointer on the track or a dot as it moves, and null once it leaves. */
  onHover?: (hour: number | null) => void;
  /** The speed Play runs at, when the page keeps it; else the bar keeps its own, from 1×. */
  speed?: Speed;
  /** Told the next speed when the speed button is pressed. */
  onSpeed?: (s: Speed) => void;
  /** How long Play holds on a moment's hour, in ms. */
  holdMs?: number;
  /** Space plays and pauses from anywhere on the page, but in a button, a link, a field, editable text or a dialog. */
  spaceToPlay?: boolean;
  /**
   * The hour from which the bar's marks that need power hold only if the lander survives the cold of the night:
   * the first hour with power again after the first power cut, or null when it never needs to. From that hour on
   * the radio band is hatched rather than solid, and named "radio, if the lander survives the cold" in the key;
   * only with `dates`.
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
  const reduced = useReducedMotion();
  // Play asked for; it runs only while the system allows motion.
  const [wantsPlay, setWantsPlay] = useState(false);
  const playing = wantsPlay && !reduced;
  const [ownSpeed, setOwnSpeed] = useState<Speed>(1);
  const speed = givenSpeed ?? ownSpeed;
  const [keyOpen, setKeyOpen] = useState(false);
  const [peek, setPeek] = useState<Peek | null>(null);
  const marks = moments ?? NO_MOMENTS;
  // What the dates bring, unless the bar is bare: Earth's band and the radio band, the grey's name and the dates row.
  const rich = dates && !bare;
  const off = powered && !bare ? offRuns(powered.subarray(0, hours)) : [];
  const lit = litRuns(series.sunFraction);
  const earth = rich ? runsWhere(hours, (h) => series.earthVisible[h] === 1) : [];
  const contact = rich && powered ? runsWhere(hours, (h) => powered[h] === 1 && series.earthVisible[h] === 1) : [];
  // From `ifSurvivesFrom` on the contact holds only if the lander survives the cold of the night: those hours are
  // hatched, and a stretch that runs across that hour is split there.
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
  // The key names each kind of green only when some hour of it is drawn: a band all hatched, as when the battery
  // runs out before Earth comes into view, has no solid "radio contact" to name.
  const solid = contactRuns.some((r) => !r.ifSurvives);
  const ifSurvives = contactRuns.some((r) => r.ifSurvives);
  // The strip is grey wherever the yellow leaves a gap: by its own rule, an hour with any part of the Sun is yellow.
  const sunless = rich && lit.reduce((n, r) => n + r.to - r.from, 0) < hours;
  // A period without such an hour has no yellow, so nothing for "in sunlight" to name.
  const sunlit = lit.length > 0;
  // With the dates each band is 6 px tall and at least as wide, so one hour still shows as a dot, and each key's
  // swatch is a line as thick as its band. The off band alone, without the dates, keeps to 4 px.
  const band = dates ? { h: 'h-1.5', minW: 'min-w-1.5', swatch: 'border-y-2' } : { h: 'h-1', minW: 'min-w-1', swatch: 'border-y-[3px]' };
  // The keys beyond the Sun's; on a phone they fold behind the Key button.
  const keys = !bare && (sunless || off.length > 0 || earth.length > 0);
  // How far crowded dots move apart depends on the track's width, measured once the row is drawn (1000 px until then).
  const { ref: rowRef, width: trackPx } = useElementWidth<HTMLDivElement>(1000);
  const shifts = dotShifts(marks, hours, trackPx);
  // Next comes with the moments, but not when bare; after the last moment its place stays, empty.
  const nexts = !bare && marks.length > 0;
  const next = nexts ? after(marks, cursor) : undefined;
  const widest = useMemo(() => (nexts ? widestDates(startUtc, last) : []), [nexts, startUtc, last]);

  // What Play reads while it runs, as the page last drew the bar; the hour is the page's, or the step Play took last.
  const cursorRef = useRef(cursor);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  const live = useRef({ last, speed, marks, holdMs, reduced, onCursor, onArrive, toggle: () => {} });

  const move = (to: number) => onCursor(Math.max(0, Math.min(last, to)));
  const pause = () => setWantsPlay(false);
  const start = () => {
    if (reduced) return;
    // At the last hour Play is Replay: it plays again from the first hour.
    const from = cursor >= last ? 0 : cursor;
    if (from !== cursor) onCursor(from);
    cursorRef.current = from;
    // A press that starts the playback tells the page, and one that pauses it does not. onCursor cannot say which:
    // the slider, the keys and the dots fire it too.
    onPlay?.();
    setWantsPlay(true);
  };
  const toggle = () => (playing ? pause() : start());
  const jump = (m: KeyMoment) => {
    pause();
    move(m.hour);
    onMoment?.(m);
  };
  useEffect(() => {
    live.current = { last, speed, marks, holdMs, reduced, onCursor, onArrive, toggle };
  });
  // Luna's player (spec 22): the bar's own steps, said in words where they have some to say.
  const setSpeed = (to: Speed) => {
    if (givenSpeed === undefined) setOwnSpeed(to);
    onSpeed?.(to);
  };
  const SPEED_SAID: Record<Speed, string> = { 1: 'Normal speed.', 2: 'Twice as fast.', 4: 'Four times as fast.' };
  const OFF = 'Playback is off because your system asks for reduced motion.';
  useLunaControls({
    play: () => {
      if (reduced) return OFF;
      if (!playing) start();
    },
    pause,
    next: () => {
      const m = after(marks, cursor);
      if (!m) return 'There is no moment after this one.';
      jump(m);
      return m.label;
    },
    previous: () => {
      const m = before(marks, cursor);
      if (!m) return 'There is no moment before this one.';
      jump(m);
      return m.label;
    },
    faster: () => {
      const i = SPEEDS.indexOf(speed);
      if (i === SPEEDS.length - 1) return 'Already at the fastest.';
      setSpeed(SPEEDS[i + 1]);
      return SPEED_SAID[SPEEDS[i + 1]];
    },
    slower: () => {
      const i = SPEEDS.indexOf(speed);
      if (i === 0) return 'Already at normal speed.';
      setSpeed(SPEEDS[i - 1]);
      return SPEED_SAID[SPEEDS[i - 1]];
    },
    replay: () => {
      if (reduced) return OFF;
      onCursor(0);
      cursorRef.current = 0;
      onPlay?.();
      setWantsPlay(true);
    },
  });

  useEffect(() => {
    if (!wantsPlay) return;
    let timer = 0;
    const step = () => {
      const { last, speed, marks, holdMs, reduced, onCursor, onArrive } = live.current;
      const from = cursorRef.current;
      if (reduced || from >= last) {
        setWantsPlay(false);
        return;
      }
      // A step that would reach or pass the next moment stops on its hour, and holds there.
      const ahead = after(marks, from);
      const arrive = ahead && ahead.hour <= from + (PLAY_HPS / STEPS_PER_SECOND) * speed ? ahead : undefined;
      const to = arrive ? arrive.hour : Math.min(last, from + (PLAY_HPS / STEPS_PER_SECOND) * speed);
      cursorRef.current = to;
      onCursor(to);
      if (arrive) onArrive?.(arrive);
      if (to >= last) setWantsPlay(false);
      else timer = window.setTimeout(step, arrive ? holdMs : 1000 / STEPS_PER_SECOND);
    };
    timer = window.setTimeout(step, 1000 / STEPS_PER_SECOND);
    return () => window.clearTimeout(timer);
  }, [wantsPlay]);

  useEffect(() => {
    if (!spaceToPlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t instanceof Element && (t.closest(SPACE_IS_THEIRS) || (t as HTMLElement).isContentEditable)) return;
      // With reduced motion Play is off, and Space scrolls the page as it always does.
      if (live.current.reduced) return;
      e.preventDefault();
      if (!e.repeat) live.current.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [spaceToPlay]);

  // The plate over the track: shown under a mouse, or under a finger or pen held down, and told to the page.
  const rangeRef = useRef<HTMLInputElement>(null);
  const pressed = useRef(false);
  const told = useRef<number | null>(null);
  const tell = (hour: number | null) => {
    if (told.current === hour) return;
    told.current = hour;
    onHover?.(hour);
  };
  const unpeek = () => {
    pressed.current = false;
    setPeek(null);
    tell(null);
  };
  const look = (e: ReactPointerEvent<HTMLElement>) => {
    const target = e.target as Element;
    const dot = target.closest('[data-part="moment"]');
    if (dot) {
      const i = Number(dot.getAttribute('data-index'));
      const m = marks[i];
      if (!m) return;
      setPeek({ share: Math.min(1, Math.max(0, (hours > 0 ? m.hour / hours : 0) + shifts[i] / trackPx)), hour: m.hour, moment: m });
      tell(m.hour);
      return;
    }
    const range = rangeRef.current;
    if (!range || target !== range) {
      setPeek(null);
      tell(null);
      return;
    }
    const box = range.getBoundingClientRect();
    if (!(box.width > 0)) return;
    const x = e.clientX - box.left;
    const hour = Math.min(last, Math.max(0, Math.round(((x - THUMB_PX / 2) / Math.max(1, box.width - THUMB_PX)) * last)));
    setPeek({ share: Math.min(1, Math.max(0, x / box.width)), hour });
    tell(hour);
  };
  // What the lanes say at an hour, in the key's own words and order.
  const laneWords = (h: number): string[] => {
    if (!rich) return [];
    const words = [series.sunFraction[h] > 0 ? 'in sunlight' : 'night'];
    if (powered?.[h] === 0) words.push('lander off');
    if (series.earthVisible[h] === 1) words.push('Earth in view');
    if (powered?.[h] === 1 && series.earthVisible[h] === 1) words.push(h >= survives ? 'radio, if the lander survives the cold' : 'radio contact');
    return words;
  };

  const shown = Math.min(last, hoverHour ?? cursor);
  const ended = !playing && cursor >= last;
  const noted = !!clockNote && !bare;
  const when = (
    <span data-testid="when" className="col-start-1 row-start-1 text-[17px] font-semibold">
      {dateTimeUtc(startUtc, shown)}
    </span>
  );
  // The track's yellow is the site in sunlight, not progress: a key says so, when any yellow is drawn. Not "Sun
  // up": a Sun up behind the hills leaves the strip grey.
  const sunKey = (
    <span data-part="key" className="flex items-center gap-2 text-[15px] text-ink-2 sm:ml-auto">
      <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full bg-sun" />
      in sunlight
    </span>
  );
  // Each of the period's moments named as Next names it, unseen in Next's own cell, so Next keeps the width of the
  // longest. Drawn by the stylesheet from --sizer rather than written, so the page's words hold each name once.
  const nextNames = marks.map((m, i) => (
    <span
      key={`${i} ${m.label}`}
      data-sizer=""
      aria-hidden="true"
      className="invisible col-start-1 row-start-1 whitespace-nowrap before:content-[var(--sizer)] max-sm:hidden"
      style={{ '--sizer': cssString(`Next: ${m.label} ›`) } as CSSProperties}
    />
  ));
  // On a phone the sentence keeps two lines and the key goes under it, so the bar keeps one height as the words change.
  const status = !compact && !bare && (
    <span data-testid="status" className="text-pretty text-[15px] text-ink-2 max-sm:min-h-[2lh] max-sm:basis-full">
      {statusSentence(series, power, shown, batteryWh)}
    </span>
  );
  // With the sentence, the time to the next sunset or sunrise and to Earth's next rising or setting: a slot as wide as the
  // widest it gets in the period, on the date's line after Next from 640 px up, and a row of its own on a phone, at 14 px
  // there so its two parts keep one line. From 640 px up an empty break of the line's width then puts the sentence and the
  // key on the next line, so a sentence that grows pushes nothing about.
  const countdown = !compact && !bare && (
    <>
      <CountdownLine series={series} hour={shown} className="text-[15px] text-ink max-sm:col-span-3 max-sm:text-[14px]" />
      <span data-part="break" aria-hidden="true" className="hidden sm:block sm:h-0 sm:basis-full" />
    </>
  );
  const reducedLine = reduced && !bare && <span className="text-[15px] text-ink-2">Playback is off because your system asks for reduced motion.</span>;
  const keyLine: ReactNode = bare ? null : keys ? (
    // The keys wrap as one, so none strays to the far side of a new line. Each swatch is a box as tall as the
    // Sun's, so all of them keep one baseline. With the dates there are up to six, too many to fit beside a long
    // sentence even on a wide screen: they take a line of their own, so the bar keeps one height while the words
    // change. Compact, there is no sentence: from md up they ask for 28rem, room for five entries in two lines, and
    // join the date's line after Next where that is left, taking the rest of it, their entries at its right end
    // (else they go to the next line whole, at the right all the same); each line is 20 px, so two are no taller
    // than the buttons beside them. On a phone they fold behind the Key button; opened, they stand under the date,
    // compact at 14 px with shorter swatches.
    <span
      className={[
        'flex flex-wrap items-baseline gap-x-3 leading-5',
        dates ? 'basis-full sm:justify-end' : 'sm:ml-auto',
        compact && 'max-sm:gap-x-2 max-sm:[&>span]:text-[14px] max-sm:[&_i]:w-4',
        compact && dates && 'md:ml-auto md:basis-[28rem] md:grow',
        !keyOpen && 'max-sm:hidden',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {sunlit && sunKey}
      {sunless && (
        <span data-part="key-no-sun" className="flex items-center gap-2 text-[15px] text-ink-2">
          {/* The strip's own grey, where no yellow is drawn, with an edge light enough to see on the dark bar. */}
          <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border border-ink-3 bg-surface-2" />
          night
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
      {solid && (
        <span data-part="key-contact" className="flex items-center gap-2 text-[15px] text-ink-2">
          <i data-swatch="" aria-hidden="true" className="block h-2.5 w-6 rounded-full border-y-2 border-transparent bg-good bg-clip-padding" />
          radio contact
        </span>
      )}
      {ifSurvives && (
        <span data-part="key-if-survives" className="flex items-center gap-2 text-[15px] text-ink-2">
          {/* The band's own stripes, in a line as thick as the band. */}
          <i data-swatch="" aria-hidden="true" className={`block h-2.5 w-6 rounded-full border-y-2 border-transparent bg-clip-padding ${HATCH}`} />
          {/* On a phone the key opens under the date (about 358 px at 390 px): the full words would wrap and take a
              line from the scene (18.3), so a shorter copy shows there (display: none keeps the other out of the
              accessibility tree). */}
          <span data-wide="" className="max-sm:hidden">
            radio, if the lander survives the cold
          </span>
          <span data-phone="" className="sm:hidden">
            radio if it survives the cold
          </span>
        </span>
      )}
    </span>
  ) : (
    sunlit && sunKey
  );
  const lanes = peek && !peek.moment ? laneWords(peek.hour) : [];

  return (
    <section aria-label="Time" className="sticky bottom-0 z-30 border-t border-line bg-page">
      <div className="wrap">
        {/* On a phone three columns, Play's, the speed's and the date's, then rows as wide as the bar: Next with the Key
            button, the words, and the track. The rows are flush there, as their targets are 40 px tall, so the bar is no
            taller than when the keys stood under the date. Compact (the stand view), no chart is above the bar to line the
            track up with, so it drops the chart panel's inset at every width: room for Play's word and the speed on a
            phone, and for Next on the date's line from 768 px. On Explore's phone the inset stays with the track alone,
            under the chart's plot, and the date's line takes the whole width, so the date keeps one line (21.1). */}
        <div
          data-part="bar-grid"
          className={`${PLOT_GRID} items-center gap-y-1 py-2.5 max-sm:grid-cols-[auto_auto_minmax(0,1fr)] max-sm:gap-x-2 max-sm:gap-y-0 ${compact ? 'px-0' : 'px-[25px] max-sm:px-0'}`}
        >
          {/* Play, Pause or Replay at one width, in the column of the chart's row names; its sign never shrinks. Level with
              the speed and Next on the date's line; bare, with nothing on that line but the date, beside the date and the
              track both, so the bar stays as low as before. */}
          <button
            type="button"
            disabled={reduced}
            onClick={toggle}
            className={`btn btn-ink h-10 w-[104px] gap-2 px-3 ${bare ? 'row-span-2 self-center max-sm:row-span-1' : 'self-start'}`}
          >
            <svg data-sign={playing ? 'pause' : ended ? 'replay' : 'play'} viewBox="0 0 16 16" width={14} height={14} fill="currentColor" aria-hidden="true" className="shrink-0">
              {playing ? (
                <path d="M3 2h4v12H3zM9 2h4v12H9z" />
              ) : ended ? (
                // An open circle run anticlockwise from 10 o'clock round to 12, its head there pointing back.
                <>
                  <path d="M3.45 6.38A5.25 5.25 0 1 0 8 3.75" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                  <path d="M8.75 0.75v6l-4-3z" />
                </>
              ) : (
                <path d="M4 2l10 6-10 6z" />
              )}
            </svg>
            <span>{playing ? 'Pause' : ended ? 'Replay' : 'Play'}</span>
          </button>
          {/* The date's line: the speed, the date and hour, Next, the words and the keys. On a phone it gives up its own box,
              so the speed and the date take a column each beside Play, and what follows a row of the bar's whole width. */}
          <div data-part="line" className={`flex flex-wrap items-center gap-x-3 leading-snug max-sm:contents${bare ? '' : ' min-h-10'}`}>
            {!bare && (
              <button
                type="button"
                disabled={reduced}
                aria-label={`Speed ${speed}×: ${SPEED_WORDS[speed]}`}
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                className="btn h-10 w-11 shrink-0 px-0 text-[15px]"
              >
                {speed}×
              </button>
            )}
            {/* The date and hour over the widest of each month's, unseen, so from 640 px up Next after them stays put. Those
                are drawn by the stylesheet in the date's type, the note after them in its own, rather than written. */}
            <p data-part="readout" className="grid">
              {widest.map((d) => (
                <span
                  key={d}
                  data-sizer=""
                  aria-hidden="true"
                  className={`invisible col-start-1 row-start-1 whitespace-nowrap before:text-[17px] before:font-semibold before:content-[var(--sizer)] max-sm:hidden${noted ? ' after:text-[15px] after:content-[var(--note)] max-md:after:hidden' : ''}`}
                  style={{ '--sizer': cssString(d), ...(noted ? { '--note': cssString(clockNote) } : {}) } as CSSProperties}
                />
              ))}
              {noted ? (
                // The note follows the date and hour in the same run of words, never on a line of its own.
                <span className="col-start-1 row-start-1 md:whitespace-nowrap">
                  {when}
                  <span data-testid="clock-note" className="text-[15px] text-ink-2 max-md:hidden">
                    {clockNote}
                  </span>
                </span>
              ) : (
                when
              )}
            </p>
            {(nexts || keys) && (
              // From 640 px up Next is part of the date's line; on a phone it starts a row of its own, the Key button at its end.
              <div className="contents max-sm:col-span-3 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:gap-x-3">
                {nexts &&
                  (next ? (
                    <button type="button" data-part="next" onClick={() => jump(next)} className="btn grid h-10 shrink-0 justify-items-center px-3 text-center text-[15px]">
                      {nextNames}
                      <span data-label="" className="col-start-1 row-start-1">
                        <span className="text-ink-2">Next:</span> {next.label}
                        <span aria-hidden="true"> ›</span>
                      </span>
                    </button>
                  ) : (
                    <span data-part="next" aria-hidden="true" className="btn invisible grid h-10 shrink-0 justify-items-center px-3 text-center text-[15px]">
                      {nextNames}
                    </span>
                  ))}
                {keys && (
                  <button
                    type="button"
                    aria-expanded={keyOpen}
                    onClick={() => setKeyOpen((open) => !open)}
                    className="h-10 shrink-0 cursor-pointer px-1 text-[14px] text-ink underline underline-offset-4 sm:hidden max-sm:ml-auto"
                  >
                    Key<span aria-hidden="true"> {keyOpen ? '▴' : '▾'}</span>
                  </button>
                )}
              </div>
            )}
            {countdown}
            {(status || reducedLine || keyLine) && (
              <div className="contents max-sm:col-span-3 max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-3">
                {/* Compact, the page says it in its own words; the slider still reads it. Bare, the date and hour are all. */}
                {status}
                {reducedLine}
                {keyLine}
              </div>
            )}
          </div>
          <div
            data-part="track"
            className={`relative col-start-2 max-sm:col-span-3 max-sm:col-start-1 max-sm:mt-1${compact ? '' : ' max-sm:mx-[25px]'}`}
            onPointerMove={(e) => {
              if (e.pointerType === 'mouse' || pressed.current) look(e);
            }}
            onPointerDown={(e) => {
              pressed.current = true;
              look(e);
            }}
            onPointerUp={unpeek}
            onPointerCancel={unpeek}
            onPointerLeave={unpeek}
          >
            {marks.length > 0 && (
              // Right above the strip and on its hours, 27 px tall: with the grid's 4 px above it and the slider's 9 px over
              // the strip under it, room for targets 40 px tall that stay clear of the date's line above and of the strip
              // below, which the slider keeps for scrubbing. The row is lifted over the slider, so the targets win those 9 px.
              <div ref={rowRef} data-part="moments" role="group" aria-label="Jump to a moment" className="relative z-[1] h-[27px]">
                {marks.map((m, i) => {
                  // The moment the time is on is chosen: a gold dot.
                  const chosen = cursor === m.hour;
                  // The target starts half a target back from its dot, which may have moved off its hour to keep clear of a
                  // neighbour's target (`dotShifts`); its foot on the strip's top edge, the dot at its foot, lighter under
                  // the pointer. Left out of the keyboard's way: Next and Shift with the arrows reach every moment.
                  return (
                    <button
                      key={`${m.hour} ${m.label}`}
                      type="button"
                      tabIndex={-1}
                      data-part="moment"
                      data-index={i}
                      aria-label={m.label}
                      aria-current={chosen ? 'true' : undefined}
                      onClick={() => jump(m)}
                      className="absolute -bottom-[9px] ml-[var(--dot-x)] h-10 w-6 cursor-pointer rounded-full hover:bg-line focus-visible:bg-line"
                      style={{ left: `${hours > 0 ? (m.hour / hours) * 100 : 0}%`, '--dot-x': `${shifts[i] - DOT_TARGET / 2}px` } as CSSProperties}
                    >
                      <span className="sr-only">{m.label}</span>
                      <i data-part="moment-dot" aria-hidden="true" className={`absolute bottom-0 left-1/2 block size-3 -translate-x-1/2 rounded-full ${chosen ? 'bg-sun' : 'bg-ink'}`} />
                    </button>
                  );
                })}
              </div>
            )}
            {/* With the dates the box is 47 px tall, room for the three bands under the strip, and the slider covers all of it.
                Bare, there are none. */}
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
              {/* Over the lanes too (data-lanes, 47 px), its handle on the strip all the same (globals.css). A press on it,
                  or a key, pauses Play; Space plays and pauses. */}
              <input
                ref={rangeRef}
                type="range"
                aria-label="Time"
                aria-valuetext={`${dateTimeUtc(startUtc, cursor)}: ${statusSentence(series, power, Math.min(last, cursor), batteryWh)}`}
                data-lanes={rich ? '' : undefined}
                min={0}
                max={last}
                step={1}
                value={cursor}
                onPointerDown={pause}
                onChange={(e) => {
                  pause();
                  onCursor(Number(e.target.value));
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ') {
                    e.preventDefault();
                    if (!e.repeat) toggle();
                    return;
                  }
                  if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                    e.preventDefault();
                    pause();
                    const m = e.key === 'ArrowRight' ? after(marks, cursor) : before(marks, cursor);
                    if (m) jump(m);
                    return;
                  }
                  const step: Record<string, number> = { ArrowRight: cursor + 1, ArrowUp: cursor + 1, ArrowLeft: cursor - 1, ArrowDown: cursor - 1, PageUp: cursor + 24, PageDown: cursor - 24, Home: 0, End: last };
                  if (!(e.key in step)) return;
                  e.preventDefault();
                  pause();
                  move(step[e.key]);
                }}
                className="time-range relative block"
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
            {peek && (
              // Above the track, kept inside it: at the pointer's share of the track, drawn back by as much of its own
              // width, so at the start it starts there, at the end it ends there, and the pointer is always under it. A
              // preview only, which takes no presses; the slider says the hour to a screen reader.
              <div
                data-part="peek"
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full z-20 mb-1 whitespace-nowrap rounded border border-line-strong bg-surface px-2 py-1 text-[14px] leading-snug text-ink"
                style={{ left: `${peek.share * 100}%`, transform: `translateX(-${peek.share * 100}%)` }}
              >
                {peek.moment ? (
                  peek.moment.label
                ) : (
                  <>
                    <span className="block font-semibold">{`${dayMonth(startUtc, peek.hour)}, ${clockUtc(startUtc, peek.hour)}`}</span>
                    {lanes.length > 0 && <span className="block text-ink-2">{lanes.join(' · ')}</span>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
