// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExploreView } from '@/components/ExploreView';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { MemoryTileSource, type TileLevel } from '@/lib/engine/tiles';
import { handleEngineRequest } from '@/lib/engine/worker-handler';
import { createExploreStore, skylineFromWorker, type Loaders } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { findingsWith, LOST_TILE } from '@/test/terrain';
import type { Coverage } from '@/lib/engine/horizon';

/** de Gerlache Rim 2's own skyline, so a worker that returns it gives the figures the page has at 2 m. */
const rim = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;

/** A worker that returns the rim's skyline with what its march found, once `gate` opens. */
function worker(coverage: Partial<Coverage> = {}, gate: Promise<void> = Promise.resolve()): NonNullable<Loaders['computeMask']> {
  return async () => {
    await gate;
    return { mask: Float64Array.from(rim), siteHeightM: 190, failedTiles: coverage.absentTiles?.length ?? 0, terrain: findingsWith(coverage) };
  };
}

async function open(loaders: Loaders) {
  window.history.replaceState({}, '', '/explore');
  const store = createExploreStore(loaders);
  render(<ExploreView store={store} navigate={() => {}} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy(), { timeout: 20_000 });
  return store;
}
const verdict = () => screen.getByRole('region', { name: 'The answer' });

afterEach(() => {
  window.history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('Explore says what the terrain behind its figures is', () => {
  it('shows the hills being worked out for a new mast height, the height the figures are still from, and holds the better day back', async () => {
    let open_!: () => void;
    const gate = new Promise<void>((r) => (open_ = r));
    const store = await open(fileLoaders({ computeMask: worker({}, gate) }));
    expect(within(verdict()).getByRole('button', { name: 'Land on 20 January instead' })).toBeTruthy();
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(screen.getByRole('status', { name: 'The hills behind these figures' }).textContent).toMatch(/^Working out the hills seen from a 5 m mast( for \d+ sites)?… The figures below are still from 2 m\.$/));
    expect(within(verdict()).queryByRole('button', { name: /^Land on/ })).toBeNull();
    expect(verdict().textContent).toMatch(/The better landing day waits for the hills seen from the new mast height\./);
    act(() => open_());
    await waitFor(() => expect(screen.queryByRole('status', { name: 'The hills behind these figures' })).toBeNull(), { timeout: 20_000 });
    expect(store.getState().maskMeta?.mastM).toBe(5);
    expect(within(verdict()).getByRole('button', { name: 'Land on 20 January instead' })).toBeTruthy();
  });

  it('says in the verdict that a lost tile leaves the terrain incomplete, and names no better day and no better place', async () => {
    const store = await open(fileLoaders({ computeMask: worker(LOST_TILE) }));
    await waitFor(() => expect(verdict().textContent).toMatch(/Nearby, de Gerlache rim summit/), { timeout: 20_000 });
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() => expect(store.getState().maskMeta?.terrain?.quality).toBe('incomplete'), { timeout: 20_000 });
    await waitFor(() =>
      expect(verdict().textContent).toMatch(
        /Terrain incomplete: the elevation map is missing in 7 of 720 directions, from 100 km out\. Hills there are left out, so the Sun and Earth may be in view less than these figures say\./,
      ),
    );
    expect(within(verdict()).queryByRole('button', { name: /^Land on/ })).toBeNull();
    expect(verdict().textContent).toMatch(/No better landing day is named: the terrain here is incomplete, so these figures may be too high\./);
    expect(verdict().textContent).not.toMatch(/Nearby,/);
    expect(within(verdict()).queryByRole('link', { name: /^Explore / })).toBeNull();
    // The one gold action left is to compare sites.
    expect(document.querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(within(verdict()).getByRole('button', { name: 'Compare sites' }).className).toMatch(/btn-primary/);
  });

  it('says why the hills for a new mast could not be worked out, and not that the place lies north of 60° S', async () => {
    const store = await open(
      fileLoaders({
        computeMask: async () => {
          throw new Error('could not load /data/tiles/manifest.json (HTTP 404)');
        },
      }),
    );
    act(() => store.getState().setParams({ mastM: 5 }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'The hills behind these figures' }).textContent).toMatch(
        /The hills seen from a 5 m mast could not be worked out( for \d+ sites)?: the elevation map tiles are not on this server\. The figures below are still from 2 m\./,
      ),
      { timeout: 20_000 },
    );
    expect(screen.getByRole('main').textContent).not.toMatch(/south of 60° S/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('carries what the march found, from the engine to the verdict, for a place whose map lacks a tile', async () => {
    // Three synthetic grids round the pole, as the tiles are cut: 1024 pixels in tiles of 512, the coarsest wide
    // enough for the whole 220 km. The coarsest grid's tile 1_1, a quarter of it, is not on the server.
    const level = (id: string, scale: number): TileLevel => ({
      id, map_scale_m: scale, lines: 1024, samples: 1024, line_offset_px: 511.5, sample_offset_px: 511.5, max_latitude_deg: -60,
      dn_scale_m: 0.5, tile_size: 512, tiles_x: 2, tiles_y: 2, nodata: -32768, path: `${id}/{y}_{x}.bin`,
    });
    const manifest = { version: 1, generated_utc: '2026-11-12T09:07:07+00:00', reference_radius_m: 1737400, levels: [level('L0', 20), level('L1', 200), level('L2', 480)] };
    const tiles = Object.fromEntries(manifest.levels.map((l) => [l.id, new MemoryTileSource(l, new Int16Array(1024 * 1024), new Set(l.id === 'L2' ? ['1_1'] : []))]));
    const deps = { manifest: async () => manifest, source: () => ({ getTileBytes: (l: TileLevel, ty: number, tx: number) => tiles[l.id].getTileBytes(l, ty, tx) }) };
    // jsdom's Blob cannot stream, and the tiles are inflated from a stream as in the browser: Node's Blob can.
    vi.stubGlobal('Blob', NodeBlob);
    const store = await open(
      fileLoaders({
        computeMask: async (lat, lon, mastM) => {
          const res = await handleEngineRequest({ id: 1, type: 'mask', lat, lon, base: 'terrain-flow', mastM }, deps);
          if (res.type === 'error') throw new Error(res.message);
          return skylineFromWorker(res);
        },
      }),
    );
    await act(() => store.getState().selectCustom(-89.999, 0));
    await waitFor(() => expect(store.getState().site?.category).toBe('custom'), { timeout: 60_000 });
    const terrain = store.getState().maskMeta!.terrain!;
    expect(terrain.quality).toBe('incomplete');
    expect(terrain.findings?.coverage.absentTiles).toEqual(['L2/1_1']);
    const open_ = terrain.findings!.coverage.openAzimuths;
    expect(open_).toBeGreaterThan(150);
    expect(verdict().textContent).toContain(`Terrain incomplete: the elevation map is missing in ${open_} of 720 directions, from 100 km out.`);
  }, 120_000);
});
