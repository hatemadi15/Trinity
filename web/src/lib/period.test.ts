import { describe, expect, it } from 'vitest';
import { indexForEt, type EphemerisHeader } from './engine/ephemeris';
import { readJson } from './engine/__tests__/helpers';
import { utcToEt } from './engine/time';
import { DAYS_RANGE } from './planner-ranges';
import {
  FIRST_START,
  lastStart,
  periodDays,
  periodProblem,
  periodWords,
  shiftPeriod,
  shiftWords,
  snapToHour,
  startWords,
  TABLE_END_MS,
  withClock,
  withDate,
} from './period';

const header = readJson<EphemerisHeader & { t0_utc: string }>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');

describe('the length of a period', () => {
  it('is a whole number of days from 2 to 90, and the bounds are the ones the planner ranges state', () => {
    expect(DAYS_RANGE).toEqual({ min: 2, max: 90, step: 1 });
    for (const ok of [2, 7, 14, 30, 45, 90]) expect(periodDays(ok), String(ok)).toBe(ok);
    // A link and the assistant send text: a whole number written as text counts as that number.
    expect(periodDays('7')).toBe(7);
    expect(periodDays(' 30 ')).toBe(30);
    for (const bad of [1, 0, -7, 91, 120, 7.5, Number.NaN, Number.POSITIVE_INFINITY, '', 'seven', '7 days', null, undefined, {}]) expect(periodDays(bad), String(bad)).toBeNull();
  });
});

describe('the landing hour', () => {
  it('is read at the nearest whole hour, half an hour and more rounding up, as the engine reads its hourly table', () => {
    expect(snapToHour('2027-01-20T17:00:00')).toBe('2027-01-20T17:00:00');
    expect(snapToHour('2027-01-20T17:29:59')).toBe('2027-01-20T17:00:00');
    expect(snapToHour('2027-01-20T17:30:00')).toBe('2027-01-20T18:00:00');
    expect(snapToHour('2027-01-20T23:40:00')).toBe('2027-01-21T00:00:00');
    // The engine takes the row nearest the start (indexForEt rounds): the snapped hour is that row's hour.
    const eph = { t0Et: header.t0_et, stepS: header.step_s, n: header.n, data: new Float32Array(0) };
    for (const raw of ['2027-01-20T17:20:00', '2027-01-20T17:30:00', '2027-01-20T17:45:00', '2030-06-30T23:31:00']) {
      expect(indexForEt(eph, utcToEt(snapToHour(raw))), raw).toBe(indexForEt(eph, utcToEt(raw)));
      expect(utcToEt(snapToHour(raw)) - header.t0_et, raw).toBeCloseTo(indexForEt(eph, utcToEt(raw)) * 3600, 3);
    }
  });

  it('changes with the date box and the time box: a new date keeps the hour, a new hour keeps the date', () => {
    expect(withDate('2027-01-20T17:00:00', '2027-03-05')).toBe('2027-03-05T17:00:00');
    expect(withClock('2027-01-20T10:00:00', '17:00')).toEqual({ startUtc: '2027-01-20T17:00:00', rounded: false });
    expect(withClock('2027-01-20T10:00:00', '17:00:00')).toEqual({ startUtc: '2027-01-20T17:00:00', rounded: false });
    // Minutes round to the nearest hour, as the engine does, and say so; 23:30 and later is the next day's 00:00.
    expect(withClock('2027-01-20T10:00:00', '17:40')).toEqual({ startUtc: '2027-01-20T18:00:00', rounded: true });
    expect(withClock('2027-01-20T10:00:00', '23:45')).toEqual({ startUtc: '2027-01-21T00:00:00', rounded: true });
  });

  it('ignores a cleared time box and a time no clock shows', () => {
    for (const bad of ['', '24:00', '25:00', '17:60', '7', '17', 'noon', '-1:00']) expect(withClock('2027-01-20T10:00:00', bad), bad).toBeNull();
    for (const bad of ['', '2027-02-30', '20270-01-15', '2027-1-5']) expect(withDate('2027-01-20T17:00:00', bad), bad).toBeNull();
    // A year on its way to being typed is a real date, but no period from it fits the table.
    expect(periodProblem(withDate('2027-01-20T17:00:00', '0202-01-15')!, 7)).toMatch(/^A 7-day period from 15 January 0202, 17:00 UTC starts before/);
  });
});

describe('where a period fits', () => {
  it('ends by the hour after the table’s last row, worked out from the table’s header', () => {
    expect(TABLE_END_MS).toBe(Date.parse(`${header.t0_utc}Z`) + header.n * header.step_s * 1000);
    expect(lastStart(90)).toBe('2036-10-03T00:00:00');
    expect(lastStart(7)).toBe('2036-12-25T00:00:00');
    expect(FIRST_START).toBe('2024-01-02T00:00:00');
  });

  it('says in plain words why a period does not fit, and nothing when it does', () => {
    expect(periodProblem('2027-01-20T17:00:00', 7)).toBeNull();
    expect(periodProblem('2036-12-25T00:00:00', 7)).toBeNull();
    expect(periodProblem('2024-01-02T00:00:00', 90)).toBeNull();
    expect(periodProblem('2027-01-20T17:00:00', 1)).toBe('A period is 2 to 90 whole days.');
    expect(periodProblem('2027-01-20T17:00:00', 7.5)).toBe('A period is 2 to 90 whole days.');
    expect(periodProblem('2036-12-25T01:00:00', 7)).toBe(
      'A 7-day period from 25 December 2036, 01:00 UTC runs past 31 December 2036, where the Sun and Earth table ends. The latest landing for 7 days is 25 December 2036, 00:00 UTC.',
    );
    expect(periodProblem('2024-01-01T12:00:00', 7)).toBe('A 7-day period from 1 January 2024, 12:00 UTC starts before 2 January 2024, 00:00 UTC, the first landing the Sun and Earth table allows.');
  });
});

describe('shifting the landing', () => {
  it('moves the landing by any number of hours and keeps the length', () => {
    expect(shiftPeriod('2027-01-20T17:00:00', 7, 5 * 24)).toEqual({ startUtc: '2027-01-25T17:00:00', note: null });
    expect(shiftPeriod('2027-01-20T17:00:00', 7, -24)).toEqual({ startUtc: '2027-01-19T17:00:00', note: null });
    // An hour across midnight changes the date as well.
    expect(shiftPeriod('2027-01-20T23:00:00', 7, 1)).toEqual({ startUtc: '2027-01-21T00:00:00', note: null });
    expect(shiftPeriod('2027-01-21T00:00:00', 7, -1)).toEqual({ startUtc: '2027-01-20T23:00:00', note: null });
    // A part of an hour rounds as the engine does.
    expect(shiftPeriod('2027-01-20T17:00:00', 7, 6.6).startUtc).toBe('2027-01-21T00:00:00');
  });

  it('stops at the ends of the table and says so in plain words', () => {
    expect(shiftPeriod('2036-12-20T00:00:00', 7, 10 * 24)).toEqual({
      startUtc: '2036-12-25T00:00:00',
      note: 'The Sun and Earth table ends on 31 December 2036, so a 7-day period can start no later than 25 December 2036, 00:00 UTC: the landing moved there.',
    });
    expect(shiftPeriod('2024-01-05T06:00:00', 30, -7 * 24)).toEqual({
      startUtc: '2024-01-02T00:00:00',
      note: 'The Sun and Earth table allows no landing before 2 January 2024, 00:00 UTC: the landing moved there.',
    });
    // At the end already, a later landing stays where it is, and says so.
    expect(shiftPeriod('2036-12-25T00:00:00', 7, 1)).toEqual({
      startUtc: '2036-12-25T00:00:00',
      note: 'The Sun and Earth table ends on 31 December 2036, so a 7-day period can start no later than 25 December 2036, 00:00 UTC: the landing stays there.',
    });
  });

  it('words a shift in days and hours', () => {
    expect(shiftWords(120)).toBe('5 days');
    expect(shiftWords(6)).toBe('6 hours');
    expect(shiftWords(-30)).toBe('1 day 6 hours');
    expect(shiftWords(1)).toBe('1 hour');
  });
});

describe('the period in words', () => {
  it('writes the landing with its hour in UTC, and the period as the brief prints it', () => {
    expect(startWords('2027-01-20T17:00:00')).toBe('20 January 2027, 17:00 UTC');
    expect(startWords('2027-01-01T00:00:00')).toBe('1 January 2027, 00:00 UTC');
    expect(periodWords('2027-01-20T17:00:00', 7)).toBe('20 Jan 2027, 17:00 UTC, 7 days');
    expect(periodWords('2027-01-01T00:00:00', 30)).toBe('1 Jan 2027, 00:00 UTC, 30 days');
  });
});
