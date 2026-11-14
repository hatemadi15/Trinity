// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import { NO_REQUIREMENTS } from '../plan/requirements';
import { DEFAULT_PARAMS, recompute, scanOf } from '../store/explore';
import { eph, sites } from '@/test/file-loaders';
import { VersionsClient } from './client';
import { useHoldsByHour, useTerrainVersions, versionsProblem, type VersionsAsk } from './useTerrainVersions';

const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
const r = recompute(eph, site, mask, '2027-01-01T00:00:00', 30);
const versions = { siteId: site.id, mastM: 2, adjusted: mask, masks: [mask.map((v) => v - 0.2), mask, mask.map((v) => v + 0.2)] };
const ask: VersionsAsk = { site, series: scanOf(r.series), hours: 720, params: DEFAULT_PARAMS, requirements: NO_REQUIREMENTS, mastM: 2 };

describe('useTerrainVersions', () => {
  it('waits while the versions load and run, then gives every version’s figures for the landing', async () => {
    const runner = new VersionsClient();
    const load = async () => versions;
    const { result } = renderHook(() => useTerrainVersions(ask, { load, runner }));
    expect(result.current.status).toBe('working');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const s = result.current.status === 'ready' ? result.current.result.summary : null;
    expect(s?.versions).toBe(3);
    expect(s?.main.poweredH).toBe(r.power.firstBrownoutHour ?? 720);
  });

  it('counts the holds of every landing hour only when asked', async () => {
    const runner = new VersionsClient();
    const { result } = renderHook(() => useTerrainVersions({ ...ask, byHour: true, requirements: { ...NO_REQUIREMENTS, minHoldPct: 90 } }, { load: async () => versions, runner }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.status === 'ready' && result.current.result.holdsByHour?.length).toBe(720);
  });

  it('works out the holds of every landing hour for the brief and the view from the site only when the requirement is set', async () => {
    let loads = 0;
    const load = async () => {
      loads++;
      return versions;
    };
    const runner = new VersionsClient();
    const none = renderHook(() => useHoldsByHour(ask, { load, runner }));
    await new Promise((r) => setTimeout(r, 20));
    expect(none.result.current).toBeNull();
    expect(loads).toBe(0);
    const asked = renderHook(() => useHoldsByHour({ ...ask, requirements: { ...NO_REQUIREMENTS, minHoldPct: 90 } }, { load, runner }));
    expect(asked.result.current).toBeNull();
    await waitFor(() => expect(asked.result.current?.length).toBe(720));
    expect(loads).toBe(1);
  });

  it('says plainly when a site has no versions, and nothing on a flat horizon', async () => {
    const missing = async () => {
      throw new Error('could not load /data/ensemble/x.json (HTTP 404)');
    };
    const { result } = renderHook(() => useTerrainVersions(ask, { load: missing, runner: new VersionsClient() }));
    await waitFor(() => expect(result.current).toEqual({ status: 'none', reason: 'No terrain versions were drawn for this site.' }));
    expect(versionsProblem({ polar: false, category: 'apollo' }, 2)).toBe('');
    expect(versionsProblem({ polar: true, category: 'custom' }, 2)).toMatch(/a point picked on the map has none/);
    expect(versionsProblem({ polar: true, category: 'classic' }, 5)).toMatch(/traced from a 2 m mast/);
    expect(versionsProblem({ polar: true, category: 'classic' }, 2)).toBeNull();
  });
});
