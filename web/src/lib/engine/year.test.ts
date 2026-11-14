import { describe, expect, it } from 'vitest';
import { eph, sites } from '@/test/file-loaders';
import { readJson } from './__tests__/helpers';
import { landingScores, timeWithPower } from './landing';
import { hourlySeries } from './metrics';
import { DEFAULT_PARAMS, recompute } from '../store/explore';
import { isoAt } from '../viz/format';
import { utcToEt } from './time';
import { runAll, runSliced, YEAR_DAYS, yearDayCount, yearSteps, type YearInput } from './year';

const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const input = (over: Partial<YearInput> = {}): YearInput => ({ site, mask, startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_PARAMS.power, minEarthElDeg: 0, ...over });

/** What Explore shows for a period from that day: the hours with power, and of those the hours with Earth in view. */
function verdictFigures(startUtc: string, days: number, minEarthElDeg = 0) {
  const r = recompute(eph, site, mask, startUtc, days, { ...DEFAULT_PARAMS, minEarthElDeg });
  const powered = timeWithPower(r.power);
  let contact = 0;
  for (let h = 0; h < powered; h++) contact += r.series.earthVisible[h];
  return { powered, contact };
}

describe('the year of landing days', () => {
  it('counts the 365 landing days a best-date search covers, fewer when the Sun and Earth table ends first', () => {
    expect(YEAR_DAYS).toBe(365);
    expect(yearDayCount(eph, '2027-01-01T00:00:00', 30)).toBe(365);
    // A 90-day period must end by 1 January 2037, 00:00 UTC: the last landing is 3 October 2036, 125 days after 1 June.
    expect(yearDayCount(eph, '2036-06-01T00:00:00', 90)).toBe(125);
    expect(yearDayCount(eph, '2036-10-03T00:00:00', 90)).toBe(1);
    expect(yearDayCount(eph, '2036-10-04T00:00:00', 90)).toBe(0);
  });

  it('gives each day the time with power and the radio contact that Explore shows for a period from that day', () => {
    const year = runAll(yearSteps(eph, input()));
    expect(year.count).toBe(365);
    for (const k of [0, 19, 100, 364]) {
      const v = verdictFigures(isoAt('2027-01-01T00:00:00', k * 24), 30);
      expect([year.powered[k], year.contact[k]], `day ${k}`).toEqual([v.powered, v.contact]);
    }
  });

  it('keeps the landing hour of the start for every day, and counts Earth only as high above the hills as the lander asks', () => {
    const year = runAll(yearSteps(eph, input({ startUtc: '2027-01-20T10:00:00', days: 14, minEarthElDeg: 2 })));
    for (const k of [0, 45, 200]) {
      const v = verdictFigures(isoAt('2027-01-20T10:00:00', k * 24), 14, 2);
      expect([year.powered[k], year.contact[k]], `day ${k}`).toEqual([v.powered, v.contact]);
    }
  });

  it('says whether the Sun shows at each landing hour, as the best-date search asks of a landing', () => {
    const year = runAll(yearSteps(eph, input()));
    const s = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 365 * 24);
    for (const k of [0, 19, 100, 364]) expect(year.sunlit[k], `day ${k}`).toBe(s.sunFraction[k * 24] > 0 ? 1 : 0);
  });

  it('stops at the end of the table', () => {
    const year = runAll(yearSteps(eph, input({ startUtc: '2036-06-01T00:00:00', days: 90 })));
    expect(year.count).toBe(125);
    expect(year.powered).toHaveLength(125);
    const v = verdictFigures('2036-10-03T00:00:00', 90);
    expect([year.powered[124], year.contact[124]]).toEqual([v.powered, v.contact]);
  });

  it('works the hours out in slices, pausing between them, with the same days as one pass', () => {
    const steps = yearSteps(eph, input({ days: 90 }));
    let pauses = 0;
    let next = steps.next();
    while (!next.done) {
      pauses++;
      next = steps.next();
    }
    expect(pauses).toBeGreaterThanOrEqual(12);
    const whole = landingScores(hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 364 * 24 + 90 * 24), DEFAULT_PARAMS.power, { from: 0, to: 364 * 24 + 1, step: 24, capHours: 90 * 24 });
    expect(Array.from(next.value.powered)).toEqual(Array.from(whole.powered));
    expect(Array.from(next.value.contact)).toEqual(Array.from(whole.contact));
  });

  it('lets the page paint between slices, and stops as soon as its inputs have moved on', async () => {
    let paints = 0;
    const done = await runSliced(yearSteps(eph, input({ days: 14 })), () => false, async () => {
      paints++;
    });
    expect(done?.count).toBe(365);
    expect(paints).toBeGreaterThanOrEqual(12);
    let checks = 0;
    const stale = await runSliced(yearSteps(eph, input({ days: 14 })), () => ++checks > 2, async () => {});
    expect(stale).toBeNull();
    expect(checks).toBe(3);
  });

  it('gives an empty year when not one period fits before the table ends', () => {
    const year = runAll(yearSteps(eph, input({ startUtc: '2036-12-01T00:00:00', days: 90 })));
    expect(year.count).toBe(0);
    expect(year.powered).toHaveLength(0);
  });
});
