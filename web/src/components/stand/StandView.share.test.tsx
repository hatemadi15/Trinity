// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkyLabels } from '@/lib/sky/standRenderer';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import type { RendererLike } from './StandCanvas';
import { StandView } from './StandView';

vi.mock('@/lib/data/sky', () => ({
  loadSkyAssets: async () => ({
    stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() },
    moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) },
    earthDayUrl: '',
    earthCloudsUrl: '',
    names: [],
  }),
}));

const nowhere: SkyLabels = {
  sun: { x: 0, y: 0, visible: false },
  earth: { x: 0, y: 0, visible: false },
  stars: [],
  lander: { x: 0, y: 0, visible: false },
  parts: { panel: { x: 0, y: 0, visible: false }, dish: { x: 0, y: 0, visible: false }, lamp: { x: 0, y: 0, visible: false } },
  shadow: { x: 0, y: 0, visible: false, lengthM: 0, levelM: 0 },
};
const stub = () => ({ setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels: () => nowhere, dispose: vi.fn() }) satisfies RendererLike;

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the view from the site, opened from a link with settings', () => {
  it('works its figures out from them, and its better day and its way back to Explore keep them', async () => {
    window.history.replaceState(null, '', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&battery=6000&earthmin=1');
    const store = createExploreStore(fileLoaders());
    render(<StandView store={store} createRenderer={() => stub()} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on 1 January/), { timeout: 20_000 });
    expect(store.getState().params.power.batteryWh).toBe(6000);
    expect(store.getState().params.minEarthElDeg).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const card = document.getElementById('stand-card')!;
    expect(within(card).getByRole('link', { name: 'Change date' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30&battery=6000&earthmin=1');
    const better = await within(card).findByRole('link', { name: /^Try \d+ January instead/ });
    expect(better.getAttribute('href')).toMatch(/&hour=0&battery=6000&earthmin=1$/);
    fireEvent.click(better);
    await waitFor(() => expect(window.location.search).toMatch(/&hour=0&battery=6000&earthmin=1$/));
  });

  it('keeps the settings in its address in step when the lander changes in the view, and its other parts as they were', async () => {
    window.history.replaceState(null, '', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast&battery=6000');
    const store = createExploreStore(fileLoaders());
    render(<StandView store={store} createRenderer={() => stub()} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on 1 January/), { timeout: 20_000 });
    await waitFor(() => expect(store.getState().params.power.batteryWh).toBe(6000));
    act(() => store.getState().setPower({ loadW: 400 }));
    await waitFor(() => expect(window.location.search).toBe('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast&load=400&battery=6000'), { timeout: 10_000 });
    act(() => store.getState().setPower({ loadW: 200, batteryWh: 2000 }));
    await waitFor(() => expect(window.location.search).toBe('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast'));
    expect(window.location.pathname).toBe('/explore/stand');
  });
});
