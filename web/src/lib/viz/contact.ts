import { contactWindows, type Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { clockUtc, dayMonth, spanShort } from './format';

/**
 * A radio window: a stretch of hours with Earth in view from the site (countdown's earthInView: the centre of Earth's
 * disc over the skyline by the clearance set), as the engine's contactWindows finds them, half-open [start, end) on the
 * period's hours. It is geometric direct-to-Earth visibility only: a clear line to Earth, not a working link, which also
 * needs the antennas, the link budget, a free ground station and a scheduled pass.
 */
export interface RadioWindow {
  /** The first hour with Earth in view: the window opens within the hour before it, or before the period when `fromStart`. */
  start: number;
  /** The first hour after it without (the period's length when `toEnd`). */
  end: number;
  hours: number;
  /** Already open at the period's first hour: it may have opened earlier, so it can be longer than `hours`. */
  fromStart: boolean;
  /** Still open at the period's last hour: it may close later. */
  toEnd: boolean;
  /** Hours of it with the lander powered, by the battery walk. */
  poweredHours: number;
  /** Of those, the hours after the first power cut: they hold only if the lander survives the cold without power. */
  ifSurvivesHours: number;
}

/** The longest stretch without Earth in view. `fromStart` or `toEnd` when an edge of the period cuts it: it may be longer. */
export interface Outage {
  start: number;
  end: number;
  hours: number;
  fromStart: boolean;
  toEnd: boolean;
}

/** The period's radio windows, and what the lander can make of them. */
export interface ContactPlan {
  /** The period's length in hours. */
  hours: number;
  windows: RadioWindow[];
  /** Hours with Earth in view. */
  totalHours: number;
  /** Null when Earth never leaves the view. Its length is the summary's longest time without Earth. */
  longestOutage: Outage | null;
  /**
   * Powered contact: hours with Earth in view and the lander powered. `sureHours` are those before the first power cut
   * (the radio contact while it has power that the answer and the numbers card give); the rest come after a night without
   * power and hold only if the lander survives it, which the forecast does not work out.
   */
  poweredHours: number;
  sureHours: number;
  /** The first hour with power again after the first power cut; null when the power never fails, or never comes back. */
  ifSurvivesFrom: number | null;
  /** The first hour without power (the battery's first run-out); null when the power never fails or is not known. */
  firstCut: number | null;
}

/** The first hour with power again after the first power cut, or null. */
export function ifSurvivesFrom(power: Pick<PowerResult, 'powered' | 'firstBrownoutHour'>): number | null {
  if (power.firstBrownoutHour === null) return null;
  for (let h = power.firstBrownoutHour; h < power.powered.length; h++) if (power.powered[h] === 1) return h;
  return null;
}

/**
 * The radio windows of a period and their overlap with the lander's power: every window's opening, closing and length,
 * the hours with Earth in view in all, the longest time without it (counting the stretches the period's start and end
 * cut short, as the summary does), and the powered contact, window by window. `power` is null until the battery walk is
 * known: no window then has power.
 */
export function contactPlan(series: Series, power: Pick<PowerResult, 'powered' | 'firstBrownoutHour'> | null): ContactPlan {
  const n = series.hours;
  const revived = power ? ifSurvivesFrom(power) : null;
  const after = revived ?? Infinity;
  let poweredHours = 0;
  let sureHours = 0;
  const windows: RadioWindow[] = contactWindows(series).map(({ start, end }) => {
    let on = 0;
    let conditional = 0;
    for (let h = start; h < end; h++) {
      if (power?.powered[h] !== 1) continue;
      on++;
      if (h >= after) conditional++;
    }
    poweredHours += on;
    sureHours += on - conditional;
    return { start, end, hours: end - start, fromStart: start === 0, toEnd: end === n, poweredHours: on, ifSurvivesHours: conditional };
  });
  // The stretches without Earth: before the first window, between windows, after the last; the whole period without one.
  let longestOutage: Outage | null = null;
  let from = 0;
  for (const edge of [...windows.map((w) => [w.start, w.end]), [n, n]]) {
    const [to, next] = edge;
    if (to > from && (!longestOutage || to - from > longestOutage.hours)) longestOutage = { start: from, end: to, hours: to - from, fromStart: from === 0, toEnd: to === n };
    from = next;
  }
  return { hours: n, windows, totalHours: windows.reduce((sum, w) => sum + w.hours, 0), longestOutage, poweredHours, sureHours, ifSurvivesFrom: revived, firstCut: power?.firstBrownoutHour ?? null };
}

/**
 * The powered contact for a figure: the value is the hours with Earth in view from landing until the battery first runs
 * out (the answer's and the numbers card's "radio contact while it has power"), the note what bounds it and, apart from
 * it, the hours after the power comes back, which hold only if the lander survives the cold: "none", "until the battery
 * runs out; 3 d 5 h after, if the lander survives the cold".
 */
export function poweredContactWords(plan: ContactPlan): { value: string; note: string } {
  const value = plan.sureHours > 0 ? spanShort(plan.sureHours) : 'none';
  if (plan.totalHours === 0) return { value, note: 'Earth is never in view' };
  if (plan.firstCut === null) return { value, note: 'every hour Earth is in view' };
  const later = plan.poweredHours - plan.sureHours;
  return { value, note: later > 0 ? `until the battery runs out; ${spanShort(later)} ${plan.sureHours > 0 ? 'more ' : ''}after, if the lander survives the cold` : 'until the battery runs out' };
}

/** How many windows the period's hours with Earth in view fall in, for the note under their total: "in 3 windows". */
export function windowsCountWords(plan: ContactPlan): string {
  const n = plan.windows.length;
  return n === 0 ? 'in no window' : `in ${n} window${n === 1 ? '' : 's'}`;
}

/** How much of a window the lander has power for: all of it, part, only if it survives the cold after a power cut, or none. */
export type WindowUse = 'all' | 'part' | 'if-survives' | 'none';

export function windowUse(w: RadioWindow): WindowUse {
  if (w.poweredHours === 0) return 'none';
  const sure = w.poweredHours - w.ifSurvivesHours;
  if (sure === w.hours) return 'all';
  return sure === 0 ? 'if-survives' : 'part';
}

/**
 * A window's power in words, the condition always beside the power it holds for: "power throughout", "power for 4 h of
 * it", "power for 3 d 5 h of it, if the lander survives the cold", "no power: the lander is off".
 */
export function windowUseWords(w: RadioWindow): string {
  const IF = 'if the lander survives the cold';
  switch (windowUse(w)) {
    case 'all':
      return 'power throughout';
    case 'none':
      return 'no power: the lander is off';
    case 'if-survives':
      return w.poweredHours === w.hours ? `power throughout, ${IF}` : `power for ${spanShort(w.poweredHours)} of it, ${IF}`;
    default:
      return w.ifSurvivesHours > 0 ? `power for ${spanShort(w.poweredHours)} of it, ${spanShort(w.ifSurvivesHours)} of that ${IF}` : `power for ${spanShort(w.poweredHours)} of it`;
  }
}

/** The next opening or closing of a radio window after an hour. */
export interface RadioChange {
  kind: 'opens' | 'closes';
  /** The first hour of the new state, as Earth's countdown gives it. */
  at: number;
  inHours: number;
  window: RadioWindow;
}

/** The window an hour falls in, if any. */
export function windowAt(plan: ContactPlan, hour: number): RadioWindow | undefined {
  return plan.windows.find((w) => w.start <= hour && hour < w.end);
}

/**
 * From an hour: the closing of the window it falls in, or the opening of the next one. Null when the window runs to the
 * end of the period, or none opens before it ends: nothing is said of what follows the period.
 */
export function nextRadioChange(plan: ContactPlan, hour: number): RadioChange | null {
  const open = windowAt(plan, hour);
  if (open) return open.toEnd ? null : { kind: 'closes', at: open.end, inHours: open.end - hour, window: open };
  const next = plan.windows.find((w) => w.start > hour);
  return next ? { kind: 'opens', at: next.start, inHours: next.start - hour, window: next } : null;
}

/** The time of an hour of the period, as the windows list writes it: "10 Jan, 03:00 UTC". */
export const whenUtc = (startUtc: string, hour: number) => `${dayMonth(startUtc, hour)}, ${clockUtc(startUtc, hour)} UTC`;

/**
 * The next opening or closing in words, with its time in UTC and how far off it is: "Next window opens 10 Jan, 03:00 UTC,
 * in 9 d 3 h", "This window closes 23 Jan, 15:00 UTC, in 2 d 4 h"; or "This window stays open to the end of the period",
 * "No window opens before the period ends".
 */
export function radioChangeWords(plan: ContactPlan, hour: number, startUtc: string): string {
  const c = nextRadioChange(plan, hour);
  if (!c) return windowAt(plan, hour) ? 'This window stays open to the end of the period' : 'No window opens before the period ends';
  return `${c.kind === 'opens' ? 'Next window opens' : 'This window closes'} ${whenUtc(startUtc, c.at)}, in ${spanShort(c.inHours)}`;
}

/**
 * Where the longest time without Earth lies, for the note under it: its days ("4 Jan to 10 Jan"), or, when an edge of the
 * period cuts it, that edge, as it may have begun earlier or go on later.
 */
export function outageNote(o: Outage | null, startUtc: string): string {
  if (!o) return 'Earth never leaves the view';
  if (o.fromStart && o.toEnd) return 'the whole period';
  if (o.fromStart) return 'from the start of the period';
  if (o.toEnd) return 'to the end of the period';
  return `${dayMonth(startUtc, o.start)} to ${dayMonth(startUtc, o.end)}`;
}

/** The longest time without Earth for a card: "16 d 12 h", "at least 9 d 3 h" when an edge of the period cuts it, or "none". */
export function outageWords(o: Outage | null): string {
  if (!o) return 'none';
  return o.fromStart || o.toEnd ? `at least ${spanShort(o.hours)}` : spanShort(o.hours);
}
