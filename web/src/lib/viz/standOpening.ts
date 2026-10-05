import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import type { StandScene } from '../sky/standRenderer';

/**
 * The lander stands where it landed, at the period's first hour: 16 m away, 40° to the left of the Sun then
 * (or of Earth when the period starts in the dark; 20° on a tall screen, whose view is narrower), whatever
 * hour the view opens on. It is turned so its solar panel faces that Sun, its +x face 75° left of it. The
 * view opens 35° left of the Sun, so the Sun stands near the view's right edge and the lander just right of
 * the answer's panel, and the ground before you is lit from the side, not from behind; on a tall screen 15°
 * left of the Sun, so the lander stands near the middle, 5° left of it, and the Sun towards the right edge.
 * The stand view places it so, and the home page's arrival lands beside it there.
 */
export const LANDER_DIST_M = 16;
const LANDER_FACE_LEFT_DEG = 75;
const landerFromSun = (tall: boolean) => (tall ? -20 : -40);
const openFromSun = (tall: boolean) => (tall ? landerFromSun(true) + 5 : -35);

/** What the first view looks towards: the Sun when any of it is up, else Earth when it is in view, else where the Sun is. */
export function openingAnchor(series: Pick<Series, 'sunFraction' | 'earthVisible' | 'sunAz' | 'earthAz'>, hour: number): number {
  if (series.sunFraction[hour] > 0) return series.sunAz[hour];
  if (series.earthVisible[hour] === 1) return series.earthAz[hour];
  return series.sunAz[hour];
}

/** The lander beside the site, placed by the period's first hour. */
export function standLander(series: Series, power: PowerResult, tall: boolean): NonNullable<StandScene['lander']> {
  return {
    azDeg: (openingAnchor(series, 0) + landerFromSun(tall) + 360) % 360,
    distM: LANDER_DIST_M,
    powered: power.powered,
    faceAzDeg: (series.sunAz[0] - LANDER_FACE_LEFT_DEG + 360) % 360,
    earthAzDeg: series.earthAz[0],
    earthElDeg: series.earthEl[0],
  };
}

/** Where the first view faces at `hour`: beside the Sun with a lander in view, on Earth (4° left) at night with Earth up. */
export function openingYaw(series: Series, hour: number, tall: boolean, withLander: boolean): number {
  const onEarth = series.sunFraction[hour] === 0 && series.earthVisible[hour] === 1;
  return (openingAnchor(series, hour) + (onEarth ? -4 : withLander ? openFromSun(tall) : 0) + 360) % 360;
}
