// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BriefView } from '@/components/BriefView';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore, type Loaders } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { findingsWith, LOST_TILE } from '@/test/terrain';
import type { Coverage } from '@/lib/engine/horizon';

const rim = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;

/** A worker that returns de Gerlache Rim 2's own skyline, with what its march found, once `gate` opens. */
function worker(coverage: Partial<Coverage> = {}, gate: Promise<void> = Promise.resolve()): NonNullable<Loaders['computeMask']> {
  return async () => {
    await gate;
    return { mask: Float64Array.from(rim), siteHeightM: 190.33, failedTiles: coverage.absentTiles?.length ?? 0, terrain: findingsWith(coverage) };
  };
}

async function brief(loaders: Loaders, mastM: number) {
  const store = createExploreStore(loaders);
  await store.getState().init();
  render(<BriefView store={store} narrate={async () => ({ reply: '', source: 'template' })} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('de Gerlache Rim 2'));
  act(() => store.getState().setParams({ mastM }));
  return store;
}
const method = () => screen.getByRole('heading', { name: 'How this was computed' }).parentElement!.textContent ?? '';
const verdict = () => screen.getByRole('heading', { name: /^Landing at de Gerlache Rim 2/ }).parentElement!.textContent ?? '';

describe('the brief says what the terrain behind it is', () => {
  it('gives the height the hills are seen from, where they come from, and every number of the terrain found', async () => {
    const store = await brief(fileLoaders({ computeMask: worker() }), 5);
    await waitFor(() => expect(store.getState().maskMeta?.mastM).toBe(5), { timeout: 20_000 });
    await waitFor(() => expect(method()).toMatch(/^How this was computedSite height 190 m with a 5 m mast; hills worked out in your browser from NASA elevation data, from a 5 m mast \(tiles cut 12 November 2026\)/));
    expect(method()).toMatch(/Terrain complete: terrain found at every step along 720 directions out to 220 km\./);
    expect(verdict()).toMatch(/From 20 January, 10:00 UTC: power for 12 days 15 hours in a row\./);
  });

  it('says in its verdict that the terrain is incomplete, gives no better day, and lists what is missing', async () => {
    const store = await brief(fileLoaders({ computeMask: worker(LOST_TILE) }), 5);
    await waitFor(() => expect(store.getState().maskMeta?.terrain?.quality).toBe('incomplete'), { timeout: 20_000 });
    await waitFor(() => expect(verdict()).toMatch(/Terrain incomplete: the elevation map is missing in 7 of 720 directions, from 100 km out\./));
    expect(verdict()).not.toMatch(/From 20 January/);
    expect(verdict()).toMatch(/No better landing day is named: the terrain here is incomplete, so these figures may be too high\./);
    expect(method()).toMatch(/Terrain found at 99\.993 % of the steps along 720 directions out to 220 km; missing: none within 6 km, none from 6 to 100 km, 0\.013 % from 100 to 220 km\. 7 directions may have hills the map lacks\. Tiles not on the server: L2\/7_7\./);
  });

  it('says while the hills for a new mast are worked out that its figures are still from the old height', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = await brief(fileLoaders({ computeMask: worker({}, gate) }), 6);
    expect(screen.getByRole('status', { name: 'The hills behind these figures' }).textContent).toBe('Working out the hills seen from a 6 m mast… The figures below are still from 2 m.');
    expect(method()).toMatch(/^How this was computedSite height 190 m with a 2 m mast; hills measured from NASA elevation data ahead of time/);
    act(() => release());
    await waitFor(() => expect(store.getState().maskMeta?.mastM).toBe(6), { timeout: 20_000 });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'The hills behind these figures' })).toBeNull());
  });
});
