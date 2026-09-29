// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SceneState } from '@/lib/viz/scene-state';
import { Scene3D, SceneErrorBoundary } from './Scene3D';

const scene: SceneState = {
  sunDirLocal: [0, 0.02, -1],
  earthDirLocal: [0, 0, 1],
  sunDirMoon: [1, 0, 0],
  earthDirMoon: [0, 0, 1],
  sunAz: 0,
  sunEl: 1.2,
  earthAz: 180,
  earthEl: 0.1,
  skylineAtSun: 0.5,
  skylineAtEarth: 0.5,
  light: { intensity: 1, castShadow: true },
  earthVisible: true,
};
const site = { id: 'a', name: 'Site A', lat: -89.7, lon: 10, category: 'classic', polar: true, source: '' };

describe('Scene3D', () => {
  it('renders the fallback when WebGL is unavailable', async () => {
    render(
      <Scene3D mode="globe" scene={scene} site={site} sites={[site]} heightmap={null} capHeightmap={null} exaggeration={1} />,
    );
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/3D view is not available/));
    expect(screen.getByRole('status').textContent).toMatch(/Site A/);
  });

  it('shows the same fallback panel when the scene throws instead of blanking the page', () => {
    const Boom = () => {
      throw new Error('shader failed');
    };
    render(
      <SceneErrorBoundary siteName="Site A">
        <Boom />
      </SceneErrorBoundary>,
    );
    expect(screen.getByRole('status').textContent).toMatch(/3D view is not available/);
    expect(screen.getByRole('status').textContent).toMatch(/Site A/);
  });
});
