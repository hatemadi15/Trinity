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
 * right edge. Given the site's skyline, the view then turns up to 30° towards the highest hill it can bring into the
 * frame with the Sun and the lander still in it (spec 18.4). The home page's arrival lands beside it at the period's
 * first hour.
 */
export const LANDER_DIST_M = 16;
const LANDER_FACE_LEFT_DEG = 75;
/** How far left of what the first view faces the lander stands: of the Sun (or where it is, in the dark), or of Earth at night. */
const landerFrom = (onEarth: boolean, tall: boolean) => (onEarth ? (tall ? -10 : -22) : tall ? -20 : -40);
const openFromSun = (tall: boolean) => (tall ? landerFrom(false, true) + 5 : -35);
/** How far the opening view may turn towards a hill, degrees either way (18.4). */
const HILL_TURN_DEG = 30;
/** How far inside the frame's edge a hill, the Sun or the lander must stand to count as in view, degrees. */
const HILL_MARGIN_DEG = 6;

/** The site's skyline: the hills' height above level at each azimuth from `az0` on, every `step` degrees. */
export type Skyline = { az0: number; step: number; el: ArrayLike<number> };

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

/** The angle from one azimuth to another, degrees, from -180 to 180. */
const between = (fromDeg: number, toDeg: number) => ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;

/**
 * The turn, in whole degrees within `range`, that brings the skyline's highest point it can reach into the frame
 * (`halfWidthDeg` each side of the yaw, less a 6° margin, so the hill stands clear of the edge): the smallest turn
 * that shows the highest point; 0 when the highest point in reach is already in frame, when the skyline is level, and
 * without a skyline (18.4).
 */
export function hillShift(mask: Skyline, yawDeg: number, halfWidthDeg: number, range: [number, number]): number {
  const n = mask.el.length;
  const reach = halfWidthDeg - HILL_MARGIN_DEG;
  if (n === 0 || reach <= 0) return 0;
  // The highest point of the skyline within reach of a yaw.
  const highest = (yaw: number) => {
    let top = -Infinity;
    for (let i = 0; i < n; i++) if (Math.abs(between(yaw, mask.az0 + i * mask.step)) <= reach) top = Math.max(top, mask.el[i]);
    return top;
  };
  const lo = Math.ceil(Math.min(range[0], range[1])), hi = Math.floor(Math.max(range[0], range[1]));
  let best = 0, bestTop = highest(yawDeg);
  for (let s = lo; s <= hi; s++) {
    if (s === 0) continue;
    const top = highest(yawDeg + s);
    if (top > bestTop + 1e-9 || (Math.abs(top - bestTop) <= 1e-9 && Math.abs(s) < Math.abs(best))) {
      best = s;
      bestTop = top;
    }
  }
  return best;
}

/**
 * Where the first view faces at `hour`: beside the Sun with a lander in view, on Earth (4° left) at night with Earth
 * up; and, given the site's skyline and the view's half-width, turned up to 30° towards the skyline's highest point,
 * the Sun (or its place, in the dark) and the lander kept 6° inside the frame (18.4); never when the view opens on
 * Earth, whose hill is in frame already.
 */
export function openingYaw(series: Series, hour: number, tall: boolean, withLander: boolean, mask?: Skyline, halfWidthDeg?: number): number {
  const onEarth = series.sunFraction[hour] === 0 && series.earthVisible[hour] === 1;
  const base = (openingAnchor(series, hour) + (onEarth ? -4 : withLander ? openFromSun(tall) : 0) + 360) % 360;
  if (!mask || halfWidthDeg === undefined || onEarth) return base;
  // Where the Sun and the lander stand against the view's middle, degrees to the right.
  const sunRel = withLander ? -openFromSun(tall) : 0;
  const landerRel = withLander ? landerFrom(false, tall) - openFromSun(tall) : 0;
  const inside = halfWidthDeg - HILL_MARGIN_DEG;
  // A turn `s` to the right moves each of them `s` to the left in the frame: the view may turn left until the Sun,
  // right of the middle, meets the right edge, and right until the lander, left of the middle, meets the left edge.
  const range: [number, number] = [Math.max(-HILL_TURN_DEG, Math.max(sunRel, landerRel) - inside), Math.min(HILL_TURN_DEG, Math.min(sunRel, landerRel) + inside)];
  if (range[0] > range[1]) return base;
  return (base + hillShift(mask, base, halfWidthDeg, range) + 360) % 360;
}
