// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkyLabels } from '@/lib/sky/standRenderer';
import { createExploreStore } from '@/lib/store/explore';
import { compassWord } from '@/lib/viz/ground';
import { landerState, liveSentence, skyLabel, watchNext } from '@/lib/viz/stand';
import { fileLoaders } from '@/test/file-loaders';
import { StandView } from './StandView';
import type { RendererLike } from './StandCanvas';

// jsdom has no PointerEvent; this one carries the pointer's id on top of the mouse event's position.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

vi.mock('@/lib/data/sky', () => ({
  loadSkyAssets: async () => ({
    stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() },
    moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) },
    earthDayUrl: '',
    earthCloudsUrl: '',
    names: [{ index: 0, name: 'Sirius' }],
  }),
}));

const everywhere: SkyLabels = {
  sun: { x: 0.5, y: 0.4, visible: true },
  earth: { x: 0.7, y: 0.4, visible: true },
  stars: [{ name: 'Sirius', x: 0.3, y: 0.2, visible: true }],
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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at de\sGerlache\sRim\s2 on 1 January/);
    expect(screen.getByText(/^Standing on the Moon at de Gerlache Rim 2, 88\.3° S\./)).toBeTruthy();
    expect(screen.getByText(/^Near the Moon's south pole the Sun never climbs high/)).toBeTruthy();
    expect(screen.getByText(liveSentence(store.getState().series!, 10, true))).toBeTruthy();
    expect(screen.getByText('The lander has power.')).toBeTruthy();
    // What to watch next, and the site's name kept on one line in the headline.
    expect(screen.getByText(watchNext(store.getState().series!, store.getState().power, '2027-01-01T00:00:00', 10))).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('de\u00a0Gerlache\u00a0Rim\u00a02');
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    // No chart above it here: the time bar carries the dates and the hours the lander is off.
    expect(screen.getByTestId('dates').querySelectorAll('[data-date]').length).toBeGreaterThan(3);
    expect(screen.getByText('lander off')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the forecast' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    for (const name of ['Face the Sun', 'Face Earth', 'Look up']) expect(screen.getByRole('button', { name })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/small craters underfoot are drawn, not measured\./).length).toBeGreaterThan(0));
    expect(screen.getAllByText('How we know this').length).toBeGreaterThan(0);
    // Which way the view faces, and the bright stars by name.
    expect(screen.getByText(`Facing ${compassWord(store.getState().series!.sunAz[10])}`)).toBeTruthy();
    expect(screen.getByText('Sirius')).toBeTruthy();
    // The compass strip names the eight points along the horizon.
    await waitFor(() => expect(screen.getAllByText('N').length).toBeGreaterThan(0));
    for (const point of ['NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) expect(screen.getAllByText(point).length).toBeGreaterThan(0);
    expect(document.querySelector('.theme-dark')).toBeTruthy();
  });

  it('labels the Sun and Earth as Explore does, and follows the time', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const series = store.getState().series!;
    await waitFor(() => expect(screen.getByText(skyLabel('sun', series, 10))).toBeTruthy());
    expect(screen.getByText(skyLabel('earth', series, 10))).toBeTruthy();
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(screen.getByText(liveSentence(series, 300, store.getState().power!.powered[300] === 1))).toBeTruthy());
    expect(screen.getByText(skyLabel('sun', series, 300))).toBeTruthy();
  });

  it('clamps an hour beyond the period to its last hour', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=14&hour=99999');
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });

  it('opens a site without polar terrain on flat ground, and says so', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at Blue\sGhost/);
    await waitFor(() => expect(screen.getAllByText(/the ground here is drawn flat/).length).toBeGreaterThan(0));
  });

  it('falls back to the view all round, with the same words, when the renderer cannot start', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      throw new Error('WebGL 2 is not available');
    });
    await waitFor(() => expect(screen.getByText(/This browser cannot draw the view from the site/)).toBeTruthy());
    expect(screen.getByRole('img', { name: /^The view all round the site/ })).toBeTruthy();
    // The note describes the view from the site, which the fallback does not show.
    expect(screen.queryByText(/How we know this/)).toBeNull();
    expect(screen.getByText(liveSentence(store.getState().series!, 10, true))).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText(liveSentence(store.getState().series!, 41, true))).toBeTruthy());
    expect(made).toBe(1);
  });

  it('zooms with two fingers: spreading them narrows the view', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const canvas = screen.getByRole('application');
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 300, clientY: 100 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    // The fingers moved twice as far apart: the view is half as wide (60° to 30°).
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![2]).toBeCloseTo(30, 0));
  });

  it('does not promise radio contact while the lander is off', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219');
    const st = store.getState();
    expect(landerState(st.power, st.startUtc, 219).on).toBe(false);
    expect(st.series!.earthVisible[219]).toBe(1);
    expect(screen.getByText(/but the lander has no power for its radio\.$/)).toBeTruthy();
  });

  it('hides the words for a clear view, and brings them back', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(screen.getByRole('button', { name: 'Hide the words' }));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Face the Sun' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('turns to the lander, which stands 40° to the right of the Sun the view opens on, in the first view', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    const want = (store.getState().series!.sunAz[10] + 40) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
    // It settles there, not just passes through on the way somewhere else.
    await new Promise((done) => setTimeout(done, 700));
    expect(near()).toBe(true);
  });

  it('turns "Look up" into "Look ahead", the way back to the horizon', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.queryByRole('button', { name: 'Look up' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Look ahead' }));
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
  });

  it('lets the renderer go when the view closes', async () => {
    const r = stub();
    const { view } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setTime).toHaveBeenCalled());
    view.unmount();
    expect(r.dispose).toHaveBeenCalled();
  });
});
