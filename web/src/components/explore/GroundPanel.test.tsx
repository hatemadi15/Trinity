// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Heightmap, HeightmapMeta } from '@/lib/data/terrain';
import type { Series } from '@/lib/engine/metrics';
import type { SceneState } from '@/lib/viz/scene-state';
import { GroundPanel } from './GroundPanel';

const scene = { sunDirLocal: [0, 0.1, -1], earthDirLocal: [1, 0.1, 0], sunDirMoon: [1, 0, 0], earthDirMoon: [0, 1, 0], sunAz: 0, sunEl: 2, earthAz: 90, earthEl: 3, skylineAtSun: 0, skylineAtEarth: 0, light: { intensity: 1, castShadow: true }, earthVisible: true } as SceneState;
const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };
const mare = { id: 'blue_ghost_m1', name: 'Blue Ghost Mission 1 (Mare Crisium)', label: 'Blue Ghost', lat: 18.56, lon: 61.81, category: 'clps', polar: false, source: 'x' };
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

function grid(kind: HeightmapMeta['kind'], size: number, cell: number): Heightmap {
  const mid = (size - 1) / 2;
  return {
    meta: { site_id: 'de_gerlache_rim_2', lat: -88.28, lon: -64.31, kind, source: 's', level: 'L', cell_m: cell, width: size, height: size, row0: 0, col0: 0, min_m: 0, max_m: 0, scale_m_per_unit: 1, site_height_m: 0, line_offset_px: mid, sample_offset_px: mid, site_row_px: mid, site_col_px: mid },
    heightsM: new Float32Array(size * size),
  };
}

function stubClient() {
  return {
    setLevels: vi.fn(async () => {}),
    picture: vi.fn(async (key: string, _b: number, _e: number, half: boolean) => ({ id: 1, type: 'picture' as const, key, width: half ? 4 : 8, height: half ? 4 : 8, pixels: new Uint8Array(half ? 16 : 64).fill(120), siteLit: true })),
  };
}

function show(extra: Partial<Parameters<typeof GroundPanel>[0]> = {}) {
  const onMode = vi.fn();
  const onExaggeration = vi.fn();
  const client = stubClient();
  render(
    <GroundPanel
      site={site}
      sites={[site]}
      scene={scene}
      mode="terrain"
      exaggeration={1}
      heightmap={null}
      contextHeightmap={null}
      capHeightmap={null}
      textureUrl={null}
      terrainState="unavailable"
      windowLoading={false}
      customError={null}
      when="2 Jan 2027, 06:00 UTC"
      mask={new Float64Array(720)}
      series={series}
      cursor={3}
      onMode={onMode}
      onExaggeration={onExaggeration}
      onPick={() => {}}
      reducedMotion={false}
      shadowClient={client}
      {...extra}
    />,
  );
  return { onMode, onExaggeration, client };
}
const tab = (name: string) => screen.getByRole('tab', { name });

beforeEach(() => {
  // jsdom has no 2D canvas: the picture is painted only in a browser.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('GroundPanel', () => {
  it('opens on the shadow map, with tabs for the 3D view and the horizon', async () => {
    const { client } = show({ heightmap: grid('window', 8, 20), terrainState: 'ready' });
    const tabs = within(screen.getByRole('tablist', { name: 'How to look at the ground' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Shadow map', '3D', 'Horizon']);
    expect(tab('Shadow map').getAttribute('aria-selected')).toBe('true');
    const panel = screen.getByRole('tabpanel', { name: 'Shadow map' });
    await waitFor(() => expect(within(panel).getByRole('img', { name: 'Shadows at 2 Jan 2027, 06:00 UTC. The site is in sunlight.' })).toBeTruthy());
    expect(client.setLevels).toHaveBeenCalledTimes(1);
    expect(panel.textContent).toMatch(/Light ground is in sunlight, dark ground in shadow\. Worked out from NASA elevation data at 20 m per pixel: computed, not a photograph\./);
  });

  it('moves between the tabs with the arrow keys, Home and End', () => {
    show();
    fireEvent.keyDown(tab('Shadow map'), { key: 'ArrowRight' });
    expect(tab('3D').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('3D'));
    fireEvent.keyDown(tab('3D'), { key: 'End' });
    expect(tab('Horizon').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Horizon'), { key: 'ArrowRight' });
    expect(tab('Shadow map').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Shadow map'), { key: 'ArrowLeft' });
    expect(tab('Horizon').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Horizon'), { key: 'Home' });
    expect(tab('Shadow map').getAttribute('aria-selected')).toBe('true');
  });

  it('titles the picture, says which hour it shows and mounts the 3D view in its tab', async () => {
    show();
    fireEvent.click(tab('3D'));
    const panel = screen.getByRole('region', { name: 'The ground' });
    expect(panel.textContent).toMatch(/2 Jan 2027, 06:00 UTC/);
    // jsdom has no WebGL: the 3D view shows its fallback, which proves it mounted with the site.
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3D view is not available/));
    expect(screen.getByRole('status').textContent).toMatch(/de Gerlache Rim 2 is still shown in the chart above/);
    expect(screen.getByRole('status').textContent).not.toMatch(/Artemis III region|sky-dome/);
  });

  it('switches between the terrain and the globe, and between true and tripled heights', () => {
    const { onMode, onExaggeration } = show();
    fireEvent.click(tab('3D'));
    expect(screen.getByRole('button', { name: 'Terrain' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Globe' }));
    expect(onMode).toHaveBeenCalledWith('globe');
    fireEvent.click(screen.getByRole('button', { name: 'Heights ×3' }));
    expect(onExaggeration).toHaveBeenCalledWith(3);
  });

  it("keeps its switches out of the picture, in the page's own style: the chosen one dark", () => {
    show();
    fireEvent.click(tab('3D'));
    const view = screen.getByRole('group', { name: 'View' });
    expect(view.closest('.stage')).toBeNull();
    expect(screen.getByRole('button', { name: 'Terrain' }).className).toMatch(/\bbg-ink\b/);
    expect(screen.getByRole('button', { name: 'Globe' }).className).not.toMatch(/\bbg-ink\b/);
    expect(screen.getByRole('group', { name: 'Heights' }).closest('.stage')).toBeNull();
    expect(screen.getByRole('tablist').closest('.stage')).toBeNull();
  });

  it('says in plain words what the 3D picture is made from', () => {
    show({ heightmap: grid('window', 1024, 20), terrainState: 'ready' });
    fireEvent.click(tab('3D'));
    expect(screen.getByRole('tabpanel', { name: '3D' }).textContent).toMatch(/NASA elevation data at 20 m per pixel, 20\.48 km across\. Drag to turn, scroll to zoom\. The light follows the time bar\./);
  });

  it('keeps one name in every tab, explains the globe and reports a place that cannot be worked out', () => {
    show({ mode: 'globe', customError: 'no DEM coverage north of 60S (lat -40.00)' });
    fireEvent.click(tab('3D'));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('The ground');
    const text = screen.getByRole('tabpanel', { name: '3D' }).textContent ?? '';
    expect(text).toMatch(/^.*The whole Moon, lit for the hour of the time bar\. Click anywhere inside the ring at 60° S to get that point's own forecast\./);
    expect(screen.getByRole('alert').textContent).toMatch(/That place cannot be worked out: this tool covers the Moon south of 60° S/);
    expect(screen.queryByRole('button', { name: 'Heights ×3' })).toBeNull();
  });

  it('says so while the terrain loads, and when the terrain files are missing', () => {
    show({ terrainState: 'loading' });
    expect(screen.getByRole('tabpanel', { name: 'Shadow map' }).textContent).toMatch(/Loading the terrain…/);
    act(() => {
      fireEvent.click(tab('3D'));
    });
    expect(screen.getByRole('tabpanel', { name: '3D' }).textContent).toMatch(/Loading the terrain…/);
  });

  it('says when the terrain files are not on this machine', () => {
    show({ terrainState: 'unavailable' });
    expect(screen.getByRole('tabpanel', { name: 'Shadow map' }).textContent).toMatch(/The terrain files are not on this machine\./);
  });

  it('waits for the detailed terrain instead of drawing the coarse one first', () => {
    const { client } = show({ terrainState: 'ready', capHeightmap: grid('cap', 64, 960), windowLoading: true });
    expect(screen.getByRole('tabpanel', { name: 'Shadow map' }).textContent).toMatch(/Loading the terrain…/);
    expect(client.setLevels).not.toHaveBeenCalled();
  });

  it('says what the coarse model shows and what it cannot, without promising more', async () => {
    show({ terrainState: 'ready', capHeightmap: grid('cap', 64, 960) });
    const map = screen.getByRole('tabpanel', { name: 'Shadow map' });
    await waitFor(() => expect(within(map).getByRole('img', { name: /^Shadows at/ })).toBeTruthy());
    expect(map.textContent).toMatch(/Worked out from NASA elevation data at 960 m per pixel: too coarse to show the site's own slopes\./);
    fireEvent.click(tab('3D'));
    const text = screen.getByRole('tabpanel', { name: '3D' }).textContent ?? '';
    expect(text).toMatch(/NASA elevation data at 960 m per pixel, 48 km around the site: too coarse to show its own slopes\. The light follows the time bar\./);
    expect(text).not.toMatch(/yet/);
  });

  it('a site with no polar terrain: says its horizon is taken as flat, and shows only the globe in 3D', async () => {
    const { client } = show({ site: mare, sites: [mare], mode: 'globe', terrainState: 'ready', capHeightmap: grid('cap', 64, 960) });
    expect(screen.getByRole('tabpanel', { name: 'Shadow map' }).textContent).toMatch(/This site has no polar terrain: its horizon is taken as flat\./);
    expect(screen.queryByRole('img', { name: /^Shadows at/ })).toBeNull();
    expect(client.setLevels).not.toHaveBeenCalled();
    fireEvent.click(tab('3D'));
    expect(screen.queryByRole('button', { name: 'Terrain' })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: '3D' }).textContent).toMatch(/The whole Moon/);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Blue Ghost/));
  });

  it('puts the 3D picture on the whole screen, and offers the way back from there', () => {
    const shown: Element[] = [];
    const exit = vi.fn(async () => {});
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    let current: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: function (this: HTMLElement) {
        shown.push(this);
        return Promise.resolve();
      },
    });
    try {
      show();
      fireEvent.click(tab('3D'));
      fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      expect(shown).toHaveLength(1);
      expect(shown[0].classList.contains('stage')).toBe(true);
      expect(within(shown[0] as HTMLElement).getByRole('status')).toBeTruthy();
      act(() => {
        current = shown[0];
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      fireEvent.click(within(shown[0] as HTMLElement).getByRole('button', { name: 'Leave full screen' }));
      expect(exit).toHaveBeenCalled();
    } finally {
      for (const key of ['fullscreenEnabled', 'exitFullscreen', 'fullscreenElement'] as const) delete (document as unknown as Record<string, unknown>)[key];
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).requestFullscreen;
    }
  });

  it("shows the horizon in its own tab, with the time bar's hour marked", () => {
    show();
    fireEvent.click(tab('Horizon'));
    const panel = screen.getByRole('tabpanel', { name: 'Horizon' });
    expect(within(panel).getByRole('img', { name: /^The horizon all round the site/ })).toBeTruthy();
    expect(panel.textContent).toMatch(/the Sun moves from right to left/);
    expect(parseFloat(panel.querySelector<HTMLElement>('[data-marker="sun"]')!.style.left)).toBeCloseTo(((270 - 3) / 360) * 100, 6);
  });

  it('asks for no shadow pictures while the horizon is shown', async () => {
    const { client } = show({ heightmap: grid('window', 8, 20), terrainState: 'ready' });
    await waitFor(() => expect(client.picture).toHaveBeenCalled());
    fireEvent.click(tab('Horizon'));
    const asked = client.picture.mock.calls.length;
    await new Promise((r) => setTimeout(r, 350));
    expect(client.picture.mock.calls.length).toBe(asked);
  });
});
