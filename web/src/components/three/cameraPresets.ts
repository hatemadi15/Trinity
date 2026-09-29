import { latLonToSphere } from '@/lib/viz/three-frames';

export type SceneMode = 'globe' | 'terrain';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  durationMs: number;
}

/**
 * Where the camera goes when the mode or site changes. Globe: 3.6 units out on the site's
 * meridian, 35° north of the south pole so the pole faces the viewer. Terrain: 10 km east,
 * 15 km south and 13 km up (22 km out, 36° above the ground), which frames the whole 20 km
 * window and its shadows while looking at the site (scene units are km, x = east, z = south).
 */
export function cameraPresetFor(mode: SceneMode, site: { lat: number; lon: number }, reducedMotion: boolean): CameraPreset {
  const durationMs = reducedMotion ? 0 : 600;
  if (mode === 'globe') {
    const lat = Math.min(-20, Math.max(-90, site.lat) + 35);
    return { position: latLonToSphere(lat, site.lon, 3.6), target: [0, 0, 0], durationMs };
  }
  return { position: [10, 13, 15], target: [0, 0, 0], durationMs };
}
