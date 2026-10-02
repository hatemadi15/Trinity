import { rowVectors, type Ephemeris } from '../engine/ephemeris';
import { siteVectorKm } from '../engine/geometry';
import { maskAtAzimuth, type Series } from '../engine/metrics';
import { dirFromAzEl, moonToThree, sunLight } from './three-frames';

/** Everything the 3D scene needs at one scrubber position. Directions are unit vectors in Three coordinates. */
export interface SceneState {
  /** Sun direction in the local site frame (east +x, up +y, north −z). */
  sunDirLocal: [number, number, number];
  earthDirLocal: [number, number, number];
  /** Sun direction in the Moon-centred frame (moonToThree of the MOON_ME vector). */
  sunDirMoon: [number, number, number];
  earthDirMoon: [number, number, number];
  sunAz: number;
  sunEl: number;
  earthAz: number;
  earthEl: number;
  /** Terrain skyline elevation (deg) at the Sun's and the Earth's azimuth. */
  skylineAtSun: number;
  skylineAtEarth: number;
  light: { intensity: number };
  earthVisible: boolean;
}

function unitMoonToThree(v: ArrayLike<number>): [number, number, number] {
  const r = Math.hypot(v[0], v[1], v[2]);
  return moonToThree([v[0] / r, v[1] / r, v[2] / r]);
}

/** Unit vector pointing up (away from the Moon's centre) at a site, in Three coordinates. */
export function siteUpThree(lat: number, lon: number): [number, number, number] {
  return unitMoonToThree(siteVectorKm(lat, lon));
}

/**
 * Scene inputs for row `series.i0 + cursor`: local directions from the series az/el, Moon-frame
 * directions from the ephemeris row, and the Sun light from the skyline at the Sun's azimuth.
 */
export function sceneStateAt(eph: Ephemeris, series: Series, mask: ArrayLike<number>, cursor: number): SceneState {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= series.hours) {
    throw new RangeError(`cursor ${cursor} outside 0..${series.hours - 1}`);
  }
  const sunAz = series.sunAz[cursor], sunEl = series.sunEl[cursor];
  const earthAz = series.earthAz[cursor], earthEl = series.earthEl[cursor];
  const { sun, earth } = rowVectors(eph, series.i0 + cursor);
  const skylineAtSun = maskAtAzimuth(mask, sunAz);
  const skylineAtEarth = maskAtAzimuth(mask, earthAz);
  return {
    sunDirLocal: dirFromAzEl(sunAz, sunEl),
    earthDirLocal: dirFromAzEl(earthAz, earthEl),
    sunDirMoon: unitMoonToThree(sun),
    earthDirMoon: unitMoonToThree(earth),
    sunAz, sunEl, earthAz, earthEl,
    skylineAtSun, skylineAtEarth,
    light: sunLight(sunEl, skylineAtSun),
    earthVisible: series.earthVisible[cursor] === 1,
  };
}
