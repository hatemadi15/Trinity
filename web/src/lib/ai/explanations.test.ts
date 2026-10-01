import { describe, expect, it } from 'vitest';
import { explanationFor } from './explanations';

describe('explanations', () => {
  it('explains the best window as the landing date with the longest time with power', () => {
    const e = explanationFor('best 30-day window');
    expect(e?.topic).toBe('best window');
    expect(e?.text).toMatch(/keeps power the longest/);
    expect(e?.text).toMatch(/a lander arrives in daylight/);
    expect(e?.text).not.toMatch(/scores highest/);
  });
});
