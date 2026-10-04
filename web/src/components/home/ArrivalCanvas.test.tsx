// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
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
    await waitFor(() => expect(r.setGuides).toHaveBeenCalledWith(false));
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

  it('keeps two labels from landing on each other: the pole’s keeps its place and the site’s waits', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    // Every label at the same spot, as the pole and the site are from high above.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 100, top: 100, right: 220, bottom: 124, x: 100, y: 100, width: 120, height: 24, toJSON: () => ({}) }) as DOMRect);
    try {
      render(<ArrivalCanvas progress={{ current: 2 }} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
      const pole = await screen.findByText("The Moon's south pole"), site = await screen.findByText(siteLabel(hero().site).replace(/ /g, ' '));
      await waitFor(() => expect(pole.hidden).toBe(false));
      expect(site.hidden).toBe(true);
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
    // The month's date, with its year, and that the month runs fast.
    expect(screen.getByText(/^\d{1,2} January 2027: a month, sped up$/)).toBeTruthy();
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

  it('names the lines once standing, as the stand view does: each body’s path and the level horizon', async () => {
    const { r } = stub();
    r.labels = vi.fn(() => ({
      sun: { x: 0.8, y: 0.5, visible: true },
      pathNames: [
        { body: 'sun', text: "Sun's path this month", x: 0.3, y: 0.45, visible: true },
        { body: 'earth', text: "Earth's path this month", x: 0.6, y: 0.4, visible: true },
      ],
    })) as unknown as typeof r.labels;
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 2 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    const sunPath = await screen.findByText("Sun's path this month"), level = await screen.findByText('Level horizon');
    await waitFor(() => expect(r.setPose).toHaveBeenCalled());
    expect(sunPath.hidden).toBe(true); // not in flight
    expect(level.hidden).toBe(true);
    progress.current = 4;
    await waitFor(() => expect(sunPath.hidden).toBe(false));
    expect(screen.getByText("Earth's path this month").hidden).toBe(false);
    expect(level.hidden).toBe(false);
  });

  it('runs the month at the site after landing: the hours move on, and the chip names each moment as it passes', async () => {
    const { r } = stub();
    const loaders: ArrivalLoaders = { sky: async () => sky, globe: async () => globe, terrain: () => new Promise(() => {}) };
    const progress = { current: 4 };
    render(<ArrivalCanvas progress={progress} reduced={false} onLive={vi.fn()} onFail={vi.fn()} loaders={loaders} createRenderer={() => r} />);
    await waitFor(() => expect(r.setTime).toHaveBeenCalledWith(HERO_HOUR));
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), end = siteEndHour(moments, h.series.hours), earth = moments.find((m) => m.kind === 'earth-in')!;
    progress.current = 4 + (earth.hour + 6 - HERO_HOUR) / (end - HERO_HOUR);
    await waitFor(() => expect((r.setTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBeCloseTo(earth.hour + 6, 6));
    expect(screen.getByText(`${dateLong(h.startUtc, earth.hour + 6)} ${h.startUtc.slice(0, 4)}: ${earth.label}`)).toBeTruthy();
    // At the end, the last hour of the story.
    progress.current = 5;
    await waitFor(() => expect((r.setTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]).toBe(end));
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
