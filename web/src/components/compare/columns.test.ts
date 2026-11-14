import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { NO_REQUIREMENTS } from '@/lib/plan/requirements';
import type { Scenario } from '@/lib/scenario/scenario';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';
import { columnsOf } from './columns';

const base: Scenario = { id: 'a', label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };
const near: Scenario = { ...base, id: 'b', label: 'Nearby: de Gerlache rim summit', siteId: 'de_gerlache_center_rim_high', from: 'a' };

/** The two scenarios worked out on the real catalogue and sky. */
async function worked() {
  const loaders = fileLoaders();
  const explore = createExploreStore(loaders);
  await explore.getState().init();
  const scenarios = createScenarioStore(explore, loaders);
  scenarios.getState().load([base, near]);
  await scenarios.getState().settle();
  return { explore, scenarios };
}

describe('columnsOf', () => {
  it('checks each scenario worked out against the planner’s requirements: met or failed, with its value and margin', async () => {
    const { explore, scenarios } = await worked();
    const { runs } = scenarios.getState();
    const req = { ...NO_REQUIREMENTS, minPoweredH: 120, maxOutageH: 96 };
    const [rim, summit] = columnsOf([base, near], runs, explore.getState().sites, req);
    // At the ridge the battery runs out after 3 days 4 hours, Earth out of view all that time; on the summit the power
    // lasts all 30 days, with almost 9 days in a row without Earth.
    expect(rim.checks?.map((c) => [c.met, c.words])).toEqual([
      [false, 'Power for at least 5 d: 3 d 4 h, 1 d 20 h short'],
      [true, 'Longest time without Earth while powered at most 4 d: 3 d 4 h, 20 h to spare'],
    ]);
    expect(summit.checks?.map((c) => [c.met, c.words])).toEqual([
      [true, 'Power for at least 5 d: 30 d, 25 d to spare'],
      [false, 'Longest time without Earth while powered at most 4 d: 8 d 23 h, 4 d 23 h too long'],
    ]);
  });

  it('marks the share of terrain versions, which Compare does not check, as set but not checked', async () => {
    const { explore, scenarios } = await worked();
    const { runs } = scenarios.getState();
    const sites = explore.getState().sites;
    const [rim] = columnsOf([base, near], runs, sites, { ...NO_REQUIREMENTS, minPoweredH: 120, minHoldPct: 90 });
    expect(rim.checks?.map((c) => c.id)).toEqual(['power']);
    expect(rim.unchecked).toBe(true);
    expect(columnsOf([base, near], runs, sites, { ...NO_REQUIREMENTS, minPoweredH: 120 })[0].unchecked).toBe(false);
  });

  it('checks nothing with no requirement set, or before a scenario is worked out', async () => {
    const { explore, scenarios } = await worked();
    const { runs } = scenarios.getState();
    for (const c of columnsOf([base, near], runs, explore.getState().sites, NO_REQUIREMENTS)) expect(c.checks ?? []).toEqual([]);
    for (const c of columnsOf([base, near], runs, explore.getState().sites)) expect(c.checks ?? []).toEqual([]);
    expect(columnsOf([base], {}, explore.getState().sites, { ...NO_REQUIREMENTS, minPoweredH: 120 })[0].checks ?? []).toEqual([]);
  });
});
