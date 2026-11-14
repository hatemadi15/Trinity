import type { YearOfLandings } from '../engine/year';
import { clockUtc, dateLong, isoAt } from './format';

/** The four grades of a landing day, best first: one scale, one colour each. */
export type Grade = 'best' | 'good' | 'mixed' | 'poor';
export const GRADES: Grade[] = ['best', 'good', 'mixed', 'poor'];

/** What a landing on one day gives over the period: the hours with power, of those the hours with Earth in view, and the Sun at landing. */
export interface DayFigures {
  poweredHours: number;
  contactHours: number;
  sunlit: boolean;
}

/**
 * How the year scores a landing day: a grade for its colour, and an order for the best day. The year asks nothing
 * else of a scoring, so another model (stated requirements and an objective) can take this one's place in one line.
 */
export interface DayScoring {
  grade: (day: DayFigures, periodHours: number) => Grade;
  /** Below zero when `a` is the better landing. */
  compare: (a: DayFigures, b: DayFigures) => number;
}

/** Radio contact for at least this share of the period makes a day with power all through it the best. */
const BEST_RADIO = 1 / 2;
/** Power for at least this share of the period makes a day mixed rather than poor. */
const MIXED_POWER = 1 / 4;

/**
 * Power first, then radio contact: the verdict's good answer is power for the whole period, and the best-date search
 * ranks landings by the time with power, then by the share of it with Earth in view. Best: power all the period and
 * radio contact for half of it or more. Good: power all the period. Mixed: power for a quarter of it or more. Poor: less.
 */
export const POWER_THEN_RADIO: DayScoring = {
  grade({ poweredHours, contactHours }, periodHours) {
    if (poweredHours >= periodHours) return contactHours >= BEST_RADIO * periodHours ? 'best' : 'good';
    return poweredHours >= MIXED_POWER * periodHours ? 'mixed' : 'poor';
  },
  compare(a, b) {
    return b.poweredHours - a.poweredHours || b.contactHours - a.contactHours;
  },
};

/** The scoring the year is coloured and ranked by: the one line to change for another model. */
export const YEAR_SCORING: DayScoring = POWER_THEN_RADIO;

export function dayFigures(year: YearOfLandings, k: number): DayFigures {
  return { poweredHours: year.powered[k], contactHours: year.contact[k], sunlit: year.sunlit[k] === 1 };
}

export function gradeOf(year: YearOfLandings, k: number, scoring: DayScoring): Grade {
  return scoring.grade(dayFigures(year, k), year.days * 24);
}

/** The best day of the year, as the best-date search picks a landing: in sunlight, ranked by the scoring, the earlier on a tie; null when no landing hour is sunlit. */
export function bestDay(year: YearOfLandings, scoring: DayScoring): number | null {
  let best: number | null = null;
  for (let k = 0; k < year.count; k++) {
    if (year.sunlit[k] !== 1) continue;
    if (best === null || scoring.compare(dayFigures(year, k), dayFigures(year, best)) < 0) best = k;
  }
  return best;
}

/** The date a landing lands on, with its year: "14 March 2027". */
function dateOf(startUtc: string, k: number): string {
  const iso = isoAt(startUtc, k * 24);
  return `${dateLong(iso, 0)} ${iso.slice(0, 4)}`;
}

/** The landing of day `k` in words, always with its year and its hour in UTC: "2 January 2028, 10:00 UTC". */
export function dayWords(startUtc: string, k: number): string {
  return `${dateOf(startUtc, k)}, ${clockUtc(startUtc, k * 24)} UTC`;
}

/** A share as a whole percentage that never rounds a part up to the whole, or a little down to nothing: "96 %". */
function share(x: number): string {
  const n = x <= 0 ? 0 : x >= 1 ? 100 : Math.min(99, Math.max(1, Math.round(x * 100)));
  return `${n}\u00a0%`;
}

function powerWords(poweredHours: number, days: number): string {
  if (poweredHours <= 0) return 'no power';
  return poweredHours >= days * 24 ? `power all ${days} days` : `power ${share(poweredHours / (days * 24))} of the ${days} days`;
}

function radioWords(contactHours: number, days: number): string {
  return contactHours <= 0 ? 'no radio contact' : `radio contact ${share(contactHours / (days * 24))}`;
}

const GRADE_WORD: Record<Grade, string> = { best: 'Best', good: 'Good', mixed: 'Mixed', poor: 'Poor' };

/**
 * A day's figures in words: when the lander lands, whether it is night then, the share of the period with power and
 * with radio contact while it has power, and the day's grade. "14 March 2027, 00:00 UTC: power 96 % of the 30 days,
 * radio contact 70 %. Mixed."
 */
export function dayFiguresWords(year: YearOfLandings, k: number, scoring: DayScoring): string {
  const d = dayFigures(year, k);
  return `${dayWords(year.startUtc, k)}${d.sunlit ? '' : ', at night'}: ${powerWords(d.poweredHours, year.days)}, ${radioWords(d.contactHours, year.days)}. ${GRADE_WORD[gradeOf(year, k, scoring)]}.`;
}

/** The name of a day's control: what pressing it does and what that landing gives. */
export function dayLabel(year: YearOfLandings, k: number, scoring: DayScoring): string {
  return `Land ${dayFiguresWords(year, k, scoring)}`;
}

/** What each colour means, in plain words, for a period of `days`. */
export function legendWords(days: number): Record<Grade, string> {
  return {
    best: `Best: power all ${days} days, radio contact half the time or more`,
    good: `Good: power all ${days} days`,
    mixed: 'Mixed: power a quarter of the time or more',
    poor: 'Poor: less than a quarter',
  };
}

/** The last hour of the Sun and Earth table, for sentences. */
const TABLE_END = '31 December 2036';

/** The year's answer in one sentence: its best landing day, or why there is none. */
export function headline(year: YearOfLandings, scoring: DayScoring): string {
  const { startUtc, days } = year;
  if (year.count === 0) return `A ${days}-day period from ${dateOf(startUtc, 0)} runs past ${TABLE_END}, where the Sun and Earth table ends.`;
  const k = bestDay(year, scoring);
  if (k === null) return `No landing at ${clockUtc(startUtc, 0)} UTC in these 12 months has sunlight here.`;
  const d = dayFigures(year, k);
  const figures = `${dateOf(startUtc, k)}, ${powerWords(d.poweredHours, days).replace(` of the ${days} days`, ' of the time')}, ${radioWords(d.contactHours, days)}.`;
  return d.poweredHours >= days * 24 ? `The best landing day: ${figures}` : `No landing day keeps power all ${days} days. The best: ${figures}`;
}

/** Where the year stops when the table ends before its twelve months do; null when they fit. */
export function tableEndNote(year: YearOfLandings): string | null {
  if (year.count === 0 || year.count >= 365) return null;
  return `The Sun and Earth table ends on ${TABLE_END}, so the year stops at ${dateOf(year.startUtc, year.count - 1)}, the last landing whose ${year.days} days fit.`;
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** One month of the year: its label ("Jan 2027" for the first and each January, else "Feb"), its name, and its days in rows of seven (day 1 to 7, 8 to 14, …), each a day of the year or null outside it. */
export interface YearMonth {
  key: string;
  label: string;
  name: string;
  rows: (number | null)[][];
}

const utcMs = (iso: string) => Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);

/** The months the `count` landing days from `startUtc` fall in, in order. */
export function yearMonths(startUtc: string, count: number): YearMonth[] {
  const start = new Date(utcMs(startUtc));
  const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const months: YearMonth[] = [];
  if (count <= 0) return months;
  const last = new Date(first + (count - 1) * DAY_MS);
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth()); m === 11 ? (y++, (m = 0)) : m++) {
    const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const rows: (number | null)[][] = [];
    for (let row = 0; row * 7 < length; row++) {
      const cells: (number | null)[] = [];
      for (let col = 0; col < 7; col++) {
        const date = row * 7 + col + 1;
        const k = Math.round((Date.UTC(y, m, date) - first) / DAY_MS);
        cells.push(date <= length && k >= 0 && k < count ? k : null);
      }
      rows.push(cells);
    }
    months.push({ key: `${y}-${m + 1}`, label: months.length === 0 || m === 0 ? `${MONTHS_SHORT[m]} ${y}` : MONTHS_SHORT[m], name: `${MONTHS_LONG[m]} ${y}`, rows });
  }
  return months;
}

/**
 * Where a key takes the focus from day `k`: a day with the arrows left and right, a week up and down, a month with
 * Page Up and Page Down (the same date, or the month's last), the first or last day with Home and End; null for any
 * other key. It stops at either end of the year.
 */
export function moveDay(k: number, key: string, startUtc: string, count: number): number | null {
  const clamp = (x: number) => Math.max(0, Math.min(count - 1, x));
  switch (key) {
    case 'ArrowRight':
      return clamp(k + 1);
    case 'ArrowLeft':
      return clamp(k - 1);
    case 'ArrowDown':
      return clamp(k + 7);
    case 'ArrowUp':
      return clamp(k - 7);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageDown':
    case 'PageUp': {
      const start = new Date(utcMs(startUtc));
      const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const d = new Date(first + k * DAY_MS);
      const m = d.getUTCMonth() + (key === 'PageDown' ? 1 : -1);
      const length = new Date(Date.UTC(d.getUTCFullYear(), m + 1, 0)).getUTCDate();
      const target = Date.UTC(d.getUTCFullYear(), m, Math.min(d.getUTCDate(), length));
      return clamp(Math.round((target - first) / DAY_MS));
    }
    default:
      return null;
  }
}
