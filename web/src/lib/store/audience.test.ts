// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { AUDIENCE_KEY, createExploreStore } from './explore';

const unused = {
  loadSites: async () => [],
  loadEphemeris: async () => {
    throw new Error('unused');
  },
  loadMask: async () => {
    throw new Error('unused');
  },
};

describe('audience', () => {
  it('defaults to planner, persists Learn mode in localStorage and reads it back', () => {
    window.localStorage.removeItem(AUDIENCE_KEY);
    const a = createExploreStore(unused);
    expect(a.getState().audience).toBe('planner');
    a.getState().setAudience('learn');
    expect(a.getState().audience).toBe('learn');
    expect(window.localStorage.getItem(AUDIENCE_KEY)).toBe('learn');
    const b = createExploreStore(unused);
    expect(b.getState().audience).toBe('learn');
    b.getState().setAudience('planner');
    expect(window.localStorage.getItem(AUDIENCE_KEY)).toBe('planner');
  });
  it('ignores garbage in storage', () => {
    window.localStorage.setItem(AUDIENCE_KEY, 'pirate');
    expect(createExploreStore(unused).getState().audience).toBe('planner');
    window.localStorage.removeItem(AUDIENCE_KEY);
  });
});
