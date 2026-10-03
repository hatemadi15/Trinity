// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkyLabels } from '@/lib/sky/standRenderer';
import { createExploreStore } from '@/lib/store/explore';
import { compassWord } from '@/lib/viz/ground';
import { keyMoments, landerState, momentCaption, skyLabel, statusLine, watchNext } from '@/lib/viz/stand';
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
  lander: { x: 0.8, y: 0.6, visible: true },
  parts: { panel: { x: 0.8, y: 0.5, visible: true }, dish: { x: 0.82, y: 0.48, visible: true }, lamp: { x: 0.78, y: 0.58, visible: true } },
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
  it('opens on the site, period and hour of the address, with a short answer over the view: the headline, one line on the lander, what to watch', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const st = store.getState();
    expect(st.cursorHour).toBe(10);
    // The headline says how long the night lasts, and keeps the site's name on one line.
    const h1 = screen.getByRole('heading', { level: 1 }).textContent!;
    expect(h1).toMatch(/^Landing at de\sGerlache\sRim\s2 on 1 January: power for 3 days 4 hours, then night until 20 January$/);
    expect(h1).toContain('de\u00a0Gerlache\u00a0Rim\u00a02');
    expect(screen.getByText('Standing on the Moon, near its south pole. Drawn from NASA data.')).toBeTruthy();
    // One line joins the lander's power and its radio; then what to watch next.
    expect(screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text)).toBeTruthy();
    const status = screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text);
    expect(status.textContent).toMatch(/^The lander has power, but Earth is (below the horizon|behind the hills), so it cannot radio home\.$/);
    // Its dot is amber, power without radio: green is kept for radio contact, as on the time bar.
    expect(status.parentElement!.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('power');
    expect(screen.getByText(watchNext(st.series!, st.power, '2027-01-01T00:00:00', 10))).toBeTruthy();
    // The better landing day, one click away, and the way back.
    // It says why: on that day the lander has both power and Earth.
    const better = screen.getByRole('link', { name: 'Land on 20 January instead: power and radio together' });
    expect(better.getAttribute('href')).toMatch(/^\/explore\/stand\?site=de_gerlache_rim_2&start=2027-01-20/);
    expect(screen.getByRole('link', { name: 'Back to the forecast' }).getAttribute('href')).toBe('/explore?site=de_gerlache_rim_2&start=2027-01-01&days=30');
    // The rest waits under "More": the radio story, the whys and how we know.
    expect(screen.queryByText(/^Near the Moon's south pole the Sun never climbs high/)).toBeNull();
    expect(screen.queryByText(/^No radio contact:/)).toBeNull();
    expect(screen.queryByText('How we know this')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    // No chart above it here: the time bar carries the dates, the hours the lander is off, and those it can radio home.
    expect(screen.getByTestId('dates').querySelectorAll('[data-date]').length).toBeGreaterThan(3);
    expect(screen.getByText('lander off')).toBeTruthy();
    expect(screen.getByText('radio contact')).toBeTruthy();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up', 'Hide the words']) expect(screen.getByRole('button', { name })).toBeTruthy();
    // The key moments are flags on the time bar, not a panel of their own.
    expect(screen.queryByRole('group', { name: 'Key moments' })).toBeNull();
    for (const m of keyMoments(st.series!, st.power, st.startUtc)) expect(screen.getByRole('button', { name: `${m.label}, ${m.day}` })).toBeTruthy();
    // Which way the view faces, and the bright stars by name.
    // On the compass strip, and in the phone's small note.
    expect(screen.getAllByText(`Facing ${compassWord(st.series!.sunAz[10])}`).length).toBe(2);
    expect(screen.getByText('Sirius')).toBeTruthy();
    // The compass strip names the eight points along the horizon.
    await waitFor(() => expect(screen.getAllByText('N').length).toBeGreaterThan(0));
    for (const point of ['NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) expect(screen.getAllByText(point).length).toBeGreaterThan(0);
    expect(document.querySelector('.theme-dark')).toBeTruthy();
  });

  it('opens "More" on the radio story, why the sky looks as it does, and how we know, then folds it away', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/^Standing on the Moon at de Gerlache Rim 2, 88\.3° S\./)).toBeTruthy();
    expect(screen.getByText('No radio contact: Earth is out of view for all 3 days 4 hours with power. The first day the lander has both power and a view of Earth is 20 January.')).toBeTruthy();
    expect(screen.getByText(/^Near the Moon's south pole the Sun circles the sky once a month/)).toBeTruthy();
    expect(screen.getByText(/^Earth hangs almost still in the Moon's sky/)).toBeTruthy();
    expect(screen.getByText(/^With no air to scatter sunlight, the sky stays black by day/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/small craters underfoot are drawn, not measured\./).length).toBeGreaterThan(0));
    expect(screen.getByText('How we know this')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Less' }));
    expect(screen.queryByText(/^Earth hangs almost still/)).toBeNull();
  });

  it('labels the Sun and Earth as Explore does, and follows the time', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const series = store.getState().series!;
    await waitFor(() => expect(screen.getByText(skyLabel('sun', series, 10))).toBeTruthy());
    expect(screen.getByText(skyLabel('earth', series, 10))).toBeTruthy();
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(screen.getByText(statusLine(series, store.getState().power, store.getState().startUtc, 300).text)).toBeTruthy());
    expect(screen.getByText(skyLabel('sun', series, 300))).toBeTruthy();
  });

  it('clamps an hour beyond the period to its last hour', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=14&hour=99999');
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });

  it('opens a site without polar terrain on flat ground, and says so', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing at Blue\sGhost/);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    await waitFor(() => expect(screen.getAllByText(/the ground here is drawn flat/).length).toBeGreaterThan(0));
  });

  it('falls back to the view all round, with the same words, when the renderer cannot start', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      throw new Error('WebGL 2 is not available');
    });
    await waitFor(() => expect(screen.getByText(/This browser cannot draw the view from the site/)).toBeTruthy());
    expect(screen.getByRole('img', { name: /^The view all round the site/ })).toBeTruthy();
    // The note describes the view from the site, which the fallback does not show.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByText(/How we know this/)).toBeNull();
    const st = store.getState();
    expect(screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text)).toBeTruthy();
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
    await waitFor(() => expect(screen.getByText(statusLine(store.getState().series!, store.getState().power, store.getState().startUtc, 41).text)).toBeTruthy());
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
    expect(screen.getByText(/^The lander is off: its battery ran out on 4 January\. Earth is in view, but the radio has no power\.$/)).toBeTruthy();
  });

  it('hides the words and the buttons for a clean view, keeping the time bar, and brings them back', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    fireEvent.click(screen.getByRole('button', { name: 'Hide the words' }));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Face Earth' })).toBeTruthy();
  });

  it('turns to the lander, which stands 30° to the right of the Sun at the landing', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    const want = (store.getState().series!.sunAz[0] + 30) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
    // It settles there, not just passes through on the way somewhere else.
    await new Promise((done) => setTimeout(done, 700));
    expect(near()).toBe(true);
    // Zoomed in on it, the compass says so, and its parts carry their names.
    expect(screen.getAllByText(/^Facing [a-z-]+, zoomed in$/).length).toBe(2);
    for (const part of ['Solar panel', 'Radio dish', 'Power light']) expect(screen.getByText(part).hidden).toBe(false);
  });

  it('keeps the lander where it landed, whatever hour the view opens on', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219', () => r);
    const st = store.getState();
    expect(st.series!.sunFraction[219]).toBe(0);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    // 30 degrees right of the Sun at the landing, hour 0, as when the view opens on that hour.
    const want = (st.series!.sunAz[0] + 30) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
  });

  it('looks up with the horizon kept at the bottom, says these are the stars seen from Earth, and turns "Look up" into "Look ahead"', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.queryByRole('button', { name: 'Look up' })).toBeNull();
    // A wide view (70° up and down) raised 32°: the horizon stays in sight at the bottom edge.
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![2]).toBeCloseTo(70, 0), { timeout: 4000 });
    expect(r.setView.mock.calls.at(-1)![1]).toBeCloseTo(32, 0);
    expect(r.setView.mock.calls.at(-1)![1] - r.setView.mock.calls.at(-1)![2] / 2).toBeLessThan(0);
    expect(screen.getByText(/^The same stars as seen from Earth/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Look ahead' }));
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
    expect(screen.queryByText(/^The same stars as seen from Earth/)).toBeNull();
  });

  it("jumps to a key moment from its flag on the time bar, turns to what it is about and says why", async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const st0 = store.getState();
    const m = keyMoments(st0.series!, st0.power, st0.startUtc).find((x) => x.label === 'Battery runs out')!;
    fireEvent.click(screen.getByRole('button', { name: `${m.label}, ${m.day}` }));
    const st = store.getState();
    expect(st.power!.powered[st.cursorHour]).toBe(0);
    expect(st.power!.powered[st.cursorHour - 1]).toBe(1);
    // The battery runs out: the view turns to the lander, and a line over the view says why.
    const want = (st.series!.sunAz[0] + 30) % 360;
    await waitFor(() => expect(Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180)).toBeLessThan(1), { timeout: 4000 });
    expect(screen.getByText(momentCaption(m.label, st.series!, m.hour, -88.28))).toBeTruthy();
  });

  it('names the lander where it stands, with its distance', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByText('The lander, 16 m away')).toBeTruthy());
  });

  it('keeps "Building the ground" up until the renderer has its shaders ready, then shows the view', async () => {
    let finish = () => {};
    const ready = new Promise<void>((done) => (finish = done));
    const r = { ...stub(), ready };
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.resize).toHaveBeenCalled());
    expect(screen.getByText('Building the ground from NASA heights…')).toBeTruthy();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByText('Building the ground from NASA heights…')).toBeNull());
  });

  it('lets the renderer go when the view closes', async () => {
    const r = stub();
    const { view } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setTime).toHaveBeenCalled());
    view.unmount();
    expect(r.dispose).toHaveBeenCalled();
  });
});
