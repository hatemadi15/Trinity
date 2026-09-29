// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createExploreStore } from '@/lib/store/explore';
import { DataError } from '@/lib/data/loaders';
import { ExploreView } from './ExploreView';

describe('ExploreView', () => {
  it('renders the data-missing state', async () => {
    const store = createExploreStore({
      loadSites: async () => {
        throw new DataError('/data/sites.json', 404);
      },
      loadEphemeris: async () => {
        throw new DataError('/data/ephemeris/x', 404);
      },
      loadMask: async () => {
        throw new DataError('/data/masks/x', 404);
      },
    });
    render(<ExploreView store={store} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/sync-local --tiles/));
  });
});
