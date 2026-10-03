// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SkyLabels } from '@/lib/sky/standRenderer';
import { createExploreStore } from '@/lib/store/explore';
import { compassWord } from '@/lib/viz/ground';
import { keyMoments, landerState, momentCaption, skyLabel, starLabel, statusLine, viewCaption, watchNext } from '@/lib/viz/stand';
import { fileLoaders, terrainFileLoaders, terrainPresent } from '@/test/file-loaders';
import type { StandScene } from '@/lib/sky/standRenderer';
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
  shadow: { x: 0.5, y: 0.8, visible: true, lengthM: 51.5, levelM: 51.5 },
};
const stub = () => ({ setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels: () => everywhere, dispose: vi.fn() }) satisfies RendererLike;

async function open(search: string, createRenderer: () => RendererLike = stub) {
  window.history.replaceState(null, '', `/explore/stand${search}`);
  const store = createExploreStore(fileLoaders());
  const view = render(<StandView store={store} createRenderer={() => createRenderer()} />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on /), { timeout: 20_000 });
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
    // Both verdicts the challenge asks for, power and radio, and a night whose length adds up to the day the
    // power comes back.
    // Each span on one line (no-break spaces), and the stretch without power named as such, so it adds up with the flags.
    expect(h1).toBe('Landing on 1 January: power for 3\u00a0days\u00a04\u00a0hours, no radio contact, then 16\u00a0days without power');
    // Where you stand, and what is measured and what is added: "Hills: NASA height data." (or, without NASA
    // heights, "Ground drawn flat: no NASA heights here.") and "Small craters and rocks: added to look real."
    expect(screen.getByText(/^Standing at de\sGerlache\sRim\s2, near the Moon's south pole\. (Hills: NASA height data|Ground drawn flat: no NASA heights here)\. Small craters and rocks: added to look real\.$/)).toBeTruthy();
    // The site's name stays on one line: no break inside "de Gerlache Rim 2".
    expect(document.body.textContent).toContain('de\u00a0Gerlache\u00a0Rim\u00a02');
    // One line joins the lander's power and its radio; then what to watch next.
    expect(screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text)).toBeTruthy();
    const status = screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text);
    expect(status.textContent).toMatch(/^The lander has power, but Earth is (below the horizon|behind the hills), so it cannot radio home\.$/);
    // Its dot is amber, power without radio: green is kept for radio contact, as on the time bar.
    expect(status.parentElement!.querySelector('[data-tone]')!.getAttribute('data-tone')).toBe('power');
    expect(screen.getByText(watchNext(st.series!, st.power, '2027-01-01T00:00:00', 10))).toBeTruthy();
    // The better landing day, one click away, and the way back.
    // It says why, as a comparison: days of power and of radio from that landing.
    const better = screen.getByRole('link', { name: /^Try 20 January instead: power for \d+ days?, (radio for \d+ days?|no radio contact)$/ });
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
    // The key names only what the bar draws: here no radio contact while the lander has power, only the
    // contact after the night, if it survives it.
    expect(screen.queryByText('radio contact')).toBeNull();
    expect(screen.getByText('radio, if it survives the night')).toBeTruthy();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up', 'Hide the words']) expect(screen.getByRole('button', { name })).toBeTruthy();
    // The key moments are flags on the time bar, not a panel of their own.
    expect(screen.queryByRole('group', { name: 'Key moments' })).toBeNull();
    for (const m of keyMoments(st.series!, st.power, st.startUtc)) expect(screen.getByRole('button', { name: `${m.label}, ${m.day}` })).toBeTruthy();
    // Which way the view faces, and the bright stars by name.
    // On the compass strip, and in the phone's small note.
    // The view opens 35 degrees left of the Sun, the Sun near its right edge.
    expect(screen.getAllByText(`Facing ${compassWord((st.series!.sunAz[10] - 35 + 360) % 360)}`).length).toBe(2);
    expect(screen.getByText(starLabel('Sirius'))).toBeTruthy();
    // The compass strip names the eight points along the horizon.
    await waitFor(() => expect(screen.getAllByText('N').length).toBeGreaterThan(0));
    for (const point of ['NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) expect(screen.getAllByText(point).length).toBeGreaterThan(0);
    expect(document.querySelector('.theme-dark')).toBeTruthy();
  });

  it('gives the reasons one at a time under "Why this happens", the radio story first and how we know last, then folds them away', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const why = screen.getByRole('button', { name: /^Why this happens/ });
    expect(why.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(why);
    // The same button, still named for what it holds, now open: nothing beside it moves.
    expect(screen.getByRole('button', { name: /^Why this happens/ }).getAttribute('aria-expanded')).toBe('true');
    // The radio story first, without repeating the headline: when power and Earth first meet. One reason at a
    // time, so the card never scrolls inside itself.
    expect(screen.getByText('The first day the lander has both power and a view of Earth is 20 January.')).toBeTruthy();
    expect(screen.queryByText(/^Earth hangs almost still in the Moon's sky/)).toBeNull();
    const count = screen.getByText(/^1 of \d+$/);
    const n = Number(count.textContent!.split(' of ')[1]);
    expect((screen.getByRole('button', { name: 'Previous reason' }) as HTMLButtonElement).disabled).toBe(true);
    const seen: string[] = [];
    for (let k = 1; k < n; k++) {
      fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
      expect(screen.getByText(`${k + 1} of ${n}`)).toBeTruthy();
      seen.push(document.querySelector('[data-reason]')!.textContent!);
    }
    expect((screen.getByRole('button', { name: 'Next reason' }) as HTMLButtonElement).disabled).toBe(true);
    const all = seen.join(' | ');
    expect(all).toMatch(/88\.3° S\./);
    expect(all).toMatch(/Near the Moon's south pole the Sun circles the sky once a month/);
    expect(all).toMatch(/Earth hangs almost still in the Moon's sky/);
    expect(all).toMatch(/With no air to scatter sunlight, the sky stays black by day/);
    // How we know comes last, open on its page.
    expect(seen.at(-1)).toMatch(/^How we know this/);
    await waitFor(() => expect(screen.getAllByText(/small craters underfoot are drawn, not measured\./).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Previous reason' }));
    expect(screen.getByText(`${n - 1} of ${n}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    expect(screen.queryByRole('button', { name: 'Next reason' })).toBeNull();
    // Opened again, it starts from the first reason.
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    expect(screen.getByText(`1 of ${n}`)).toBeTruthy();
  });

  it('keeps the links where they are when the reasons open: the better day on its own row, the why and the way back on the next', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const better = await screen.findByRole('link', { name: /^Try 20 January instead/ });
    expect(better.parentElement!.querySelectorAll('a, button').length).toBe(1);
    const why = screen.getByRole('button', { name: /^Why this happens/ });
    const back = screen.getByRole('link', { name: 'Back to the forecast' });
    const row = why.parentElement!;
    expect(back.parentElement).toBe(row);
    fireEvent.click(why);
    const after = screen.getByRole('button', { name: /^Why this happens/ });
    expect(after.parentElement).toBe(row);
    expect([...row.children].indexOf(after)).toBeLessThan([...row.children].indexOf(screen.getByRole('link', { name: 'Back to the forecast' })));
  });

  it('labels the Sun and Earth as Explore does, and follows the time', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const series = store.getState().series!;
    // The labels on the sky (the compass's end chips may say the same).
    const sky = (body: 'sun' | 'earth') => document.querySelector(`[data-sky="${body}"]`)?.textContent;
    await waitFor(() => expect(sky('sun')).toBe(skyLabel('sun', series, 10)));
    expect(sky('earth')).toBe(skyLabel('earth', series, 10));
    act(() => store.getState().setCursor(300));
    await waitFor(() => expect(screen.getByText(statusLine(series, store.getState().power, store.getState().startUtc, 300).text)).toBeTruthy());
    expect(sky('sun')).toBe(skyLabel('sun', series, 300));
  });

  it('clamps an hour beyond the period to its last hour', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=14&hour=99999');
    expect(store.getState().cursorHour).toBe(14 * 24 - 1);
  });

  it('opens a site without polar terrain on flat ground, and says so', async () => {
    await open('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Landing on 2 March: power for all 14\u00a0days, radio all the while');
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    // How we know comes last among the reasons.
    while (!(screen.getByRole('button', { name: 'Next reason' }) as HTMLButtonElement).disabled) fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
    await waitFor(() => expect(screen.getAllByText(/the ground here is drawn flat/).length).toBeGreaterThan(0));
  });

  // With the terrain files the browser loads (the south cap for every site): a site far from the pole must not
  // stand on a crop of the cap's edge.
  async function openWithTerrain(search: string) {
    let scene: StandScene | null = null;
    window.history.replaceState(null, '', `/explore/stand${search}`);
    const store = createExploreStore(terrainFileLoaders());
    render(
      <StandView
        store={store}
        createRenderer={(_canvas, sc) => {
          scene = sc;
          return stub();
        }}
      />,
    );
    await waitFor(() => expect(scene).not.toBeNull(), { timeout: 30_000 });
    return { store, scene: scene! as StandScene };
  }

  it.skipIf(!terrainPresent)('opens a site far from the pole on flat ground, with the polar terrain loaded too, and says so', async () => {
    const { scene } = await openWithTerrain('?site=blue_ghost_m1&start=2025-03-02T09:00&days=14&hour=0');
    expect(scene.field.levels.length).toBe(0);
    expect(screen.getByText(/Ground drawn flat: no NASA heights here\./)).toBeTruthy();
  }, 40_000);

  it.skipIf(!terrainPresent)('stands a polar site on its NASA heights, the window finest', async () => {
    const { scene } = await openWithTerrain('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0');
    expect(scene.field.levels.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...scene.field.levels.map((l) => l.cell))).toBe(20);
    expect(screen.getByText(/Hills: NASA height data\./)).toBeTruthy();
  }, 40_000);

  it('falls back to the horizon chart, with the same words, when the renderer cannot start', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => {
      throw new Error('WebGL 2 is not available');
    });
    await waitFor(() => expect(screen.getByText(/This browser cannot draw the view from the site/)).toBeTruthy());
    expect(screen.getByRole('img', { name: /^The view all round the site/ })).toBeTruthy();
    // The note describes the view from the site, which the fallback does not show.
    fireEvent.click(screen.getByRole('button', { name: /^Why this happens/ }));
    while (!(screen.getByRole('button', { name: 'Next reason' }) as HTMLButtonElement).disabled) fireEvent.click(screen.getByRole('button', { name: 'Next reason' }));
    expect(screen.queryByText(/How we know this/)).toBeNull();
    const st = store.getState();
    expect(screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text)).toBeTruthy();
  });

  it('falls back to the horizon chart when the view’s shaders fail to build, a shader fails while drawing, or the graphics context is lost', async () => {
    const fallback = /This browser cannot draw the view from the site/;
    // The shaders fail to build: the renderer's ready promise rejects.
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => ({ ...stub(), ready: new Promise<void>((_, no) => setTimeout(() => no(new Error('A shader did not compile')), 10)) }));
    await waitFor(() => expect(screen.getByText(fallback)).toBeTruthy());
    cleanup();
    // A shader fails on its first use, after the view was ready: the renderer says so through onLost.
    const r: RendererLike = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.onLost).toBeTypeOf('function'));
    act(() => r.onLost!('A shader of the view did not compile'));
    await waitFor(() => expect(screen.getByText(fallback)).toBeTruthy());
    cleanup();
    // The graphics context is lost (a driver reset): nothing would ever draw again.
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const canvas = await waitFor(() => {
      const c = document.querySelector('canvas');
      expect(c).not.toBeNull();
      return c!;
    });
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });
    await waitFor(() => expect(screen.getByText(fallback)).toBeTruthy());
    // The words stay, as with any fallback.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on 1 January/);
  });

  it('lands on the better day in place, keeping the lander the visitor set and the drawing quality, and the address follows', async () => {
    window.history.replaceState(null, '', '/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10&quality=fast');
    const store = createExploreStore(fileLoaders());
    render(<StandView store={store} createRenderer={() => stub()} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Landing on 1 January/), { timeout: 20_000 });
    // A lander of the visitor's own: a bigger battery than the default.
    act(() => store.getState().setPower({ batteryWh: store.getState().params.power.batteryWh * 3 }));
    const battery = store.getState().params.power.batteryWh;
    const better = await screen.findByRole('link', { name: /^Try \d+ January instead/ });
    const start = new URL(better.getAttribute('href')!, 'http://x').searchParams.get('start')!;
    fireEvent.click(better);
    // The same page, the new period: the lander is the visitor's still, and the view opens again from its first hour.
    await waitFor(() => expect(store.getState().startUtc.slice(0, 10)).toBe(start.slice(0, 10)));
    expect(store.getState().params.power.batteryWh).toBe(battery);
    expect(store.getState().cursorHour).toBe(0);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/^Landing on 1 January/);
    const q = new URLSearchParams(window.location.search);
    expect(q.get('start')!.slice(0, 10)).toBe(start.slice(0, 10));
    expect(q.get('hour')).toBe('0');
    expect(q.get('quality')).toBe('fast');
  });

  it('turns the view at once, with no camera flight, when the visitor asks for reduced motion', async () => {
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    try {
      const r = stub();
      const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
      await waitFor(() => expect(r.setView).toHaveBeenCalled());
      const before = r.setView.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
      await waitFor(() => expect(r.setView.mock.calls.length).toBeGreaterThan(before));
      // The first frame after the press already faces the lander: no frames on the way.
      const want = (store.getState().series!.sunAz[0] - 40 + 360) % 360;
      expect(Math.abs(((r.setView.mock.calls[before][0] - want + 540) % 360) - 180)).toBeLessThan(0.01);
    } finally {
      window.matchMedia = was;
    }
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

  it('hides the words, the buttons, the labels and the compass for a clean view, keeping a bare time bar with the moments as dots, and brings them back', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByText(starLabel('Sirius')).hidden).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Hide the words' }));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    for (const name of ['Face the Sun', 'Face Earth', 'Face the lander', 'Look up']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Time' })).toBeTruthy();
    // Nothing over the picture but the bare time bar: no labels, no compass, no key, and the key moments
    // only as dots, their words kept for screen readers, so a class can still be taken from one to the next.
    await waitFor(() => expect(screen.getByText(starLabel('Sirius')).hidden).toBe(true));
    for (const el of screen.getAllByText(/^Facing /)) expect(el.closest('[hidden]')).not.toBeNull();
    expect(screen.queryByText('lander off')).toBeNull();
    const dots = within(screen.getByRole('group', { name: 'Jump to a moment' })).getAllByRole('button');
    expect(dots.length).toBeGreaterThan(0);
    for (const b of dots) expect(b.querySelector('span')!.classList.contains('sr-only')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show the words' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Face Earth' })).toBeTruthy();
  });

  it('turns to the lander, which stands 40° to the left of the Sun at the landing (on a wide screen)', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    const want = (store.getState().series!.sunAz[0] - 40 + 360) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
    // It settles there, not just passes through on the way somewhere else.
    await new Promise((done) => setTimeout(done, 700));
    expect(near()).toBe(true);
    // Zoomed in on it, the compass says so, and its parts carry their names.
    expect(screen.getAllByText(/^Facing [a-z-]+, zoomed in$/).length).toBe(2);
    for (const part of ['Solar panel', 'Radio dish', 'Power light: on']) expect(screen.getByText(part).hidden).toBe(false);
  });

  it('keeps the lander where it landed, whatever hour the view opens on', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219', () => r);
    const st = store.getState();
    expect(st.series!.sunFraction[219]).toBe(0);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    // 30 degrees right of the Sun at the landing, hour 0, as when the view opens on that hour.
    const want = (st.series!.sunAz[0] - 40 + 360) % 360;
    const near = () => Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180) < 1;
    await waitFor(() => expect(near()).toBe(true), { timeout: 4000 });
  });

  it('looks up at the sky clear of the ground, says why the stars show there and not in Apollo\u2019s photographs, and turns "Look up" into "Look ahead"', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.queryByRole('button', { name: 'Look up' })).toBeNull();
    // 50° up with 62° from top to bottom: the bottom edge 19° up, above the hills and any slope beside you.
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![2]).toBeCloseTo(62, 0), { timeout: 4000 });
    await waitFor(() => expect(r.setView.mock.calls.at(-1)![1]).toBeCloseTo(50, 0), { timeout: 4000 });
    expect(r.setView.mock.calls.at(-1)![1] - r.setView.mock.calls.at(-1)![2] / 2).toBeGreaterThan(15);
    expect(screen.getByText(viewCaption('up', 88.28))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Look ahead' }));
    expect(screen.getByRole('button', { name: 'Look up' })).toBeTruthy();
    expect(screen.queryByText(viewCaption('up', 88.28))).toBeNull();
  });

  it("jumps to a key moment from its flag on the time bar, turns to what it is about and says why", async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const st0 = store.getState();
    const m = keyMoments(st0.series!, st0.power, st0.startUtc).find((x) => x.kind === 'battery-out')!;
    fireEvent.click(screen.getByRole('button', { name: `${m.label}, ${m.day}` }));
    const st = store.getState();
    expect(st.power!.powered[st.cursorHour]).toBe(0);
    expect(st.power!.powered[st.cursorHour - 1]).toBe(1);
    // The battery runs out: the view turns to the lander, and a line over the view says why.
    const want = (st.series!.sunAz[0] - 40 + 360) % 360;
    await waitFor(() => expect(Math.abs(((r.setView.mock.calls.at(-1)![0] - want + 540) % 360) - 180)).toBeLessThan(1), { timeout: 4000 });
    expect(screen.getByText(momentCaption(m.kind, st.series!, m.hour, -88.28))).toBeTruthy();
  });

  it('names the lander where it stands, with its distance', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByText('The lander, 16 m away')).toBeTruthy());
  });

  it('says why the lander’s solar panel stands upright when the view turns to it', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Face the lander' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    expect(screen.getByText((t) => t.startsWith(viewCaption('lander', -88.28)))).toBeTruthy();
  });

  it('folds a phone\u2019s card to the headline, so the view keeps most of the screen, with More for the rest', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const st = store.getState();
    const better = await screen.findByRole('link', { name: /^Try 20 January instead/ });
    // Hidden on a phone until More: the site's line (what is measured and what is added, as on a wide screen),
    // the lander's line, what to watch, the better day and the links.
    const folded = () => [
      screen.getByText(/^Standing at de\sGerlache\sRim\s2, near the Moon's south pole\. /),
      screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text).closest('p')!,
      screen.getByText(watchNext(st.series!, st.power, st.startUtc, 10)),
      better.parentElement!,
      screen.getByRole('link', { name: 'Back to the forecast' }).parentElement!,
    ];
    for (const el of folded()) expect(el.className).toMatch(/\bmax-md:hidden\b/);
    // The headline stays.
    expect(screen.getByRole('heading', { level: 1 }).className).not.toMatch(/\bmax-md:hidden\b/);
    const more = screen.getByRole('button', { name: 'More' });
    expect(more.className).toMatch(/\bmd:hidden\b/);
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    for (const el of folded()) expect(el.className).not.toMatch(/\bmax-md:hidden\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Less' }));
    for (const el of folded()) expect(el.className).toMatch(/\bmax-md:hidden\b/);
  });

  it('keeps one card whatever the view does: the top line, the headline\u2019s size and the prompts stay when the view turns', async () => {
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    const st = store.getState();
    const watch = watchNext(st.series!, st.power, st.startUtc, 10);
    await waitFor(() => expect(screen.getByText(watch)).toBeTruthy());
    const size = screen.getByRole('heading', { level: 1 }).className;
    expect(screen.getByText(/^Standing at de\sGerlache/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Face the Sun' }));
    expect(screen.getByText(/^Standing at de\sGerlache/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).className).toBe(size);
    expect(screen.getByText(watch)).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Try 20 January instead/ })).toBeTruthy();
    expect(screen.getByText(statusLine(st.series!, st.power, st.startUtc, 10).text)).toBeTruthy();
  });

  it('opens a tall screen with the lander near the middle and the Sun towards the right edge', async () => {
    const was = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    try {
      const r = stub();
      const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0', () => r);
      await waitFor(() => expect(r.setView).toHaveBeenCalled());
      const sunAz = store.getState().series!.sunAz[0];
      const rel = (az: number) => ((((sunAz - az + 540) % 360) + 360) % 360) - 180;
      // The view 15 degrees left of the Sun; the lander 20 degrees left of it, 5 degrees left of the middle.
      expect(rel(r.setView.mock.calls[0][0])).toBeCloseTo(15, 0);
      fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
      await waitFor(() => expect(rel(r.setView.mock.calls.at(-1)![0])).toBeCloseTo(20, 0), { timeout: 4000 });
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
    }
  });

  it('opens a night with Earth up on Earth, narrower, so it shows large', async () => {
    const r = stub();
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=219', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    expect(r.setView.mock.calls[0][2]).toBe(36);
  });

  it('says, facing the lander, that it is the back of its panel the view sees', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Face the lander' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Face the lander' }));
    expect(screen.getByText(/From here you see its back: its cells face the Sun\.$/)).toBeTruthy();
  });

  it('marks the radio contact after the night as only if the lander survives it, and says the clock is Earth’s', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // The battery runs out on 4 January; the contact from 20 January needs the lander to live through the night.
    await waitFor(() => expect(screen.getByText('radio, if it survives the night')).toBeTruthy());
    expect(screen.getByText(/\(Earth time\)/)).toBeTruthy();
  });

  it('names your own shadow and its length while the Sun is up', async () => {
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
    // With the height it is worked out for, so a reader can check the Sun's height from it.
    await waitFor(() => expect(screen.getByText('Your shadow, about 52 m long (you are 1.8 m tall)').hidden).toBe(false));
  });

  it('keeps "Building the ground" up until the renderer has its shaders ready, then shows the view', async () => {
    let finish = () => {};
    const ready = new Promise<void>((done) => (finish = done));
    const r = { ...stub(), ready };
    await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.resize).toHaveBeenCalled());
    expect(screen.getByText('Building the ground from NASA heights…')).toBeTruthy();
    // No label floats over the empty view while it builds.
    await new Promise((done) => setTimeout(done, 100));
    expect(screen.getByText(starLabel('Sirius')).hidden).toBe(true);
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByText('Building the ground from NASA heights…')).toBeNull());
    await waitFor(() => expect(screen.getByText(starLabel('Sirius')).hidden).toBe(false));
  });

  it('lets the renderer go when the view closes', async () => {
    const r = stub();
    const { view } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10', () => r);
    await waitFor(() => expect(r.setTime).toHaveBeenCalled());
    view.unmount();
    expect(r.dispose).toHaveBeenCalled();
  });

  it('opens with the Sun near the right of a wide view, not straight ahead, so the ground before it is lit from the side', async () => {
    const r = stub();
    const { store } = await open('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=0', () => r);
    await waitFor(() => expect(r.setView).toHaveBeenCalled());
    const sunAz = store.getState().series!.sunAz[0];
    const rel = ((((sunAz - r.setView.mock.calls[0][0] + 540) % 360) + 360) % 360) - 180;
    expect(rel).toBeCloseTo(35, 0);
  });
});
