// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { ExploreView } from './ExploreView';

afterEach(cleanup);

describe('Explore for a site whose horizon file is missing', () => {
  it('names the site, says in plain words what is missing, and offers the way to another site, with no figures of the site before', async () => {
    window.history.replaceState({}, '', '/explore?site=nobile_rim_2');
    const files = fileLoaders();
    const store = createExploreStore(
      fileLoaders({
        loadMask: (id: string) => (id === 'nobile_rim_2' ? Promise.reject(new Error('could not load /data/masks/nobile_rim_2.json (HTTP 404)')) : files.loadMask(id)),
      }),
    );
    render(<ExploreView store={store} navigate={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nobile Rim 2'), { timeout: 20_000 });
    const main = screen.getByRole('main');
    expect(main.textContent).toMatch(/its horizon file is not on this server, so its forecast cannot be shown here\. The other sites still work\./);
    expect(main.textContent).not.toMatch(/\/data\/|HTTP|\.json/);
    expect(main.textContent).not.toMatch(/de Gerlache/);
    expect(screen.getByRole('link', { name: 'Choose another site' }).getAttribute('href')).toBe('/sites');
  });
});
