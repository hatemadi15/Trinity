import { describe, expect, it } from 'vitest';
import { dayMonth, spanShort, spanWords } from './format';

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
