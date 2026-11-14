// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TerrainQuality } from '@/lib/uncertainty/budget';
import { GroundQuality, groundWords } from './GroundQuality';

const ridge: TerrainQuality = { height_error_m: 0.189, effective_resolution_m: 15.96, slope_deg: 0.489, slope_error_deg: 0.394, roughness_100m_m: 0.404, nearest_psr_km: 0.1, psr_search_km: 10 };

describe('GroundQuality', () => {
  it('describes the ground at a site in one line, with the numbers a planner checks', () => {
    expect(groundWords(ridge)).toBe(
      'The ground here, from NASA’s adjusted south-pole maps: slope 0.5° (±0.4°), height known to ±0.2 m, detail to about 16 m, roughness 0.4 m across 100 m; permanently shadowed ground 0.1 km away.',
    );
  });

  it('says when no permanently shadowed ground lies within the distance searched, and leaves out what the maps lack', () => {
    expect(groundWords({ ...ridge, nearest_psr_km: null, roughness_100m_m: null })).toBe(
      'The ground here, from NASA’s adjusted south-pole maps: slope 0.5° (±0.4°), height known to ±0.2 m, detail to about 16 m; no permanently shadowed ground within 10 km.',
    );
  });

  it('draws one small line, and nothing for a site the maps do not cover', () => {
    const { container, rerender } = render(<GroundQuality q={ridge} />);
    const line = screen.getByText(/^The ground here/);
    expect(line.className).toMatch(/text-\[15px\]/);
    rerender(<GroundQuality q={null} />);
    expect(container.textContent).toBe('');
  });
});
