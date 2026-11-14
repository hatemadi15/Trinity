import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import { DEFAULT_POWER, simulateBattery } from '../engine/power';
import type { Series } from '../engine/metrics';
import type { MaskDoc, Site } from '../data/loaders';
import { createExploreStore, DEFAULT_PARAMS, DEFAULT_START, type SiteResult } from '../store/explore';
import { assessRequirements, DEFAULT_REQUIREMENTS, parsePlan, scenarioHref, scenarioMetrics, serializePlan, snapshotScenario } from './scenarios';

const site: Site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2', lat: -88.682, lon: -76.791, category: 'artemis', polar: true, source: 'NASA' };
const state = () => ({ site: { ...site }, startUtc: DEFAULT_START, days: 30 as const, params: { ...DEFAULT_PARAMS, power: { ...DEFAULT_POWER } } });

describe('shared scenario assumptions', () => {
  it('pins independent settings and round-trips every energy and horizon assumption', () => {
    const live = state();
    live.params.power = { panel: 'vertical', panelAzimuthDeg: 120, areaM2: 8, efficiency: .25, loadW: 400, batteryWh: 12000, initialSocFraction: .75 };
    live.params.mastM = 7;
    live.params.minEarthElDeg = 2;
    const pinned = snapshotScenario(live, 'Original arrival');
    const encoded = serializePlan([pinned], { requiredHours: 120, minContactHours: 12, maxGapHours: 48 });
    live.params.power.areaM2 = 30;
    live.site.name = 'Changed later';
    expect(pinned.params.power.areaM2).toBe(8);
    expect(pinned.site.name).toBe(site.name);
    expect(parsePlan(encoded)?.scenarios).toEqual([pinned]);
    expect(parsePlan(encoded)?.requirements).toEqual({ requiredHours: 120, minContactHours: 12, maxGapHours: 48 });
    expect(parsePlan(new URL(scenarioHref(pinned), 'http://localhost').searchParams.get('scenario')!)?.scenarios[0]).toEqual(pinned);
  });

  it('keeps custom coordinates and permits an empty workspace', () => {
    const pinned = snapshotScenario(state());
    pinned.site = { ...site, id: 'custom_-89.1000_20.0000', category: 'custom', lat: -89.1, lon: 20 };
    expect(parsePlan(serializePlan([pinned]))?.scenarios[0].site).toEqual(pinned.site);
    expect(parsePlan(serializePlan([]))?.scenarios).toEqual([]);
  });

  it('rejects malformed, oversized, non-finite and out-of-table settings', () => {
    const valid = JSON.parse(serializePlan([snapshotScenario(state())]));
    const mutate = (fn: (x: typeof valid) => void) => { const x = structuredClone(valid); fn(x); return parsePlan(JSON.stringify(x)); };
    expect(parsePlan('not json')).toBeNull();
    expect(parsePlan(' '.repeat(24001))).toBeNull();
    expect(mutate((x) => { x.version = 2; })).toBeNull();
    expect(mutate((x) => { x.scenarios[0].params.power.efficiency = 8; })).toBeNull();
    expect(mutate((x) => { x.scenarios[0].params.mastM = null; })).toBeNull();
    expect(mutate((x) => { x.scenarios[0].startUtc = '2036-12-20T00:00:00'; })).toBeNull();
    expect(mutate((x) => { x.scenarios[0].startUtc = '2027-01-01T00:30:00'; })).toBeNull();
    expect(mutate((x) => { x.requirements.requiredHours = -1; })).toBeNull();
    expect(mutate((x) => { x.requirements.minContactHours = 2161; })).toBeNull();
    expect(mutate((x) => { x.scenarios.push(x.scenarios[0]); })).toBeNull();
    expect(mutate((x) => { x.scenarios[0].site.id = '../../bad'; })).toBeNull();
  });
});

describe('screening requirements', () => {
  it('excludes Earth visibility after first power loss and reports separate failed requirements', () => {
    const power = simulateBattery(Float64Array.from([0, 0, 0, 500, 500, 500]), { ...DEFAULT_POWER, loadW: 100, batteryWh: 200 });
    const result = { power, series: { hours: 6, earthVisible: Uint8Array.from([0, 1, 0, 1, 1, 1]) } as Series, summary: { longestEarthGapH: 3 } } as SiteResult;
    expect(scenarioMetrics(result)).toEqual({ poweredHours: 2, contactHours: 1, longestEarthGapHours: 3 });
    const assessment = assessRequirements(result, { requiredHours: 3, minContactHours: 2, maxGapHours: 2 });
    expect(assessment.passes).toBe(false);
    expect(assessment.reasons).toHaveLength(3);
    expect(assessRequirements(result, { requiredHours: 2, minContactHours: 1, maxGapHours: 3 })).toEqual({ passes: true, reasons: [] });
  });
});

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
function testStore() {
  const calls: number[] = [];
  const store = createExploreStore({
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => readJson<MaskDoc>('data', 'masks', `${id}.json`),
    computeMask: async (_lat, _lon, mastM) => {
      calls.push(mastM);
      return { mask: new Float64Array(720).fill(mastM / 10), siteHeightM: 12, failedTiles: 0 };
    },
  });
  return { store, calls };
}

describe('independent scenario evaluation', () => {
  it('uses each pinned mast and lander without changing the live forecast', async () => {
    const { store, calls } = testStore();
    await store.getState().init();
    const before = store.getState();
    const scenario = snapshotScenario(before);
    scenario.params.mastM = 6;
    scenario.params.power.areaM2 = 12;
    scenario.startUtc = '2027-02-01T06:00:00';
    const evaluated = await store.getState().evaluateScenario(scenario);
    expect(evaluated.mastM).toBe(6);
    expect(evaluated.maskMeta.mastM).toBe(6);
    expect(calls).toEqual([6]);
    expect(store.getState().series).toBe(before.series);
    expect(store.getState().params).toBe(before.params);
    expect(store.getState().startUtc).toBe(before.startUtc);
    await store.getState().evaluateScenario(scenario);
    expect(calls).toEqual([6]);
  });

  it('restores custom coordinates, UTC arrival and every assumption from the shared URL', async () => {
    const { store } = testStore();
    await store.getState().init();
    const scenario = snapshotScenario(store.getState());
    scenario.site = { ...site, id: 'custom_-89.1000_20.0000', category: 'custom', lat: -89.1, lon: 20 };
    scenario.startUtc = '2027-03-02T12:00:00';
    scenario.params.mastM = 8;
    scenario.params.minEarthElDeg = 2.5;
    scenario.params.power.panel = 'horizontal';
    scenario.params.power.batteryWh = 12000;
    await store.getState().applyQuery(new URL(scenarioHref(scenario), 'http://localhost').searchParams);
    expect(store.getState().error).toBeNull();
    expect(store.getState().site).toEqual(scenario.site);
    expect(store.getState().params).toEqual(scenario.params);
    expect(store.getState().startUtc).toBe(scenario.startUtc);
    expect(store.getState().maskMeta?.mastM).toBe(8);
    expect(store.getState().series?.hours).toBe(720);
  });

  it('rejects a known site whose imported coordinate was changed', async () => {
    const { store } = testStore();
    await store.getState().init();
    const scenario = snapshotScenario(store.getState());
    scenario.site.lat += .1;
    await expect(store.getState().evaluateScenario(scenario)).rejects.toThrow(/catalogue/);
    scenario.site.category = 'custom';
    await expect(store.getState().evaluateScenario(scenario)).rejects.toThrow(/cannot replace/);
    expect(parsePlan(serializePlan([snapshotScenario(store.getState())], DEFAULT_REQUIREMENTS))).not.toBeNull();
  });

  it('recomputes compared-site and catalogue summaries using the requested mast', async () => {
    const { store } = testStore();
    await store.getState().init();
    await store.getState().addToCompare('shackleton_center');
    store.getState().setParams({ mastM: 6 });
    await store.getState().waitForMask();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getState().compare[0].mastM).toBe(6);
    const scenario = snapshotScenario(store.getState());
    scenario.site = sites.find((s) => s.id === 'shackleton_center')!;
    const independent = await store.getState().evaluateScenario(scenario);
    expect(store.getState().compare[0].summary).toEqual(independent.summary);
    await store.getState().loadOverview();
    expect(store.getState().overview.shackleton_center.sunFraction).toBe(independent.summary.illumFraction);
  });

  it('does not let an older shared terrain request overwrite a newer forecast', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const store = createExploreStore({
      loadSites: async () => sites,
      loadEphemeris: async () => eph,
      loadMask: async (id) => readJson<MaskDoc>('data', 'masks', `${id}.json`),
      computeMask: async () => {
        await pending;
        return { mask: new Float64Array(720), siteHeightM: 12, failedTiles: 0 };
      },
    });
    await store.getState().init();
    const oldScenario = snapshotScenario(store.getState());
    oldScenario.params.mastM = 8;
    oldScenario.startUtc = '2027-03-01T12:00:00';
    const older = store.getState().applyQuery(new URL(scenarioHref(oldScenario), 'http://localhost').searchParams);
    await store.getState().applyQuery('?site=shackleton_center&start=2027-02-01T06:00:00&days=14');
    const selected = store.getState().series;
    release();
    await older;
    expect(store.getState().siteId).toBe('shackleton_center');
    expect(store.getState().startUtc).toBe('2027-02-01T06:00:00');
    expect(store.getState().params.mastM).toBe(2);
    expect(store.getState().series).toBe(selected);
    expect(store.getState().error).toBeNull();
  });
});
