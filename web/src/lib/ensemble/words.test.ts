import { describe, expect, it } from 'vitest';
import type { Figures, VersionsSummary } from './figures';
import { VERSIONS_LABEL, versionsView } from './words';

const START = '2027-01-01T00:00:00';
const main: Figures = { poweredH: 76, allPeriod: false, firstSunsetH: 67, longestNightH: 399, poweredContactH: 0, meets: null };
const summary = (s: Partial<VersionsSummary>): VersionsSummary => ({
  versions: 32,
  poweredH: [74, 79],
  firstSunsetH: [66, 69],
  noSunset: 0,
  longestNightH: [396, 402],
  poweredContactH: [0, 0],
  basis: 'verdict',
  held: 32,
  main,
  ...s,
});

describe('the terrain versions in words', () => {
  it('keeps the closed fold to two words', () => {
    expect(VERSIONS_LABEL.split(' ')).toHaveLength(2);
  });

  it('says in how many versions the verdict stands, and gives each key result’s range beside the app’s own figure', () => {
    const v = versionsView(summary({}), { startUtc: START, days: 30 });
    expect(v.held).toBe('The battery runs out in all 32 versions of the ground, as it does here.');
    expect(v.ranges).toEqual([
      'Time with power: 3 d 2 h to 3 d 7 h (here 3 d 4 h).',
      'First sunset: 3 Jan 18:00 to 3 Jan 21:00 UTC (here 3 Jan 19:00 UTC).',
      'Longest night: 16 d 12 h to 16 d 18 h (here 16 d 15 h).',
      'Contact with Earth while powered: none in any version (here none).',
    ]);
  });

  it('counts the versions that keep power for the whole period, or that meet the requirements set', () => {
    const all = { ...main, poweredH: 720, allPeriod: true, firstSunsetH: null, longestNightH: 0 };
    expect(versionsView(summary({ main: all, poweredH: [610, 720], held: 29 }), { startUtc: START, days: 30 }).held).toBe(
      'Power lasts all 30 days in 29 of 32 versions of the ground, as it does here; in 3 the battery runs out first.',
    );
    const meets = { ...main, meets: true };
    expect(versionsView(summary({ main: meets, basis: 'requirements', held: 30 }), { startUtc: START, days: 30 }).held).toBe('Still meets your requirements in 30 of 32 versions of the ground.');
    const fails = { ...main, meets: false };
    expect(versionsView(summary({ main: fails, basis: 'requirements', held: 2 }), { startUtc: START, days: 30 }).held).toBe(
      'Meets your requirements in 2 of 32 versions of the ground; on the app’s own skyline it fails them.',
    );
  });

  it('says when the app’s own figure lies outside every version, and when some versions have no sunset', () => {
    const v = versionsView(summary({ longestNightH: [500, 510], firstSunsetH: [66, 69], noSunset: 3, poweredH: [74, 720] }), { startUtc: START, days: 30 });
    expect(v.ranges[1]).toBe('First sunset: 3 Jan 18:00 to 3 Jan 21:00 UTC, none in the period in 3 versions (here 3 Jan 19:00 UTC).');
    expect(v.ranges[2]).toBe('Longest night: 20 d 20 h to 21 d 6 h (here 16 d 15 h, outside every version).');
    expect(v.ranges[0]).toBe('Time with power: 3 d 2 h to all 30 days (here 3 d 4 h).');
    expect(v.outside).toBe(true);
    expect(v.limits).toMatch(/not the chance that the landing works/);
  });
});
