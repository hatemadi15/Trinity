// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { ExploreView } from './ExploreView';

const layer = async () => readJson<ColdTrapDoc>('data', 'coldtraps', 'coldtraps.json');

afterEach(() => window.history.replaceState({}, '', '/'));

describe('Explore with the modelled cold traps', () => {
  it('describes the cold traps near the site where the site is described', async () => {
    window.history.replaceState({}, '', '/explore');
    render(<ExploreView store={createExploreStore(fileLoaders())} navigate={() => {}} coldTraps={layer} />);
    const place = await waitFor(() => screen.getByRole('region', { name: 'Where on the Moon' }), { timeout: 20_000 });
    // The default site, de Gerlache Rim 2, has no cold ground within 5 km in the model.
    await waitFor(() => expect(place.textContent).toMatch(/Modelled cold traps: no ground within 5\skm stays below 110\sK \(−163\s°C\) all year in NASA’s Diviner temperature model; the nearest that does, with conditions where ice could last, is 6\.7\skm away\./));
  });

  it('works without the layer', async () => {
    window.history.replaceState({}, '', '/explore');
    render(
      <ExploreView
        store={createExploreStore(fileLoaders())}
        navigate={() => {}}
        coldTraps={async () => {
          throw new Error('HTTP 404');
        }}
      />,
    );
    const place = await waitFor(() => screen.getByRole('region', { name: 'Where on the Moon' }), { timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 20));
    expect(place.textContent).not.toMatch(/cold traps/);
  });
});
