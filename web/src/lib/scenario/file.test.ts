import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/data/loaders';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { FILE_FORMAT, FILE_VERSION, figuresOf, fileName, readScenarioFile, scenarioFile, type FileColumn } from './file';
import type { Outcome } from './outcome';
import type { Scenario } from './scenario';
import { APP, loadDataVersions } from './versions';

const rim: Site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (formal)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'NASA', approximate: true };
const base: Scenario = { id: 'a', label: 'Original landing', siteId: rim.id, startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };
const later: Scenario = { ...base, id: 'b', label: '5 days later', startUtc: '2027-01-06T00:00:00', from: 'a' };
const figures = { poweredH: 76, allPeriod: false, sunFraction: 0.446, earthFraction: 0.45, poweredContactH: 0, outage: { start: 1, end: 220, hours: 219, fromStart: false, toEnd: false }, longestNightH: 399 } as Outcome;
const cols: FileColumn[] = [
  { scenario: base, site: rim, outcome: figures },
  { scenario: later, site: rim, outcome: null },
];
const versions = { data: 'data version 2026-11-14-a120b7a9', ephemeris: 'DE440 table abc', sites: 'sites.json version 1', terrain: null };
const NOW = new Date('2026-11-14T12:30:00Z');

/** The settings alone: ids are given again on reading. */
const settings = (s: Scenario) => {
  const copy: Partial<Scenario> = { ...s };
  delete copy.id;
  delete copy.from;
  return copy;
};

describe('a scenario file', () => {
  it('holds every setting of every scenario, the app’s and the data’s versions, the link and the figures at export', () => {
    const f = scenarioFile(cols, versions, NOW);
    expect(f).toMatchObject({ format: FILE_FORMAT, version: FILE_VERSION, app: APP, data: versions, exportedUtc: '2026-11-14T12:30:00Z' });
    expect(f.link).toMatch(/^\/compare\?v=1&s=de_gerlache_rim_2~2027010100~/);
    expect(f.scenarios[0]).toEqual({
      label: 'Original landing',
      baseline: true,
      site: { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, approximate: true },
      landingUtc: '2027-01-01T00:00:00Z',
      days: 30,
      lander: DEFAULT_POWER,
      mastM: 2,
      minEarthElevationDeg: 0,
      landingTime: 'set',
      madeFrom: null,
      figures: { timeWithPowerHours: 76, sunlightPercent: 45, earthInViewPercent: 45, earthInViewWithPowerHours: 0, longestTimeWithoutEarthHours: 219, longestNightHours: 399 },
    });
    expect(f.scenarios[1]).toMatchObject({ baseline: false, madeFrom: 0, landingUtc: '2027-01-06T00:00:00Z', figures: null });
    expect(fileName(cols, NOW)).toBe('earthrise-comparison-2026-11-14.json');
    expect(fileName(cols.slice(0, 1), NOW)).toBe('earthrise-scenario-2026-11-14.json');
  });

  it('reads back into the same scenarios, with the figures the file was saved with', () => {
    const text = JSON.stringify(scenarioFile(cols, versions, NOW));
    const r = readScenarioFile(text);
    expect(r.problem).toBeNull();
    expect(r.scenarios.map(settings)).toEqual([base, later].map(settings));
    expect(r.scenarios[1].from).toBe(r.scenarios[0].id);
    expect(r.figures[0]).toEqual(figuresOf(figures));
    expect(r.figures[1]).toBeNull();
    expect(r.saved).toEqual({ app: APP, data: versions, exportedUtc: '2026-11-14T12:30:00Z' });
  });

  it('says in plain words what is wrong with a file it cannot read', () => {
    expect(readScenarioFile('not json').problem).toBe('This file is not a scenario file from Earthrise: it is not JSON.');
    expect(readScenarioFile('{"format":"other"}').problem).toBe('This file is not a scenario file from Earthrise.');
    expect(readScenarioFile(JSON.stringify({ format: FILE_FORMAT, version: 7, scenarios: [] })).problem).toBe('This scenario file is version 7, from a newer Earthrise: this one reads version 1.');
    const f = scenarioFile(cols, versions, NOW);
    f.scenarios[1].days = 400;
    const r = readScenarioFile(JSON.stringify(f));
    expect(r.scenarios).toHaveLength(1);
    expect(r.problem).toBe('One scenario in this file could not be read and is left out.');
  });

  it('reads the versions from the data’s own headers', async () => {
    const v = await loadDataVersions(async (path) => readJson('web', 'public', 'data', ...path.split('/')));
    expect(v.ephemeris).toMatch(/^DE440 table [0-9a-f]{12}, made \d{4}-\d{2}-\d{2}$/);
    expect(v.sites).toMatch(/^sites\.json version \d+/);
    const missing = await loadDataVersions(async () => {
      throw new Error('404');
    });
    expect(missing).toEqual({ data: null, ephemeris: null, sites: null, terrain: null });
  });
});
