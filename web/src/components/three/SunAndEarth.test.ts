import { describe, expect, it } from 'vitest';
import { shadowHalfKmFor } from './SunAndEarth';

describe('shadowHalfKmFor', () => {
  it('covers the whole terrain window plus a margin, in whole km', () => {
    expect(shadowHalfKmFor(20.48)).toBe(12);
    expect(shadowHalfKmFor(40.96)).toBe(22);
  });
  it('falls back to 14 km without a window', () => {
    expect(shadowHalfKmFor(null)).toBe(14);
  });
});
