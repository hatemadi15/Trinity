import { describe, expect, it } from 'vitest';
import { markerLabel } from './SiteMarker';

describe('markerLabel', () => {
  it('keeps the part of a featured site name before the first comma', () => {
    expect(markerLabel('Shackleton crater rim, highest point 8.5–12.0 km')).toBe('Shackleton crater rim');
    expect(markerLabel('Malapert massif')).toBe('Malapert massif');
  });
  it('labels custom sites plainly instead of cutting their coordinates in half', () => {
    expect(markerLabel('Custom site -78.830°, -121.449°')).toBe('Custom site');
  });
});
