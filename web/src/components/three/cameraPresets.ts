import { latLonToSphere } from '@/lib/viz/three-frames';

export type SceneMode = 'globe' | 'terrain';

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  durationMs: number;
}

/**
 * Where the camera goes when the mode or site changes. Globe: 2.6 units out on the site's
 * meridian, 15° from the site toward the equator, so a polar site and its neighbours sit near the
 * middle of the picture (and never north of 20° S). Terrain: 10 km east,
 * 15 km south and 13 km up (22 km out, 36° above the ground), which frames the whole 20 km
 * window and its shadows while looking at the site (scene units are km, x = east, z = south).
 */
export function cameraPresetFor(mode: SceneMode, site: { lat: number; lon: number }, reducedMotion: boolean): CameraPreset {
  const durationMs = reducedMotion ? 0 : 600;
  if (mode === 'globe') {
    const lat = Math.min(-20, Math.max(-90, site.lat) + 15);
    return { position: latLonToSphere(lat, site.lon, 2.6), target: [0, 0, 0], durationMs };
  }
  return { position: [10, 13, 15], target: [0, 0, 0], durationMs };
}
