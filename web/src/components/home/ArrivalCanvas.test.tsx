// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { siteLabel } from '@/lib/data/loaders';
import type { StandScene } from '@/lib/sky/standRenderer';
import { siteEndHour } from '@/lib/sky/arrivalPath';
import { HERO_HOUR, hero } from '@/lib/viz/arrival';
import { dateLong } from '@/lib/viz/format';
import { keyMoments, skyLabel } from '@/lib/viz/stand';
import ArrivalCanvas, { type ArrivalLoaders, type ArrivalRenderer } from './ArrivalCanvas';

const sky = { stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() }, moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) }, earthDayUrl: '', earthCloudsUrl: '' };
const globe = { color: { low: 'a', high: 'b' }, normal: { low: 'c', high: 'd' }, heights: { width: 4, height: 2, metres: new Float32Array(8) }, albedoScale: 1, credit: '' };
/** A level stand-in for the south cap, with the real cap's numbers: 1940 cells of 960 m, the pole in the middle. */
const cap = () => ({ meta: { width: 1940, height: 1940, cell_m: 960, site_col_px: 969.5, site_row_px: 969.5, site_height_m: 0, row0: 0, col0: 0, line_offset_px: 969.5, sample_offset_px: 969.5, min_m: 0, scale_m_per_unit: 1 }, heightsM: new Float32Array(1940 * 1940) });

function stub() {
  const scenes: StandScene[] = [];
  const r = {
    setTime: vi.fn(),
    setPose: vi.fn(),
    setScene: vi.fn((s: StandScene) => scenes.push(s)),
    setGuides: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    project: vi.fn(() => ({ x: 0.5, y: 0.5, visible: true })),
    labels: vi.fn(() => ({ sun: { x: 0.5, y: 0.5, visible: true } })),
    dispose: vi.fn(),
    ready: Promise.resolve(),
    resting: false,
    onSharp: undefined as (() => void) | undefined,
  };
  return { r: r as unknown as ArrivalRenderer & typeof r, scenes };
}

describe('the arrival’s live stage', () => {
  it('flies over the globe alone first, then hands the renderer the ground with the lander when it comes', async () => {
    const { r, scenes } = stub();
    let landTerrain!: (t: Awaited<ReturnType<ArrivalLoaders['terrain']>>) => void;
    const loaders: ArrivalLoaders = {
      sky: async () => sky,
      globe: async () => globe,
      terrain: () =>
        new Promise((res) => {
          landTerrain = res;
        }),
    };
    const first: StandScene[] = [];
    const onLive = vi.fn();
    render(
      <ArrivalCanvas
        progress={{ current: 0 }}
        reduced={false}
        onLive={onLive}
        onFail={vi.fn()}
        loaders={loaders}
        createRenderer={(_c, s) => {
          first.push(s);
          return r;
        }}
      />,
    );
    await waitFor(() => expect(first).toHaveLength(1));
    expect(first[0].ground).toBe(false);
    expect(first[0].globe).toBe(globe);
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    await waitFor(() => expect(onLive).toHaveBeenCalled());
    landTerrain({ cap: cap() as never, window: null, context: null });
    await waitFor(() => expect(scenes).toHaveLength(1));
    expect(scenes[0].ground).toBe(true);
    expect(scenes[0].lander?.distM).toBe(16);
  });

  it('builds a new pose when the view changes shape, at the same progress', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const { container } = render(<ArrivalCanvas progress={{ current: 2 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    const before = (r.setPose as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].fov;
    const canvas = container.querySelector('canvas')!;
    Object.defineProperty(canvas, 'clientWidth', { value: 390, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 844, configurable: true });
    await waitFor(() => expect((r.setPose as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0].fov).not.toBe(before));
  });

  it('shows the month’s paths only once standing: in flight their faint bands would cross the Moon', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 2 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(r.setGuides).toHaveBeenCalledWith(false, false));
    progress.current = 4;
    await waitFor(() => expect((r.setGuides as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe(true));
  });

  it('tells a capture when the frame at the asked progress is sharp: at once if it already rests there, else when it comes to rest', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 0 };
    render(<ArrivalCanvas progress={progress} reduced={false} capture onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    const hook = () => (window as unknown as { __arrival: { setProgress: (p: number) => void; sharp: () => Promise<void> } }).__arrival;
    await waitFor(() => expect(hook()).toBeDefined());
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    // Moving to a new progress: the answer waits for the renderer's sharp frame there.
    hook().setProgress(2);
    let done = false;
    void hook().sharp().then(() => (done = true));
    await new Promise((res) => setTimeout(res, 50));
    expect(done).toBe(false);
    r.onSharp!();
    await waitFor(() => expect(done).toBe(true));
    // Asked again at the same progress, with the view at rest there: the next frame answers.
    r.resting = true;
    hook().setProgress(2);
    await expect(Promise.race([hook().sharp().then(() => 'sharp'), new Promise((res) => setTimeout(() => res('still waiting'), 1000))])).resolves.toBe('sharp');
  });

  it('hides a label where it would fall on the words, and shows it again once they have moved on', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const words = document.createElement('p');
    words.setAttribute('data-words', '');
    document.body.appendChild(words);
    let wordsAt = { left: 0, top: 0, right: 400, bottom: 400 };
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const b = this.hasAttribute('data-words') ? wordsAt : { left: 100, top: 100, right: 160, bottom: 124 };
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const earth = await screen.findByText(/^Earth, [\d,]+ km away/);
      await waitFor(() => expect(r.setPose).toHaveBeenCalled());
      await new Promise((res) => setTimeout(res, 50));
      expect(earth.hidden).toBe(true);
      wordsAt = { left: 0, top: -400, right: 400, bottom: -10 }; // scrolled past
      await waitFor(() => expect(earth.hidden).toBe(false));
    } finally {
      rect.mockRestore();
      words.remove();
    }
  });

  it('keeps two labels from landing on each other: from the cap down the site’s keeps its place (the beat names the ridge) and the pole’s waits', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    // Every label at the same spot, as the pole and the site are from high above.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 100, top: 100, right: 220, bottom: 124, x: 100, y: 100, width: 120, height: 24, toJSON: () => ({}) }) as DOMRect);
    try {
      render(<ArrivalCanvas progress={{ current: 2 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const pole = await screen.findByText("The Moon's south pole"), site = await screen.findByText(siteLabel(hero().site).replace(/ /g, ' '));
      await waitFor(() => expect(site.hidden).toBe(false));
      expect(pole.hidden).toBe(true);
    } finally {
      rect.mockRestore();
    }
  });

  it('names Earth with how far it is, so its small disc is not taken for a small world', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    // On which day, and that it looks small only because it is far.
    expect(await screen.findByText(/^Earth, 3\d\d,000 km away on 1 January: it looks small only because it is far$/)).toBeTruthy();
  });

  it('points to the Sun from the edge of the view while it is out of sight, through the month, and names it where it shows', async () => {
    const { r } = stub();
    let sunSeen = false;
    r.labels = vi.fn(() => ({ sun: { x: 0.6, y: 0.4, visible: sunSeen } })) as unknown as typeof r.labels;
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 1.25 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(document.querySelector('[data-sun-edge]')).not.toBeNull());
    const edge = document.querySelector('[data-sun-edge]') as HTMLElement;
    expect(edge.textContent).toMatch(/^Sun/);
    await waitFor(() => expect(edge.hidden).toBe(false));
    // On the view's edge, inset so the chip stays whole.
    const x = parseFloat(edge.style.left), y = parseFloat(edge.style.top);
    expect(Math.min(x, 100 - x, y, 100 - y)).toBeLessThan(12);
    // Over the pole the hour holds (the month runs once, at the site after landing): no date's chip yet.
    expect((document.querySelector('[data-date-bar]') as HTMLElement).hidden).toBe(true);
    // In view (standing, the Sun to the right of the middle), the Sun's own label instead.
    sunSeen = true;
    progress.current = 4;
    await waitFor(() => expect(edge.hidden).toBe(true));
    expect(screen.getByText(/^Sun /, { selector: 'span:not([data-sun-edge])' }).hidden).toBe(false);
  });

  it('once standing, points to Earth from the edge of the view with where it is, so the missing radio has a place', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 2 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(document.querySelector('[data-earth-edge]')).not.toBeNull());
    const edge = document.querySelector('[data-earth-edge]') as HTMLElement;
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    expect(edge.hidden).toBe(true); // not in flight
    progress.current = 4;
    // At the hero hour Earth is 6° below the horizon, behind the view.
    await waitFor(() => expect(edge.hidden).toBe(false));
    expect(edge.textContent).toMatch(/^Earth, \d+(\.\d)?° below the horizon/);
  });

  it('turns a label beside its point to the other side where it would run off the view, and under it where neither side fits, as on a phone', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    let room = 'left';
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      // The view 390 wide; a label beside its point reaches past its right edge, and past its left edge too when there is no room.
      const side = this.getAttribute('data-side');
      const b =
        this.tagName === 'CANVAS' ? { left: 0, top: 0, right: 390, bottom: 844 }
        : side === 'left' ? (room === 'left' ? { left: 100, top: 400, right: 300, bottom: 424 } : { left: -20, top: 400, right: 180, bottom: 424 })
        : side === 'below' ? { left: 95, top: 430, right: 295, bottom: 454 }
        : { left: 300, top: 400, right: 500, bottom: 424 };
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      const progress = { current: 0 };
      render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const earth = await screen.findByText(/^Earth, [\d,]+ km away/);
      await waitFor(() => expect(earth.getAttribute('data-side')).toBe('left'));
      expect(earth.hidden).toBe(false);
      room = 'none';
      await waitFor(() => expect(earth.getAttribute('data-side')).toBe('below'));
    } finally {
      rect.mockRestore();
    }
  });

  it('names each path once landed, over its line, while it is the story: the Sun’s until Earth comes into view, then Earth’s until the Sun comes back; no level horizon', async () => {
    const { r } = stub();
    r.labels = vi.fn(() => ({
      sun: { x: 0.8, y: 0.5, visible: true },
      pathNames: [
        { body: 'sun', text: "Sun's path this month", x: 0.3, y: 0.45, visible: true },
        { body: 'earth', text: "Earth's path this month", x: 0.6, y: 0.4, visible: true },
      ],
    })) as unknown as typeof r.labels;
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours);
    const at = (hour: number) => 4 + (hour - HERO_HOUR) / (end - HERO_HOUR);
    const rise = moments.find((m) => m.kind === 'earth-in')!.hour, back = moments.find((m) => m.kind === 'sun-back' || m.kind === 'sun-power-back')!.hour;
    const progress = { current: 2 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    const sunPath = await screen.findByText("Sun's path this month"), earthPath = screen.getByText("Earth's path this month");
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    expect(sunPath.hidden).toBe(true); // not in flight
    progress.current = 4;
    await waitFor(() => expect(sunPath.hidden).toBe(false));
    expect(earthPath.hidden).toBe(true);
    // Each name over its line, kept off the other path; the guides without the level horizon.
    expect(r.labels).toHaveBeenLastCalledWith({ above: true, middle: 0.65 });
    expect(r.setGuides).toHaveBeenLastCalledWith(true, false);
    expect(screen.queryByText('Level horizon')).toBeNull();
    progress.current = at(rise + 40);
    await waitFor(() => expect(earthPath.hidden).toBe(false));
    expect(sunPath.hidden).toBe(true);
    progress.current = at(back + 40);
    await waitFor(() => expect(earthPath.hidden).toBe(true));
    expect(sunPath.hidden).toBe(true);
  });

  it('keeps a path’s name whole inside the view, moved in from the edge it would run past, as on a phone; on a wide screen it asks for names right of the words', async () => {
    const { r } = stub();
    r.labels = vi.fn(() => ({ sun: { x: 0.2, y: 0.5, visible: false }, pathNames: [{ body: 'sun', text: "Sun's path this month", x: 0.9, y: 0.4, visible: true }] })) as unknown as typeof r.labels;
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      // The view 390 wide; the name 170 wide round its point, moved in by as many pixels as its left says.
      const el = this as HTMLElement, shift = Number(/- (-?[\d.]+)px/.exec(el.style?.left ?? '')?.[1] ?? 0);
      const b = this.tagName === 'CANVAS' ? { left: 0, top: 0, right: 390, bottom: 844 } : el.hasAttribute('data-path-name') ? { left: 351 - 85 - shift, top: 300, right: 351 + 85 - shift, bottom: 324 } : { left: 0, top: 0, right: 0, bottom: 0 };
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
      render(<ArrivalCanvas progress={{ current: 4 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const name = await screen.findByText("Sun's path this month");
      await waitFor(() => expect(name.hidden).toBe(false));
      // 351 + 85 reaches 46 px past the edge less the 4 px kept clear: moved in 50 px.
      expect(name.style.left).toBe('calc(90% - 50px)');
    } finally {
      rect.mockRestore();
    }
    // The view here is wider than tall: the names gather right of the words at the left.
    expect(r.labels).toHaveBeenLastCalledWith({ above: true, middle: 0.65 });
  });

  it('names no path on a phone, whose narrow view has no room for the names beside Earth and the Sun', async () => {
    const was = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    try {
      const { r } = stub();
      r.labels = vi.fn(() => ({ sun: { x: 0.8, y: 0.5, visible: true }, pathNames: [{ body: 'sun', text: "Sun's path this month", x: 0.3, y: 0.45, visible: true }] })) as unknown as typeof r.labels;
      const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
      render(<ArrivalCanvas progress={{ current: 4 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const name = await screen.findByText("Sun's path this month");
      await waitFor(() => expect(r.setPose).toHaveBeenCalled());
      await new Promise((res) => setTimeout(res, 50));
      expect(name.hidden).toBe(true);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
    }
  });

  it('raises Earth’s name from space beside it where it would run off the bottom of the view, as on a phone', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      // The view 390 by 844; Earth's name, beside its point near the foot of the view, runs past the bottom unless raised.
      const side = this.getAttribute('data-side');
      const b = this.tagName === 'CANVAS' ? { left: 0, top: 0, right: 390, bottom: 844 } : side === 'up' ? { left: 200, top: 700, right: 380, bottom: 800 } : { left: 200, top: 780, right: 380, bottom: 880 };
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const earth = await screen.findByText(/^Earth, [\d,]+ km away/);
      await waitFor(() => expect(earth.getAttribute('data-side')).toBe('up'));
      expect(earth.hidden).toBe(false);
    } finally {
      rect.mockRestore();
    }
  });

  it('once landed points to a body out of view along the horizon, left or right, never up into the sky the Sun never climbs', async () => {
    const { r } = stub();
    r.labels = vi.fn(() => ({ sun: { x: 0.5, y: 0.5, visible: false } })) as unknown as typeof r.labels;
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours);
    // Mid-month the camera faces Earth, the Sun well round behind it.
    render(<ArrivalCanvas progress={{ current: 4 + (300 - HERO_HOUR) / (end - HERO_HOUR) }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(document.querySelector('[data-sun-edge]')).not.toBeNull());
    const edge = document.querySelector('[data-sun-edge]') as HTMLElement;
    await waitFor(() => expect(edge.hidden).toBe(false));
    const x = parseFloat(edge.style.left), turn = Number(/rotate\((-?[\d.e-]+)rad\)/.exec((edge.querySelector('b') as HTMLElement).style.transform)?.[1]);
    expect(Math.min(x, 100 - x)).toBeLessThan(15);
    expect(Math.abs(Math.sin(turn))).toBeLessThan(1e-6);
  });

  it('once landed names Earth where it shows, with how high it stands, as it names the Sun', async () => {
    const { r } = stub();
    r.labels = vi.fn(() => ({ sun: { x: 0.8, y: 0.5, visible: false }, earth: { x: 0.6, y: 0.4, visible: true } })) as unknown as typeof r.labels;
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours);
    const hour = moments.find((m) => m.kind === 'earth-in')!.hour + 60;
    render(<ArrivalCanvas progress={{ current: 4 + (hour - HERO_HOUR) / (end - HERO_HOUR) }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(document.querySelector('[data-earth-here]')).not.toBeNull());
    const here = document.querySelector('[data-earth-here]') as HTMLElement;
    await waitFor(() => expect(here.hidden).toBe(false));
    expect(here.textContent).toBe(skyLabel('earth', h.series, hour));
    expect(here.style.left).toBe('60%');
  });

  it('runs the month at the site on a date bar: the date, what lights the ground, each moment as it passes, and where the hour stands in the month', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 4 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(r.setTime).toHaveBeenCalledWith(HERO_HOUR));
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours), year = h.startUtc.slice(0, 4);
    const at = (hour: number) => 4 + (hour - HERO_HOUR) / (end - HERO_HOUR);
    const bar = document.querySelector('[data-date-bar]') as HTMLElement, mark = bar.querySelector('[data-mark]') as HTMLElement;
    // The date on one line and what happens on the next, each on one line, so the bar never changes height.
    const date = bar.querySelector('[data-date]') as HTMLElement, state = bar.querySelector('[data-state]') as HTMLElement;
    expect(date.className).toMatch(/(^| )truncate( |$)/);
    expect(state.className).toMatch(/(^| )truncate( |$)/);
    // Landed: the date and what lights the ground, the month with its moments marked, and what the marks' colours say.
    await waitFor(() => expect(bar.hidden).toBe(false));
    expect(date.textContent).toBe(`${dateLong(h.startUtc, HERO_HOUR)} ${year}`);
    expect(state.textContent).toBe('In sunlight');
    expect(bar.querySelectorAll('[data-tick]')).toHaveLength(moments.length);
    for (const key of ['The Sun hides or comes back', 'The battery runs out', 'Earth comes into view']) expect(within(bar).getByText(key)).toBeTruthy();
    // Each moment named for a day or so after it passes, the mark at its hour in the month.
    const earth = moments.find((m) => m.kind === 'earth-in')!;
    progress.current = at(earth.hour + 6);
    await waitFor(() => expect(date.textContent).toBe(`${dateLong(h.startUtc, earth.hour + 6)} ${year}`));
    expect(state.textContent).toBe(earth.label);
    expect(parseFloat(mark.style.left)).toBeCloseTo(((earth.hour + 6) / (h.series.hours - 1)) * 100, 0);
    // Then what lights the ground: Earth alone, which is why it looks blue; or nothing at all. Either way the picture
    // is brightened, and says so: the ground would look near black.
    progress.current = at(earth.hour + 60);
    await waitFor(() => expect(state.textContent).toBe('Lit only by Earthlight (picture brightened)'));
    progress.current = at(moments.find((m) => m.kind === 'battery-out')!.hour + 60);
    await waitFor(() => expect(state.textContent).toBe('In the dark (picture brightened)'));
    // At the end, the last hour of the story; before landing, no bar.
    progress.current = 5;
    await waitFor(() => expect((r.setTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe(end));
    progress.current = 3;
    await waitFor(() => expect(bar.hidden).toBe(true));
  });

  it('says over the pole’s dark side that it is night there, across from the Sun, so it is not read as space', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 1.25 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    const night = await screen.findByText('Night here: the Sun is below the horizon');
    await waitFor(() => expect(night.hidden).toBe(false));
    // Across the view from the Sun's pointer.
    const sun = document.querySelector('[data-sun-edge]') as HTMLElement;
    await waitFor(() => expect(sun.hidden).toBe(false));
    const dx = (parseFloat(sun.style.left) - 50) * (parseFloat(night.style.left) - 50), dy = (parseFloat(sun.style.top) - 50) * (parseFloat(night.style.top) - 50);
    expect(dx + dy).toBeLessThan(0);
    progress.current = 3;
    await waitFor(() => expect(night.hidden).toBe(true));
  });

  it('keeps the night’s name whole inside a phone’s view, by its own width', async () => {
    const was = { w: window.innerWidth, h: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const width = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.textContent?.startsWith('Night here') ? 300 : 0;
    });
    try {
      const { r } = stub();
      const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
      render(<ArrivalCanvas progress={{ current: 1.25 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const night = await screen.findByText('Night here: the Sun is below the horizon');
      await waitFor(() => expect(night.hidden).toBe(false));
      // Its middle at least half its width and 8 px in from either edge of the 390 px view.
      const x = (parseFloat(night.style.left) / 100) * 390;
      expect(x - 150).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(x + 150).toBeLessThanOrEqual(390 - 8 + 1e-6);
    } finally {
      width.mockRestore();
      Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
    }
  });

  it('keeps the last beat’s names off the lander', async () => {
    const { r } = stub();
    r.labels = vi.fn(() => ({ sun: { x: 0.8, y: 0.5, visible: true }, pathNames: [{ body: 'sun', text: "Sun's path this month", x: 0.5, y: 0.5, visible: true }], landerBox: { left: 0.45, top: 0.45, right: 0.55, bottom: 0.6 } })) as unknown as typeof r.labels;
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      // The view 1000 by 1000; a chip 120 by 24 at its left and top.
      const el = this as HTMLElement, x = (parseFloat(el.style?.left ?? '0') || 0) * 10, y = (parseFloat(el.style?.top ?? '0') || 0) * 10;
      const b = this.tagName === 'CANVAS' ? { left: 0, top: 0, right: 1000, bottom: 1000 } : { left: x - 60, top: y - 12, right: x + 60, bottom: y + 12 };
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
      render(<ArrivalCanvas progress={{ current: 4 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const name = await screen.findByText("Sun's path this month");
      await waitFor(() => expect(r.setPose).toHaveBeenCalled());
      await new Promise((res) => setTimeout(res, 50));
      expect(name.hidden).toBe(true);
    } finally {
      rect.mockRestore();
    }
  });

  it('with reduced motion draws each beat at its own hour: the month’s middle at its middle beat, as its words say', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours);
    render(<ArrivalCanvas progress={{ current: 4.5 }} reduced onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect((r.setTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toBeCloseTo(HERO_HOUR + (end - HERO_HOUR) / 2, 6));
  });

  it('says where the Sun and Earth stand at the hour shown, through the month at the site', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours), hide = moments.find((m) => m.kind === 'sunset')!.hour;
    const progress = { current: 4 + (hide - HERO_HOUR) / (end - HERO_HOUR) };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect((r.setTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toBeCloseTo(hide, 6));
    await waitFor(() => expect(screen.getByText(skyLabel('sun', h.series, hide))).toBeTruthy());
    expect((document.querySelector('[data-earth-edge]') as HTMLElement).textContent).toContain(skyLabel('earth', h.series, hide));
    progress.current = 5;
    await waitFor(() => expect((document.querySelector('[data-earth-edge]') as HTMLElement).textContent).toContain(skyLabel('earth', h.series, end)));
  });

  it('gives way to the stills when the Moon’s files do not load, and lets the renderer go when it leaves', async () => {
    const { r } = stub();
    const onFail = vi.fn();
    const broken: ArrivalLoaders = {
      sky: async () => sky,
      globe: async () => {
        throw new Error('404');
      },
      terrain: () => new Promise(() => {}),
    };
    render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={onFail} loaders={broken} createRenderer={() => r} />);
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    const ok: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const { unmount } = render(<ArrivalCanvas progress={{ current: 0 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={ok} createRenderer={() => r} />);
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    unmount();
    expect(r.dispose).toHaveBeenCalled();
  });
});
