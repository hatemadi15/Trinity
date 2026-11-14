// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColdOverlayDoc } from '@/lib/coldtraps/coldtraps';
import type { Heightmap } from '@/lib/data/terrain';
import type { Series } from '@/lib/engine/metrics';
import type { SceneState } from '@/lib/viz/scene-state';
import { PHONE, visibleWords, WIDE } from '@/test/visible-words';
import { GroundPanel } from './GroundPanel';

vi.mock('@/components/three', () => ({ Scene3DLazy: () => null }));

const scene = { sunDirLocal: [0, 0.1, -1], earthDirLocal: [1, 0.1, 0], sunDirMoon: [1, 0, 0], earthDirMoon: [0, 1, 0], sunAz: 0, sunEl: 2, earthAz: 90, earthEl: 3, skylineAtSun: 0, skylineAtEarth: 0, light: { intensity: 1 }, earthVisible: true } as SceneState;
const site = { id: 'connecting_ridge', name: 'Connecting Ridge', label: 'Connecting Ridge', lat: -89.53, lon: -150.05, category: 'artemis3', polar: true, source: 'x' };
const n = 24;
const series: Series = {
  i0: 0,
  hours: n,
  sunAz: Float64Array.from({ length: n }, (_, h) => 270 - h),
  sunEl: new Float64Array(n).fill(2),
  earthAz: new Float64Array(n).fill(18),
  earthEl: new Float64Array(n).fill(4),
  sunFraction: new Float64Array(n).fill(1),
  earthVisible: new Uint8Array(n).fill(1),
  sunAu: new Float64Array(n).fill(1),
};
// An 8 by 8 window of 20 m cells centred on the pole, and a layer cut for it with one cold cell.
const window: Heightmap = {
  meta: { site_id: 'connecting_ridge', lat: -89.53, lon: -150.05, kind: 'window', source: 's', level: 'L0', cell_m: 20, width: 8, height: 8, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1, site_height_m: 0, line_offset_px: 3.5, sample_offset_px: 3.5, site_row_px: 3.5, site_col_px: 3.5 },
  heightsM: new Float32Array(64),
};
const layer: ColdOverlayDoc = { version: 1, cold_K: 110, sites: [{ site_id: 'connecting_ridge', x0_m: -80, y0_m: 80, cell_m: 20, width: 8, height: 8, bits: 'gAAAAAAAAAA=' }] };

function show(extra: Partial<Parameters<typeof GroundPanel>[0]> = {}) {
  const client = {
    setLevels: vi.fn(async () => {}),
    picture: vi.fn(async (key: string) => ({ id: 1, type: 'picture' as const, key, width: 8, height: 8, pixels: new Uint8Array(64).fill(120), siteLit: true })),
  };
  const load = vi.fn(async () => layer);
  render(
    <GroundPanel
      site={site}
      sites={[site]}
      scene={scene}
      mode="terrain"
      exaggeration={1}
      heightmap={window}
      contextHeightmap={null}
      capHeightmap={null}
      textureUrl={null}
      terrainState="ready"
      windowLoading={false}
      customError={null}
      when="2 Jan 2027, 06:00 UTC"
      startUtc="2027-01-02T03:00:00"
      days={30}
      mask={new Float64Array(720)}
      series={series}
      cursor={3}
      onMode={() => {}}
      onExaggeration={() => {}}
      onPick={() => {}}
      reducedMotion={false}
      shadowClient={client}
      coldLayer
      coldOverlay={load}
      {...extra}
    />,
  );
  return { load };
}
const toggle = () => screen.getByRole('button', { name: 'Modelled cold ground' });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the shadow map’s layer of modelled cold ground', () => {
  it('is off until asked for, loads nothing before, and leaves the ground panel within its 110 words', async () => {
    const { load } = show();
    const panel = screen.getByRole('region', { name: 'The ground' });
    await waitFor(() => expect(within(panel).getByRole('img', { name: 'Shadows at 2 Jan 2027, 06:00 UTC. The site is in sunlight.' })).toBeTruthy());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(panel.querySelector('[data-layer="cold"]')).toBeNull();
    expect(load).not.toHaveBeenCalled();
    for (const width of [WIDE, PHONE]) expect(visibleWords(panel, width).length).toBeLessThanOrEqual(110);
  });

  it('draws the layer once switched on, with its line in the map’s key and what it is in About this view', async () => {
    const { load } = show();
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    const panel = screen.getByRole('region', { name: 'The ground' });
    await waitFor(() => expect(panel.querySelector('[data-layer="cold"]')).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(1);
    const key = within(panel).getByRole('list', { name: 'How to read the map' });
    expect(key.textContent).toMatch(/below 110 K all year in NASA’s Diviner model: modelled conditions where ice could last/);
    expect(panel.textContent).toMatch(/The cold ground is NASA’s Diviner temperature model, fitted to one year of measurements in patches about half a kilometre across: modelled conditions where ice could last, not a finding that any is there\./);
    // The window's 8 cells carry the layer's 8 cells, edge to edge.
    const canvas = panel.querySelector<HTMLCanvasElement>('[data-layer="cold"] canvas')!;
    expect([canvas.style.left, canvas.style.top, canvas.style.width, canvas.style.height]).toEqual(['0%', '0%', '100%', '100%']);
    fireEvent.click(toggle());
    expect(panel.querySelector('[data-layer="cold"]')).toBeNull();
    expect(key.textContent).not.toMatch(/Diviner/);
  });

  it('is not offered where the layer does not reach, or without the terrain window', () => {
    show({ coldLayer: false });
    expect(screen.queryByRole('button', { name: 'Modelled cold ground' })).toBeNull();
  });

  it('is not offered on the coarse cap alone', () => {
    show({ heightmap: null, terrainState: 'unavailable' });
    expect(screen.queryByRole('button', { name: 'Modelled cold ground' })).toBeNull();
  });
});
