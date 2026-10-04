// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StandScene } from '@/lib/sky/standRenderer';
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
    resize: vi.fn(),
    render: vi.fn(),
    project: vi.fn(() => ({ x: 0.5, y: 0.5, visible: true })),
    labels: vi.fn(() => ({ sun: { x: 0.5, y: 0.5, visible: true } })),
    dispose: vi.fn(),
    ready: Promise.resolve(),
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
