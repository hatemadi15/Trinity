import { describe, expect, it } from 'vitest';
import { cameraPresetFor } from './cameraPresets';

const site = { lat: -89.78, lon: -156.26 };

describe('cameraPresetFor', () => {
  it('globe preset sits 3.2 units out, above the south pole side, looking at the origin', () => {
    const p = cameraPresetFor('globe', site, false);
    expect(Math.hypot(...p.position)).toBeCloseTo(3.2, 9);
    expect(p.position[1]).toBeLessThan(0); // southern hemisphere side (south pole is -y)
    expect(p.target).toEqual([0, 0, 0]);
    expect(p.durationMs).toBe(600);
  });
  it('terrain preset is above the ground to the south-east of the site', () => {
    const p = cameraPresetFor('terrain', site, false);
    expect(p.position[1]).toBeGreaterThan(0);
    expect(p.position[0]).toBeGreaterThan(0);
    expect(p.position[2]).toBeGreaterThan(0);
    expect(p.target).toEqual([0, 0, 0]);
  });
  it('camera preset is applied without animation under reduced motion', () => {
    expect(cameraPresetFor('globe', site, true).durationMs).toBe(0);
    expect(cameraPresetFor('terrain', site, true).durationMs).toBe(0);
  });
});
