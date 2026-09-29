import { latLonToSphere } from '@/lib/viz/three-frames';

export type SceneMode = 'globe' | 'terrain';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  durationMs: number;
}

/**
 * Where the camera goes when the mode or site changes. Globe: 3.2 units out on the site's
 * meridian, 35° north of the south pole so the pole faces the viewer. Terrain: 12 km east,
 * 12 km south and 8 km up, looking at the site (scene units are km, x = east, z = south).
 */
export function cameraPresetFor(mode: SceneMode, site: { lat: number; lon: number }, reducedMotion: boolean): CameraPreset {
  const durationMs = reducedMotion ? 0 : 600;
  if (mode === 'globe') {
    const lat = Math.min(-20, Math.max(-90, site.lat) + 35);
    return { position: latLonToSphere(lat, site.lon, 3.2), target: [0, 0, 0], durationMs };
  }
  return { position: [12, 8, 12], target: [0, 0, 0], durationMs };
}
