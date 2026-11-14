import { describe, expect, it } from 'vitest';
import { readComparison, writeComparison } from '../scenario/codec';
import { readScenarioFile, scenarioFile } from '../scenario/file';
import { paramsOf, type Scenario } from '../scenario/scenario';
import { DEFAULT_PARAMS, type PlannerParams } from '../store/explore';
import { sites } from '@/test/file-loaders';
import { mergeSettings, parseSettings, SETTING_NAMES, settingsEntries, withSettings } from './settings';

/** Every setting a link carries away from its default, each inside the lander dialog's range. */
const odd: PlannerParams = {
  power: { panel: 'vertical', panelAzimuthDeg: 135, areaM2: 6.5, efficiency: 0.28, loadW: 150, batteryWh: 5000, initialSocFraction: 0.8 },
  mastM: 5,
  minEarthElDeg: 1.5,
};

const scenario: Scenario = { id: 'a', label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: odd.power, mastM: odd.mastM, minEarthElDeg: odd.minEarthElDeg, timing: 'set' };

describe("Explore's settings in a comparison", () => {
  it('names every setting away from its default, so the check below covers them all', () => {
    expect(settingsEntries(odd).map(([k]) => k).sort()).toEqual(Object.values(SETTING_NAMES).sort());
  });

  it("carries every setting of Explore's link in a comparison's link and in a scenario file, and reads each back the same", () => {
    const href = withSettings('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30', odd);
    expect(mergeSettings(DEFAULT_PARAMS, parseSettings(href.slice(href.indexOf('?'))))).toEqual(odd);
    const link = readComparison(writeComparison([scenario]));
    expect(link.problem).toBeNull();
    expect(paramsOf(link.scenarios[0])).toEqual(odd);
    const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
    const file = readScenarioFile(JSON.stringify(scenarioFile([{ scenario, site, outcome: null }], { data: null, ephemeris: null, sites: null, terrain: null })));
    expect(file.problem).toBeNull();
    expect(paramsOf(file.scenarios[0])).toEqual(odd);
  });
});
