// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SceneState } from '@/lib/viz/scene-state';
import { GroundPanel } from './GroundPanel';

const scene = { sunDirLocal: [0, 0.1, -1], earthDirLocal: [1, 0.1, 0], sunDirMoon: [1, 0, 0], earthDirMoon: [0, 1, 0], sunAz: 0, sunEl: 2, earthAz: 90, earthEl: 3, skylineAtSun: 0, skylineAtEarth: 0, light: { intensity: 1, castShadow: true }, earthVisible: true } as SceneState;
const site = { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, category: 'artemis3', polar: true, source: 'x' };

function show(extra: Partial<Parameters<typeof GroundPanel>[0]> = {}) {
  const onMode = vi.fn();
  const onExaggeration = vi.fn();
  render(
    <GroundPanel
      site={site}
      sites={[site]}
      scene={scene}
      mode="terrain"
      exaggeration={1}
      heightmap={null}
      capHeightmap={null}
      textureUrl={null}
      terrainState="unavailable"
      windowLoading={false}
      customError={null}
      when="2 Jan 2027, 06:00 UTC"
      onMode={onMode}
      onExaggeration={onExaggeration}
      onPick={() => {}}
      reducedMotion={false}
      {...extra}
    />,
  );
  return { onMode, onExaggeration };
}

describe('GroundPanel', () => {
  it('titles the picture, says which hour it shows and mounts the 3D view', async () => {
    show();
    const panel = screen.getByRole('region', { name: 'The ground' });
    expect(panel.textContent).toMatch(/2 Jan 2027, 06:00 UTC/);
    // jsdom has no WebGL: the 3D view shows its fallback, which proves it mounted with the site.
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3D view is not available/));
    // The fallback names the site as the page does and points at what still shows it.
    expect(screen.getByRole('status').textContent).toMatch(/de Gerlache Rim 2 is still shown in the chart above/);
    expect(screen.getByRole('status').textContent).not.toMatch(/Artemis III region|sky-dome/);
  });

  it('switches between the terrain and the globe, and between true and tripled heights', () => {
    const { onMode, onExaggeration } = show();
    expect(screen.getByRole('button', { name: 'Terrain' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Globe' }));
    expect(onMode).toHaveBeenCalledWith('globe');
    fireEvent.click(screen.getByRole('button', { name: 'Heights ×3' }));
    expect(onExaggeration).toHaveBeenCalledWith(3);
  });

  it('says in plain words what the picture is made from', () => {
    show({ heightmap: { meta: { cell_m: 20, width: 1024, height: 1024 } } as never, terrainState: 'ready' });
    expect(screen.getByRole('region', { name: 'The ground' }).textContent).toMatch(/NASA elevation data at 20 m per pixel, 20\.48 km across\. Drag to turn, scroll to zoom\. The light follows the time bar\./);
  });

  it('explains the globe and reports a place that cannot be worked out', () => {
    show({ mode: 'globe', customError: 'no DEM coverage north of 60S (lat -40.00)' });
    const text = screen.getByRole('region', { name: 'The whole Moon' }).textContent ?? '';
    expect(text).toMatch(/Click any point south of 60° S to get its own forecast\./);
    expect(screen.getByRole('alert').textContent).toMatch(/That place cannot be worked out: this tool covers the Moon south of 60° S/);
    expect(screen.queryByRole('button', { name: 'Heights ×3' })).toBeNull();
  });

  it('says so while the terrain loads', () => {
    show({ terrainState: 'loading' });
    expect(screen.getByRole('region', { name: 'The ground' }).textContent).toMatch(/Loading the terrain…/);
  });

  it('says what the coarse model shows and what it cannot, without promising more', () => {
    const cap = { meta: { cell_m: 960 }, heightsM: new Float32Array(0) } as unknown as Parameters<typeof GroundPanel>[0]['capHeightmap'];
    show({ terrainState: 'ready', capHeightmap: cap });
    const text = screen.getByRole('region', { name: 'The ground' }).textContent ?? '';
    expect(text).toMatch(/NASA elevation data at 960 m per pixel, 48 km around the site: too coarse to show its own slopes\. The light follows the time bar\./);
    expect(text).not.toMatch(/yet/);
  });

  it('names itself after what it shows: the ground, or the whole Moon', () => {
    show({ mode: 'globe' });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('The whole Moon');
    expect(screen.getByRole('region', { name: 'The whole Moon' })).toBeTruthy();
  });
});
