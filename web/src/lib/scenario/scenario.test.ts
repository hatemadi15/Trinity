import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { DEFAULT_PARAMS } from '@/lib/store/explore';
import { baselineFrom, duplicateOf, paramsOf, sameLanding, scenarioKey, slipLabel, slipOf, type Scenario } from './scenario';

const base: Scenario = {
  id: 'a',
  label: 'Original landing',
  siteId: 'de_gerlache_rim_2',
  startUtc: '2027-01-01T00:00:00',
  days: 30,
  power: DEFAULT_POWER,
  mastM: 2,
  minEarthElDeg: 0,
  timing: 'set',
};

describe('a scenario', () => {
  it('takes every setting that changes a result from Explore: the site, the landing, the length, the lander, the mast and the clearance for Earth', () => {
    const s = baselineFrom({ siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, params: { ...DEFAULT_PARAMS, mastM: 3, minEarthElDeg: 1.5 } }, 'a');
    expect(s).toEqual({ ...base, mastM: 3, minEarthElDeg: 1.5 });
    expect(paramsOf(s)).toEqual({ power: DEFAULT_POWER, mastM: 3, minEarthElDeg: 1.5 });
  });

  it('lands on a whole UTC hour', () => {
    expect(baselineFrom({ siteId: 'x', startUtc: '2027-01-01T05:40:00', days: 30, params: DEFAULT_PARAMS }, 'a').startUtc).toBe('2027-01-01T06:00:00');
  });

  it('slips by days or hours into a new scenario that keeps everything else, named for the slip', () => {
    const later = slipOf(base, 5 * 24, 'b');
    expect(later).toEqual({ ...base, id: 'b', startUtc: '2027-01-06T00:00:00', label: '5 days later', from: 'a' });
    expect(slipOf(base, -6, 'c')).toMatchObject({ startUtc: '2026-12-31T18:00:00', label: '6 hours earlier' });
    expect(slipLabel(30)).toBe('1 day 6 hours later');
    expect(slipLabel(24)).toBe('1 day later');
  });

  it('stops a slip at the end of the Sun and Earth table and says so', () => {
    const late = slipOf({ ...base, startUtc: '2036-12-01T00:00:00' }, 10 * 24, 'b');
    expect(late.startUtc).toBe('2036-12-02T00:00:00');
    expect(late.note).toMatch(/table ends on 31 December 2036/);
  });

  it('duplicates into a copy with its own id, made from the original', () => {
    expect(duplicateOf(base, 'b')).toEqual({ ...base, id: 'b', label: 'Copy of Original landing', from: 'a' });
  });

  it('keys a result on the settings alone, not the label or the id', () => {
    expect(scenarioKey(base)).toBe(scenarioKey({ ...base, id: 'z', label: 'Other' }));
    expect(scenarioKey(base)).not.toBe(scenarioKey({ ...base, mastM: 3 }));
    expect(scenarioKey(base)).not.toBe(scenarioKey({ ...base, power: { ...DEFAULT_POWER, batteryWh: 4000 } }));
  });

  it('knows when two scenarios land at the same time', () => {
    expect(sameLanding([base, { ...base, siteId: 'other' }])).toBe(true);
    expect(sameLanding([base, slipOf(base, 24, 'b')])).toBe(false);
  });
});
