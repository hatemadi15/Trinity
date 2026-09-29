import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('aiMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to live, or to cached when NEXT_PUBLIC_AI_MODE says so, and can be switched', () => {
    expect(createExploreStore(unused).getState().aiMode).toBe('live');
    const s = createExploreStore(unused);
    s.getState().setAiMode('cached');
    expect(s.getState().aiMode).toBe('cached');
    vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'cached');
    expect(createExploreStore(unused).getState().aiMode).toBe('cached');
  });
});
