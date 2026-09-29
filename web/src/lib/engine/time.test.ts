import { describe, expect, it } from 'vitest';
import { etToIso, etToUtcDate, utcToEt } from './time';
import { readJson } from './__tests__/helpers';

interface TimeFixture { tdb_minus_utc_s: number; pairs: { utc: string; et: number }[] }

describe('utcToEt', () => {
  it('matches SPICE str2et to 10 ms for every golden pair', () => {
    const fx = readJson<TimeFixture>('data', 'fixtures', 'time', 'utc_et.json');
    expect(fx.pairs.length).toBeGreaterThanOrEqual(50);
    for (const p of fx.pairs) expect(Math.abs(utcToEt(p.utc) - p.et)).toBeLessThan(0.01);
  });
  it('parses naive ISO strings as UTC', () => {
    expect(utcToEt('2025-03-02T08:34:00')).toBe(utcToEt('2025-03-02T08:34:00Z'));
    expect(utcToEt(new Date('2025-03-02T08:34:00Z'))).toBe(utcToEt('2025-03-02T08:34:00'));
  });
  it('rejects garbage', () => {
    expect(() => utcToEt('not a date')).toThrow(/invalid UTC/);
  });
  it('round-trips through etToUtcDate and etToIso', () => {
    const et = utcToEt('2031-07-04T12:34:56');
    expect(etToUtcDate(et).toISOString()).toBe('2031-07-04T12:34:56.000Z');
    expect(etToIso(et)).toBe('2031-07-04T12:34:56');
  });
});
