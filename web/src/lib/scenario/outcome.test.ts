import { describe, expect, it } from 'vitest';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { recompute } from '@/lib/store/explore';
import { eph, sites } from '@/test/file-loaders';
import { outcomeOf } from './outcome';
import { paramsOf, type Scenario } from './scenario';

const mask = (id: string) => Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', `${id}.json`).elevation_deg);
const base: Scenario = { id: 'a', label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };

function run(s: Scenario) {
  const site = sites.find((x) => x.id === s.siteId)!;
  return outcomeOf(recompute(eph, site, mask(site.id), s.startUtc, s.days, paramsOf(s), s.mastM), s, site.label ?? site.name);
}

describe('the figures of a scenario', () => {
  it('gives the original landing at de Gerlache Rim 2 as the table and the answer do', () => {
    const o = run(base);
    expect(o.poweredH).toBe(76);
    expect(o.allPeriod).toBe(false);
    expect(o.sunFraction).toBeCloseTo(0.446, 3);
    expect(o.earthFraction).toBeCloseTo(0.45, 3);
    // Earth is out of view for the whole of the 3 d 4 h with power: no powered contact, the answer's first sentence.
    expect(o.poweredContactH).toBe(0);
    expect(o.answer.sentences[0]).toMatch(/^No radio contact/);
    expect(o.verdict).toBe('power for 3 days 4 hours, then night');
    expect(o.longestNightH).toBe(399);
    expect(o.outage?.hours).toBe(219);
    // The first sunset after landing ends the power, 2 d 19 h after landing; a full battery lasts 10 hours.
    expect(o.firstSunset.inHours).toBe(67);
    expect(o.batteryH).toBe(10);
    expect(o.sunAtLanding).toBe(true);
    expect(o.best).toEqual({ hour: 466, poweredHours: 303, earthFraction: expect.any(Number) });
  });

  it('gives the same site five days later: a landing at night, on the battery alone', () => {
    const o = run({ ...base, startUtc: '2027-01-06T00:00:00' });
    expect(o.poweredH).toBe(10);
    expect(o.sunAtLanding).toBe(false);
    expect(o.verdict).toBe('power for 10 hours, then night');
  });

  it('gives a site that keeps power for the whole period', () => {
    const o = run({ ...base, siteId: 'de_gerlache_center_rim_high', startUtc: '2027-01-06T00:00:00' });
    expect(o.poweredH).toBe(720);
    expect(o.allPeriod).toBe(true);
    expect(o.firstSunset.at).toBeNull();
    expect(o.poweredContactH).toBe(351);
    expect(o.answer.tone).toBe('good');
  });
});
