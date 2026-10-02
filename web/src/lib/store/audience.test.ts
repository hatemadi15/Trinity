// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createExploreStore } from './explore';

const unused = {
  loadSites: async () => [],
  loadEphemeris: async () => {
    throw new Error('unused');
  },
  loadMask: async () => {
    throw new Error('unused');
  },
};

describe('the audience is gone', () => {
  it('has no audience in the store, and an old stored choice changes nothing', () => {
    window.localStorage.setItem('earthrise.audience', 'learn');
    const store = createExploreStore(unused);
    const state = store.getState() as unknown as Record<string, unknown>;
    expect('audience' in state).toBe(false);
    expect('setAudience' in state).toBe(false);
    expect('hydrateAudience' in state).toBe(false);
    window.localStorage.removeItem('earthrise.audience');
  });
});
