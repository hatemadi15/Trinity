import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import type { StandScene } from '../sky/standRenderer';

/**
 * The lander stands 16 m away, placed by the hour the view opens on, so the opening view holds it and what the view
 * faces (spec 16.3): 40° to the left of the Sun then (20° on a tall screen, whose view is narrower), or, when the
 * view opens at night on Earth, 22° to the left of Earth (10° on a tall screen), as that view is narrower still. Its
 * solar panel faces the Sun of the period's first hour, its +x face 75° left of it, and its dish that hour's Earth,
 * as a lander that landed then would. The view opens 35° left of the Sun, so the Sun stands near the view's right
 * edge and the lander just left of the middle, and the ground before you is lit from the side, not from behind; on
 * a tall screen 15° left of the Sun, so the lander stands near the middle, 5° left of it, and the Sun towards the
 * right edge. The home page's arrival lands beside it at the period's first hour.
 */
export const LANDER_DIST_M = 16;
const LANDER_FACE_LEFT_DEG = 75;
/** How far left of what the first view faces the lander stands: of the Sun (or where it is, in the dark), or of Earth at night. */
const landerFrom = (onEarth: boolean, tall: boolean) => (onEarth ? (tall ? -10 : -22) : tall ? -20 : -40);
const openFromSun = (tall: boolean) => (tall ? landerFrom(false, true) + 5 : -35);

/** What the first view looks towards: the Sun when any of it is up, else Earth when it is in view, else where the Sun is. */
export function openingAnchor(series: Pick<Series, 'sunFraction' | 'earthVisible' | 'sunAz' | 'earthAz'>, hour: number): number {
  if (series.sunFraction[hour] > 0) return series.sunAz[hour];
  if (series.earthVisible[hour] === 1) return series.earthAz[hour];
  return series.sunAz[hour];
}

/** The lander beside the site, placed by the hour the view opens on (`hour`, the period's first by default). */
export function standLander(series: Series, power: PowerResult, tall: boolean, hour = 0): NonNullable<StandScene['lander']> {
  const h = Math.min(series.hours - 1, Math.max(0, Math.round(hour)));
  const onEarth = series.sunFraction[h] === 0 && series.earthVisible[h] === 1;
  return {
    azDeg: (openingAnchor(series, h) + landerFrom(onEarth, tall) + 360) % 360,
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
