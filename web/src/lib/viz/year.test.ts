import { describe, expect, it } from 'vitest';
import type { YearOfLandings } from '../engine/year';
import {
  bestDay,
  dayFigures,
  dayLabel,
  dayWords,
  GRADES,
  gradeOf,
  headline,
  legendWords,
  moveDay,
  POWER_THEN_RADIO,
  tableEndNote,
  yearMonths,
} from './year';

/** A year of `count` days from `startUtc` for a period of `days`, every day with the figures given, else none. */
function year(startUtc: string, days: number, count: number, set: Record<number, [powered: number, contact: number, sunlit?: number]> = {}, lit = 1): YearOfLandings {
  const powered = new Int32Array(count), contact = new Int32Array(count), sunlit = new Uint8Array(count).fill(lit);
  for (const [k, [p, c, s]] of Object.entries(set)) {
    powered[Number(k)] = p;
    contact[Number(k)] = c;
    sunlit[Number(k)] = s ?? lit;
  }
  return { startUtc, days, count, powered, contact, sunlit };
}
/** The words as written in a test, with the no-break space the page keeps between a number and its "%". */
const nb = (s: string) => s.replace(/ %/g, '\u00a0%');

describe('how a landing day is graded', () => {
  const H = 30 * 24;
  const grade = (poweredHours: number, contactHours: number) => POWER_THEN_RADIO.grade({ poweredHours, contactHours, sunlit: true }, H);

  it('puts power first, as the verdict and the best-date search do: all the period is good, and with radio half of it, best', () => {
    expect(grade(H, H)).toBe('best');
    expect(grade(H, H / 2)).toBe('best');
    expect(grade(H, H / 2 - 1)).toBe('good');
    expect(grade(H, 0)).toBe('good');
  });

  it('calls a quarter of the period with power or more mixed, and less poor, whatever the radio', () => {
    expect(grade(H - 1, H - 1)).toBe('mixed');
    expect(grade(H / 4, 0)).toBe('mixed');
    expect(grade(H / 4 - 1, H / 4 - 1)).toBe('poor');
    expect(grade(0, 0)).toBe('poor');
    expect(GRADES).toEqual(['best', 'good', 'mixed', 'poor']);
  });

  it('ranks days as the best-date search does: longer power, then more radio contact, then the earlier day, landing in sunlight only', () => {
    const y = year('2027-01-01T00:00:00', 30, 10, { 2: [300, 10], 4: [500, 0, 0], 5: [300, 40], 7: [300, 40], 8: [200, 200] });
    expect(bestDay(y, POWER_THEN_RADIO)).toBe(5);
    expect(bestDay(year('2027-01-01T00:00:00', 30, 3, { 0: [10, 0], 1: [20, 0] }, 0), POWER_THEN_RADIO)).toBeNull();
  });

  it('reads the figures of a day from the year, and grades it through the one scoring it is given', () => {
    const y = year('2027-01-01T00:00:00', 30, 3, { 1: [720, 400] });
    expect(dayFigures(y, 1)).toEqual({ poweredHours: 720, contactHours: 400, sunlit: true });
    expect(gradeOf(y, 1, POWER_THEN_RADIO)).toBe('best');
    const strict = { ...POWER_THEN_RADIO, grade: () => 'poor' as const };
    expect(gradeOf(y, 1, strict)).toBe('poor');
  });
});

describe('the words of the year', () => {
  it('names each day by its date, its hour in UTC and both figures, as a share of the period, with its grade', () => {
    const y = year('2027-03-14T00:00:00', 30, 40, { 0: [691, 504], 1: [720, 504], 2: [36, 0, 0], 3: [0, 0, 0], 4: [719, 3] });
    expect(dayLabel(y, 0, POWER_THEN_RADIO)).toBe(nb('Land 14 March 2027, 00:00 UTC: power 96 % of the 30 days, radio contact 70 %. Mixed.'));
    expect(dayLabel(y, 1, POWER_THEN_RADIO)).toBe(nb('Land 15 March 2027, 00:00 UTC: power all 30 days, radio contact 70 %. Best.'));
    expect(dayLabel(y, 2, POWER_THEN_RADIO)).toBe(nb('Land 16 March 2027, 00:00 UTC, at night: power 5 % of the 30 days, no radio contact. Poor.'));
    expect(dayLabel(y, 3, POWER_THEN_RADIO)).toBe('Land 17 March 2027, 00:00 UTC, at night: no power, no radio contact. Poor.');
    // A share is never rounded up to the whole period, or down to nothing.
    expect(dayLabel(y, 4, POWER_THEN_RADIO)).toBe(nb('Land 18 March 2027, 00:00 UTC: power 99 % of the 30 days, radio contact 1 %. Mixed.'));
  });

  it('keeps the landing hour of the start and writes the year with every date', () => {
    expect(dayWords('2027-12-30T10:00:00', 3)).toBe('2 January 2028, 10:00 UTC');
    expect(dayLabel(year('2027-12-30T10:00:00', 14, 5), 3, POWER_THEN_RADIO)).toBe('Land 2 January 2028, 10:00 UTC: no power, no radio contact. Poor.');
  });

  it('says in plain words what each colour means, with the period in it', () => {
    expect(legendWords(30)).toEqual({
      best: 'Best: power all 30 days, radio contact half the time or more',
      good: 'Good: power all 30 days',
      mixed: 'Mixed: power a quarter of the time or more',
      poor: 'Poor: less than a quarter',
    });
  });

  it('names the best day of the year, and says so when no day keeps power for the whole period', () => {
    const full = year('2027-01-01T00:00:00', 14, 365, { 40: [336, 200], 41: [336, 100] });
    expect(headline(full, POWER_THEN_RADIO)).toBe(nb('The best landing day: 10 February 2027, power all 14 days, radio contact 60 %.'));
    const short = year('2027-01-01T00:00:00', 30, 365, { 19: [302, 72] });
    expect(headline(short, POWER_THEN_RADIO)).toBe(nb('No landing day keeps power all 30 days. The best: 20 January 2027, power 42 % of the time, radio contact 10 %.'));
    const dark = year('2027-01-01T00:00:00', 30, 365, { 3: [10, 0] }, 0);
    expect(headline(dark, POWER_THEN_RADIO)).toBe('No landing at 00:00 UTC in these 12 months has sunlight here.');
    expect(headline(year('2036-12-01T00:00:00', 90, 0), POWER_THEN_RADIO)).toBe('A 90-day period from 1 December 2036 runs past 31 December 2036, where the Sun and Earth table ends.');
  });

  it('says where the year stops when the Sun and Earth table ends before twelve months are out', () => {
    expect(tableEndNote(year('2027-01-01T00:00:00', 30, 365))).toBeNull();
    expect(tableEndNote(year('2036-06-01T00:00:00', 90, 125))).toBe('The Sun and Earth table ends on 31 December 2036, so the year stops at 3 October 2036, the last landing whose 90 days fit.');
  });
});

describe('the year laid out by month', () => {
  it('gives each month its days in rows of seven, the days outside the year left empty', () => {
    const months = yearMonths('2027-01-20T10:00:00', 365);
    expect(months).toHaveLength(13);
    expect(months.map((m) => m.label)).toEqual(['Jan 2027', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan 2028']);
    expect(months[0].name).toBe('January 2027');
    const jan = months[0].rows;
    expect(jan).toHaveLength(5);
    expect(jan.every((r) => r.length === 7)).toBe(true);
    // 20 January is day 0 of the year; the 19 days before it are not in the year.
    expect(jan[2]).toEqual([null, null, null, null, null, 0, 1]);
    expect(jan[4]).toEqual([9, 10, 11, null, null, null, null]);
    expect(months[1].rows[0][0]).toBe(12);
    // The last month ends with the 365th day, 19 January 2028.
    expect(months[12].rows[2]).toEqual([360, 361, 362, 363, 364, null, null]);
  });

  it('gives February its 28 or 29 days, and a year cut short by the table its last month', () => {
    const leap = yearMonths('2028-02-01T00:00:00', 365);
    expect(leap[0].rows.flat().filter((k) => k !== null)).toHaveLength(29);
    const cut = yearMonths('2036-06-01T00:00:00', 125);
    expect(cut.map((m) => m.label)).toEqual(['Jun 2036', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(cut[4].rows[0]).toEqual([122, 123, 124, null, null, null, null]);
  });

  it('moves day by day and week by week from the keyboard, month by month with Page keys, and stops at the ends', () => {
    const start = '2027-01-20T10:00:00';
    expect(moveDay(5, 'ArrowRight', start, 365)).toBe(6);
    expect(moveDay(5, 'ArrowLeft', start, 365)).toBe(4);
    expect(moveDay(5, 'ArrowDown', start, 365)).toBe(12);
    expect(moveDay(5, 'ArrowUp', start, 365)).toBe(0);
    expect(moveDay(0, 'ArrowLeft', start, 365)).toBe(0);
    expect(moveDay(362, 'ArrowDown', start, 365)).toBe(364);
    // 31 January is day 11; a month on is 28 February (day 39), as there is no 31 February.
    expect(moveDay(11, 'PageDown', start, 365)).toBe(39);
    expect(moveDay(39, 'PageUp', start, 365)).toBe(8);
    expect(moveDay(100, 'Home', start, 365)).toBe(0);
    expect(moveDay(100, 'End', start, 365)).toBe(364);
    expect(moveDay(100, 'Enter', start, 365)).toBeNull();
  });
});
