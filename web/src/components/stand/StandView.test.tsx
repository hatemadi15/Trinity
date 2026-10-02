// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkyLabels } from '@/lib/sky/standRenderer';
import { createExploreStore } from '@/lib/store/explore';
import { liveSentence, skyLabel } from '@/lib/viz/stand';
import { fileLoaders } from '@/test/file-loaders';
import { StandView } from './StandView';
import type { RendererLike } from './StandCanvas';

vi.mock('@/lib/data/sky', () => ({
  loadSkyAssets: async () => ({
    stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() },
    moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) },
    earthDayUrl: '',
    earthCloudsUrl: '',
  }),
}));

const everywhere: SkyLabels = {
  sun: { x: 0.5, y: 0.4, visible: true },
  earth: { x: 0.7, y: 0.4, visible: true },
  compass: (['N', 'E', 'S', 'W'] as const).map((letter, k) => ({ letter, x: 0.2 * (k + 1), y: 0.6, visible: true })),
};
const stub = () => ({ setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels: () => everywhere, dispose: vi.fn() }) satisfies RendererLike;

async function open(search: string, createRenderer: () => RendererLike = stub) {
  window.history.replaceState(null, '', `/explore/stand${search}`);
  const store = createExploreStore(fileLoaders());
  const view = render(<StandView store={store} createRenderer={() => createRenderer()} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at/), { timeout: 20_000 });
  return { store, view };
}

afterEach(() => cleanup());

describe('StandView', () => {
  it('opens on the site, period and hour of the address, with the answer, the live sentence, the lander and the time bar', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    expect(store.getState().cursorHour).toBe(10);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at de Gerlache Rim 2 on 1 January/);
    expect(screen.getByText(/^Standing at de Gerlache Rim 2, 88\.3° S/)).toBeTruthy();
    expect(screen.getByText(liveSentence(store.getState().series!, 10))).toBeTruthy();
    expect(screen.getByText('The lander has power.')).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Explore' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    for (const name of ['Face the Sun', 'Face Earth', 'Look up']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.getAllByText(/The small craters underfoot are drawn, not measured\./).length).toBeGreaterThan(0);
    for (const letter of ['N', 'E', 'S', 'W']) expect(screen.getByText(letter)).toBeTruthy();
    expect(document.querySelector('.theme-dark')).toBeTruthy();
  });

  it('labels the Sun and Earth as Explore does, and follows the time', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const series = store.getState().series!;
    expect(screen.getByText(skyLabel('sun', series, 10))).toBeTruthy();
    expect(screen.getByText(skyLabel('earth', series, 10))).toBeTruthy();
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(screen.getByText(liveSentence(series, 300))).toBeTruthy());
    expect(screen.getByText(skyLabel('sun', series, 300))).toBeTruthy();
  });

  it('clamps an hour beyond the period to its last hour', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=14&hour=99999');
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });

  it('opens a site without polar terrain on flat ground, and says so', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at Blue Ghost/);
    expect(screen.getAllByText(/the ground here is drawn flat/).length).toBeGreaterThan(0);
  });

  it('falls back to the view all round, with the same words, when the renderer cannot start', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      throw new Error('WebGL 2 is not available');
    });
    await waitFor(() => expect(screen.getByText(/This browser cannot draw the view from the site/)).toBeTruthy());
    expect(screen.getByRole('img', { name: /^The view all round the site/ })).toBeTruthy();
    expect(screen.getByText(liveSentence(store.getState().series!, 10))).toBeTruthy();
  });

  it('keeps one renderer while the time moves', async () => {
    let made = 0;
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      made++;
      return stub();
    });
    await waitFor(() => expect(made).toBe(1));
    act(() => store.getState().setCursor(40));
    act(() => store.getState().setCursor(41));
    await waitFor(() => expect(screen.getByText(liveSentence(store.getState().series!, 41))).toBeTruthy());
    expect(made).toBe(1);
  });

  it('lets the renderer go when the view closes', async () => {
    const r = stub();
    const { view } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setTime).toHaveBeenCalled());
    view.unmount();
    expect(r.dispose).toHaveBeenCalled();
  });
});
