import { dateLong } from '../viz/format';

/**
 * The few period rules a scenario needs: a landing on a whole UTC hour, a length of 2 to 90 whole days, a shift that
 * keeps the length and stops at the ends of the Sun and Earth table. The time part of the app owns these rules; this
 * small adapter names its functions as that part does, so its own module can take this one's place in one line.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** The years of the hourly Sun and Earth table; a period outside them cannot be worked out. */
export const TABLE_YEARS = { first: 2024, last: 2036 };
/** A period must end by the hour after the table's last row. */
const TABLE_END_MS = Date.UTC(TABLE_YEARS.last + 1, 0, 1);
/** The first landing the app offers: a day into the table. */
export const FIRST_START = '2024-01-02T00:00:00';
const FIRST_START_MS = Date.parse(`${FIRST_START}Z`);
/** A period's length in whole days. */
export const DAYS = { min: 2, max: 90 };

const msOf = (iso: string) => Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** The length as whole days within the bounds; null for anything else. */
export function periodDays(x: unknown): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : Number.NaN;
  return Number.isInteger(n) && n >= DAYS.min && n <= DAYS.max ? n : null;
}

/** The landing at the nearest whole hour: the engine reads its hourly table at the row nearest the start. */
export function snapToHour(iso: string): string {
  return isoOf(Math.round(msOf(iso) / HOUR_MS) * HOUR_MS);
}

/** The latest landing from which a period of `days` still ends inside the table. */
export function lastStart(days: number): string {
  return isoOf(TABLE_END_MS - days * DAY_MS);
}

/** A landing for sentences, always with its hour: "20 January 2027, 17:00 UTC". */
export function startWords(startUtc: string): string {
  return `${dateLong(startUtc, 0)} ${startUtc.slice(0, 4)}, ${startUtc.slice(11, 16)} UTC`;
}

/** Why a period cannot be worked out, in plain words with the exact limit; null when it can. */
export function periodProblem(startUtc: string, days: number): string | null {
  if (periodDays(days) === null) return `A period is ${DAYS.min} to ${DAYS.max} whole days.`;
  const start = msOf(startUtc);
  const period = `A ${days}-day period from ${startWords(startUtc)}`;
  if (start + days * DAY_MS > TABLE_END_MS) {
    return `${period} runs past 31 December ${TABLE_YEARS.last}, where the Sun and Earth table ends. The latest landing for ${days} days is ${startWords(lastStart(days))}.`;
  }
  if (start < FIRST_START_MS) return `${period} starts before ${startWords(FIRST_START)}, the first landing the Sun and Earth table allows.`;
  return null;
}

/** The landing moved by `byHours` (later when positive), keeping the length; a move past either end of the table stops there, and `note` says so. */
export function shiftPeriod(startUtc: string, days: number, byHours: number): { startUtc: string; note: string | null } {
  const wanted = Math.round((msOf(startUtc) + byHours * HOUR_MS) / HOUR_MS) * HOUR_MS;
  const last = TABLE_END_MS - days * DAY_MS;
  if (wanted > last) return { startUtc: isoOf(last), note: `The Sun and Earth table ends on 31 December ${TABLE_YEARS.last}, so a ${days}-day period can start no later than ${startWords(isoOf(last))}.` };
  if (wanted < FIRST_START_MS) return { startUtc: FIRST_START, note: `The Sun and Earth table allows no landing before ${startWords(FIRST_START)}.` };
  return { startUtc: isoOf(wanted), note: null };
}
