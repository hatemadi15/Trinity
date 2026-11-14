import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import type { Scenario } from '@/lib/scenario/scenario';
import { createExploreStore } from '@/lib/store/explore';
import { createScenarioStore } from '@/lib/store/scenarios';
import { fileLoaders } from '@/test/file-loaders';

describe('a compared scenario whose site has no horizon file on the server', () => {
  it('says so in plain words, with no path or status code, while the other scenarios work', async () => {
    const files = fileLoaders();
    const loaders = fileLoaders({
      loadMask: (id: string) => (id === 'nobile_rim_2' ? Promise.reject(new Error('could not load /data/masks/nobile_rim_2.json (HTTP 404)')) : files.loadMask(id)),
    });
    const explore = createExploreStore(loaders);
    const scenarios = createScenarioStore(explore, loaders);
    const base: Scenario = { id: 'a', label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };
    const other: Scenario = { ...base, id: 'b', label: 'Nobile', siteId: 'nobile_rim_2' };
    scenarios.getState().load([base, other]);
    await expect.poll(() => scenarios.getState().runs.b?.status, { timeout: 20_000 }).toBe('error');
    await expect.poll(() => scenarios.getState().runs.a?.status, { timeout: 20_000 }).toBe('ready');
    const error = scenarios.getState().runs.b?.error ?? '';
    expect(error).toMatch(/Nobile Rim 2: its horizon file is not on this server/);
    expect(error).not.toMatch(/\/data\/|HTTP|404|\.json/);
  });
});
