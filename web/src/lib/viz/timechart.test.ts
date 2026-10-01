import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER, simulateBattery } from '../engine/power';
import { batteryWords, chargeArea, hillsToward, hourAt, litRuns, offRuns, runsWhere } from './timechart';

describe('hillsToward', () => {
  it('reads the height of the hills in the direction of the body, hour by hour', () => {
    const mask = Float64Array.from({ length: 720 }, (_, k) => (k === 180 ? 6 : 0)); // one hill due east
    const out = hillsToward(mask, [90, 0, 90.25, 270]);
    expect(out[0]).toBeCloseTo(6, 9);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(3, 9); // half a step past the hill
    expect(out[3]).toBe(0);
  });
});

describe('runs', () => {
  it('finds maximal runs as half-open hour ranges', () => {
    expect(runsWhere(6, (h) => h === 1 || h === 2 || h === 5)).toEqual([
      { from: 1, to: 3 },
      { from: 5, to: 6 },
    ]);
    expect(runsWhere(0, () => true)).toEqual([]);
  });

  it('lists the stretches with any sunlight and the stretches without power', () => {
    expect(litRuns([1, 0.2, 0, 0, 1, 1, 0, 0.5])).toEqual([
      { from: 0, to: 2 },
      { from: 4, to: 6 },
      { from: 7, to: 8 },
    ]);
    expect(litRuns([0, 0])).toEqual([]);
    expect(offRuns([1, 1, 0, 0, 1, 0])).toEqual([
      { from: 2, to: 4 },
      { from: 5, to: 6 },
    ]);
  });
});

describe('chargeArea', () => {
  it('draws the charge as a closed shape, full at the top and empty at the bottom', () => {
    const d = chargeArea([1000, 500, 0, 0], 1000, 400, 20);
    expect(d).toBe('M0 20L0 0L100 0L100 10L200 10L200 20L300 20L300 20L400 20L400 20Z');
  });

  it('is empty for a lander without a battery', () => {
    expect(chargeArea([0, 0], 0, 400, 20)).toBe('');
  });
});

describe('hourAt', () => {
  it('maps a pointer position to an hour and clamps at both ends', () => {
    expect(hourAt(0, 720, 720)).toBe(0);
    expect(hourAt(360.4, 720, 720)).toBe(360);
    expect(hourAt(719.9, 720, 720)).toBe(719);
    expect(hourAt(900, 720, 720)).toBe(719);
    expect(hourAt(-5, 720, 720)).toBe(0);
    expect(hourAt(10, 0, 720)).toBe(0);
  });
});

describe('batteryWords', () => {
  const cfg = { ...DEFAULT_POWER, loadW: 100, batteryWh: 1000 };

  it('says when the battery first runs out and for how long the lander is off', () => {
    const p = Float64Array.from({ length: 96 }, (_, h) => (h < 30 || h >= 70 ? 500 : 0));
    expect(batteryWords(simulateBattery(p, cfg), '2027-01-01T00:00:00', 4)).toBe('The battery first runs out on 2 January and the lander is off for 1 day 6 hours of these 4 days.');
  });

  it('says so when it never runs out', () => {
    expect(batteryWords(simulateBattery(new Float64Array(96).fill(500), cfg), '2027-01-01T00:00:00', 4)).toBe('The battery never runs out in these 4 days.');
  });
});
