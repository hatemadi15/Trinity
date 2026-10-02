import { describe, expect, it } from 'vitest';
import { clockUtc, dateLong, dateTimeUtc, dayMonth, isoAt, pct0, spanShort, spanWords } from './format';

describe('durations', () => {
  it('writes days and hours in words for sentences', () => {
    expect(spanWords(399)).toBe('16 days 15 hours');
    expect(spanWords(25)).toBe('1 day 1 hour');
    expect(spanWords(7)).toBe('7 hours');
    expect(spanWords(48)).toBe('2 days');
    expect(spanWords(0)).toBe('0 hours');
  });

  it('writes the short form for cards', () => {
    expect(spanShort(399)).toBe('16 d 15 h');
    expect(spanShort(7)).toBe('7 h');
    expect(spanShort(48)).toBe('2 d');
  });

  it('writes a short UTC date', () => {
    expect(dayMonth('2027-01-01T00:00:00', 67)).toBe('3 Jan');
    expect(dayMonth('2027-01-01T00:00:00', 466)).toBe('20 Jan');
    expect(dayMonth('2025-03-06T00:00:00', 0)).toBe('6 Mar');
  });
});

describe('dates for sentences and buttons', () => {
  it('writes the day and the full month, with the year only when it is not the start year', () => {
    expect(dateLong('2027-01-01T00:00:00', 466)).toBe('20 January');
    expect(dateLong('2027-12-20T00:00:00', 24 * 20)).toBe('9 January 2028');
  });

  it('writes the UTC hour and the ISO time of an hour of the period', () => {
    expect(clockUtc('2027-01-01T00:00:00', 466)).toBe('10:00');
    expect(isoAt('2027-01-01T00:00:00', 466)).toBe('2027-01-20T10:00:00');
    expect(isoAt('2027-01-01T06:00:00Z', 0)).toBe('2027-01-01T06:00:00');
  });

  it('writes a share as a whole percentage', () => {
    expect(pct0(0.446)).toBe('45 %');
    expect(pct0(1)).toBe('100 %');
  });
});

describe('the time bar label', () => {
  it('writes the date, the year and the UTC hour', () => {
    expect(dateTimeUtc('2027-01-01T00:00:00', 30)).toBe('2 Jan 2027, 06:00 UTC');
    expect(dateTimeUtc('2027-12-31T20:00:00', 6)).toBe('1 Jan 2028, 02:00 UTC');
  });
});
