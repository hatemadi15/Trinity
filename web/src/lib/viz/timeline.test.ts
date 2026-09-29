import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { binSeries, dayTicks, hourAtX, xAtHour } from './timeline';

function series(hours: number): Series {
  const sunFraction = new Float64Array(hours);
  const earthVisible = new Uint8Array(hours);
  for (let h = 0; h < hours; h++) {
    sunFraction[h] = h % 48 < 24 ? 1 : 0;
    earthVisible[h] = h % 96 < 48 ? 1 : 0;
  }
  return {
    i0: 0,
    hours,
    sunAz: new Float64Array(hours),
    sunEl: new Float64Array(hours),
    earthAz: new Float64Array(hours),
    earthEl: new Float64Array(hours),
    sunFraction,
    earthVisible,
  };
}

describe('timeline helpers', () => {
  it('bins hours into max / mean / fraction', () => {
    const b = binSeries(series(96), 4);
    expect(b.hoursPerBin).toBe(24);
    expect(Array.from(b.sunMax)).toEqual([1, 0, 1, 0]);
    expect(Array.from(b.sunMean)).toEqual([1, 0, 1, 0]);
    expect(Array.from(b.earthFrac)).toEqual([1, 1, 0, 0]);
  });
  it('maps x to hours and back', () => {
    expect(hourAtX(0, 720, 720)).toBe(0);
    expect(hourAtX(719.9, 720, 720)).toBe(719);
    expect(hourAtX(-5, 720, 720)).toBe(0);
    expect(xAtHour(360, 720, 720)).toBeCloseTo(360.5, 9);
  });
  it('labels days without crowding', () => {
    const ticks = dayTicks('2027-01-01T00:00:00', 14 * 24, 700, 56);
    expect(ticks[0]).toEqual({ x: 0, label: 'Jan 1' });
    expect(ticks.length).toBeLessThanOrEqual(13);
    expect(ticks.every((t, i) => i === 0 || t.x - ticks[i - 1].x >= 56)).toBe(true);
  });
});
