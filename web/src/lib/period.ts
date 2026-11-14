import { DAYS_RANGE } from './planner-ranges';
import { dateLong, spanWords } from './viz/format';

/**
 * The period every figure is for: a landing in UTC on a whole hour, and a length in whole days. The period controls,
 * the store, links, the assistant and Luna all go through these small functions, so a period means the same
 * everywhere. Server-safe: the chat route loads it, so it must not load the browser store.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The years of the hourly Sun and Earth table (data/ephemeris); a period outside them cannot be worked out. */
export const EPHEMERIS_YEARS = { first: 2024, last: 2036 };
/** The hour after the table's last row (31 December 2036, 23:00 UTC): a period must end by it. */
export const TABLE_END_MS = Date.UTC(EPHEMERIS_YEARS.last + 1, 0, 1);
/** The first landing the app offers: a day into the table, as the date box always offered. */
export const FIRST_START = '2024-01-02T00:00:00';
const FIRST_START_MS = Date.parse(`${FIRST_START}Z`);

const msOf = (iso: string) => Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const year = (iso: string) => iso.slice(0, 4);

/** The length a link, a field or the assistant gives, as whole days within DAYS_RANGE; null for anything else. */
export function periodDays(x: unknown): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN;
  return Number.isInteger(n) && n >= DAYS_RANGE.min && n <= DAYS_RANGE.max ? n : null;
}

/**
 * The landing at the nearest whole hour, half an hour and more rounding up: the engine reads the hourly table at the
 * row nearest the start (indexForEt rounds), and its rows fall on whole UTC hours.
 */
export function snapToHour(iso: string): string {
  const ms = msOf(iso);
  return Number.isNaN(ms) ? iso : isoOf(Math.round(ms / HOUR_MS) * HOUR_MS);
}

/** The latest landing from which a period of `days` still ends inside the table: "2036-10-03T00:00:00" for 90 days. */
export function lastStart(days: number): string {
  return isoOf(TABLE_END_MS - days * DAY_MS);
}

/** A landing for sentences, always with its hour: "20 January 2027, 17:00 UTC". */
export function startWords(startUtc: string): string {
  return `${dateLong(startUtc, 0)} ${year(startUtc)}, ${startUtc.slice(11, 16)} UTC`;
}

/**
 * A landing in a sentence: its day, and its hour in UTC too when it is not at midnight ("20 January at 17:00 UTC"),
 * as the better landing's note names it; with `year`, the year after the day ("20 January 2027 at 17:00 UTC").
 */
export function landingWords(startUtc: string, year = false): string {
  const day = `${dateLong(startUtc, 0)}${year ? ` ${startUtc.slice(0, 4)}` : ''}`;
  const clock = startUtc.slice(11, 16);
  return clock === '00:00' ? day : `${day} at ${clock} UTC`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The period as the brief prints it and a planner copies it: "20 Jan 2027, 17:00 UTC, 7 days". */
export function periodWords(startUtc: string, days: number): string {
  const d = new Date(msOf(startUtc));
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${startUtc.slice(11, 16)} UTC, ${days} days`;
}

/** A shift of the landing in words, without its direction: "5 days", "6 hours", "1 day 6 hours". */
export function shiftWords(hours: number): string {
  return spanWords(Math.abs(hours));
}

/**
 * Why a period cannot be worked out, in plain words with the exact limit; null when it can. A visitor reaches this
 * by choosing a late date, so the table's rows and indices stay out of it.
 */
export function periodProblem(startUtc: string, days: number): string | null {
  if (periodDays(days) === null) return `A period is ${DAYS_RANGE.min} to ${DAYS_RANGE.max} whole days.`;
  const start = msOf(startUtc);
  if (Number.isNaN(start)) return 'A landing needs a date and a time.';
  const period = `A ${days}-day period from ${startWords(startUtc)}`;
  if (start + days * DAY_MS > TABLE_END_MS) {
    return `${period} runs past 31 December ${EPHEMERIS_YEARS.last}, where the Sun and Earth table ends. The latest landing for ${days} days is ${startWords(lastStart(days))}.`;
  }
  if (start < FIRST_START_MS) return `${period} starts before ${startWords(FIRST_START)}, the first landing the Sun and Earth table allows.`;
  return null;
}

/** A new date from the date box, keeping the landing hour; null for a date that is not a whole four-digit-year date. */
export function withDate(startUtc: string, date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const iso = `${date}T${startUtc.slice(11, 19)}`;
  const ms = msOf(iso);
  return Number.isNaN(ms) || isoOf(ms) !== iso ? null : iso;
}

/**
 * A new time of day from the time box ("17:00", or "17:40" with its minutes), keeping the date: the minutes round to
 * the nearest hour as the engine does, and `rounded` says they did, so the page can say so; 23:30 and later is the
 * next day's 00:00. Null for a cleared box or a time no clock shows ("24:00").
 */
export function withClock(startUtc: string, clock: string): { startUtc: string; rounded: boolean } | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(clock);
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || s > 59) return null;
  const midnight = msOf(`${startUtc.slice(0, 10)}T00:00:00`);
  const exact = midnight + (h * 3600 + min * 60 + s) * 1000;
  const snapped = Math.round(exact / HOUR_MS) * HOUR_MS;
  return { startUtc: isoOf(snapped), rounded: snapped !== exact };
}

/**
 * The landing moved by `byHours` (later when positive), keeping the length; a part of an hour rounds as the engine
 * does. A move past either end of the table stops at the end, and `note` says so in plain words.
 */
export function shiftPeriod(startUtc: string, days: number, byHours: number): { startUtc: string; note: string | null } {
  const wanted = Math.round((msOf(startUtc) + byHours * HOUR_MS) / HOUR_MS) * HOUR_MS;
  const last = TABLE_END_MS - days * DAY_MS;
  const moved = (to: number) => (to === msOf(startUtc) ? 'the landing stays there' : 'the landing moved there');
  if (wanted > last) {
    return { startUtc: isoOf(last), note: `The Sun and Earth table ends on 31 December ${EPHEMERIS_YEARS.last}, so a ${days}-day period can start no later than ${startWords(isoOf(last))}: ${moved(last)}.` };
  }
  if (wanted < FIRST_START_MS) return { startUtc: FIRST_START, note: `The Sun and Earth table allows no landing before ${startWords(FIRST_START)}: ${moved(FIRST_START_MS)}.` };
  return { startUtc: isoOf(wanted), note: null };
}
