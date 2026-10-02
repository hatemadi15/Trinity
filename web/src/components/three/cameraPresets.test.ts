import { describe, expect, it } from 'vitest';
import { sphereToLatLon } from '@/lib/viz/three-frames';
import { cameraPresetFor } from './cameraPresets';

const site = { lat: -89.78, lon: -156.26 };

describe('cameraPresetFor', () => {
  it('globe preset sits 2.6 units out, close enough for the polar sites to stand apart, above the south pole side', () => {
    const p = cameraPresetFor('globe', site, false);
    expect(Math.hypot(...p.position)).toBeCloseTo(2.6, 9);
    // 15° from the site toward the equator: the polar sites sit near the middle of the picture, not on its edge.
    expect(sphereToLatLon(p.position).lat).toBeCloseTo(site.lat + 15, 6);
    expect(sphereToLatLon(p.position).lon).toBeCloseTo(site.lon, 6);
    expect(p.position[1]).toBeLessThan(0); // southern hemisphere side (south pole is -y)
    expect(p.target).toEqual([0, 0, 0]);
    expect(p.durationMs).toBe(600);
  });
  it('terrain preset frames the whole 20 km window from the south-east, 30-45 degrees up', () => {
    const p = cameraPresetFor('terrain', site, false);
    const dist = Math.hypot(...p.position);
    const elevationDeg = (Math.asin(p.position[1] / dist) * 180) / Math.PI;
    expect(dist).toBeGreaterThan(20);
    expect(dist).toBeLessThan(26);
    expect(elevationDeg).toBeGreaterThan(30);
    expect(elevationDeg).toBeLessThan(45);
    expect(p.position[0]).toBeGreaterThan(0);
    expect(p.position[2]).toBeGreaterThan(0);
    expect(p.target).toEqual([0, 0, 0]);
  });
  it('camera preset is applied without animation under reduced motion', () => {
    expect(cameraPresetFor('globe', site, true).durationMs).toBe(0);
    expect(cameraPresetFor('terrain', site, true).durationMs).toBe(0);
  });
});
