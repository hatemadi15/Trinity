// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Site } from '@/lib/data/loaders';
import { loadEphemeris, type EphemerisHeader } from '@/lib/engine/ephemeris';
import { readBytes, readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import { ExploreView } from './ExploreView';

function storeWithFiles() {
  const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
  const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
  const sites = [
    ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
    ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
  ];
  return createExploreStore({
    loadSites: async () => sites,
    loadEphemeris: async () => eph,
    loadMask: async (id) => {
      const m = readJson<{ elevation_deg: number[]; site_height_m: number; mast_m: number }>('data', 'masks', `${id}.json`);
      return { site_id: id, lat: 0, lon: 0, mast_m: m.mast_m, site_height_m: m.site_height_m, elevation_deg: m.elevation_deg, bands: [], fallback_bands: [] };
    },
  });
}

describe('ExploreView cockpit', () => {
  it('opens the planner settings as a popover from the top bar and closes it again', async () => {
    const store = storeWithFiles();
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.queryByRole('region', { name: 'Planner settings' })).toBeNull();
    const trigger = screen.getByRole('button', { name: /Planner settings/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog', { name: 'Planner settings' });
    expect(dialog.getAttribute('id')).toBe(trigger.getAttribute('aria-controls'));
    expect(screen.getByRole('region', { name: 'Planner settings' })).toBeTruthy();
    expect(dialog.contains(document.activeElement)).toBe(true); // focus moved in
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Planner settings' })).toBeNull();
    expect(document.activeElement).toBe(trigger); // and back out
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Planner settings' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Planner settings' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the Learn story inside the 3D view as a card', async () => {
    const store = storeWithFiles();
    store.getState().setAudience('learn');
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    const story = screen.getByRole('region', { name: 'Guided story' });
    expect(screen.getByRole('region', { name: '3D view' }).contains(story)).toBe(true);
    store.getState().setAudience('planner');
  });

  it('states the planner assumptions under the verdict', async () => {
    const store = storeWithFiles();
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.getByText(/4 m², 200 W load, 2000 Wh battery, Earth above 0°, mast 2 m/)).toBeTruthy();
  });

  it('keeps the site title inside the 3D view and the timeline in its own strip', async () => {
    const store = storeWithFiles();
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy());
    expect(screen.getByTestId('cockpit')).toBeTruthy();
    expect(screen.getByRole('region', { name: '3D view' }).contains(screen.getByRole('heading', { level: 1 }))).toBe(true);
    expect(screen.getByRole('region', { name: 'Timeline' }).contains(screen.getByTestId('readout'))).toBe(true);
    expect(screen.getByRole('region', { name: 'Sky dome' })).toBeTruthy();
  });
});
