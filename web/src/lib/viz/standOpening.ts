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

/**
 * Where the resident may stand (spec 20.2): 8 to 10 m from the eye, up to 25° round from straight behind you as you
 * face the lander, tried 5° apart; its middle 0.85 m or more from a rock's edge, so no rock stands against it, and no
 * rock within 0.3 m of the line between it and the eye, so none hides it.
 */
const RESIDENT = { NEAR_M: 8, FAR_M: 10, ROUND_DEG: 25, STEP_DEG: 5, CLEAR_M: 0.85, SIGHT_M: 0.3 } as const;

/** A number from 0 to 1 for a seed and a key, the same each time: an integer hash of the two. */
function unit(seed: number, key: number): number {
  let h = (seed ^ Math.imul(key + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The resident (spec 20.2): a small creature on the ground behind you as the view opens, so a visitor finds it only by
 * turning round. It stands on the far side of you from the lander, which the opening view holds at every hour (the view
 * opens 5° to 18° beside it, then turns at most 30° towards a hill), so it lies 120° or more round from the opening's
 * middle; and up to 25° round from straight behind, towards the Sun's side (`lander.azDeg + 180` and less), as your own
 * shadow falls 20° to 40° the other way. How far out (8 to 10 m) and how far round come from the site's seed, so it
 * stands in the same place on every visit; where a rock (`rocks`, the scene's boulders) stands on that spot or between
 * it and the eye, it steps 5° at a time on towards 25° round, then back the other way, and with no clear spot in the
 * band it stands where the band is clearest. Azimuth clockwise from north, x east, z south.
 */
export function standResident(lander: Pick<NonNullable<StandScene['lander']>, 'azDeg'>, rocks: { x: number; z: number; r: number }[], seed: number): { azDeg: number; distM: number; x: number; z: number } {
  const distM = RESIDENT.NEAR_M + (RESIDENT.FAR_M - RESIDENT.NEAR_M) * unit(seed, 0);
  const first = -RESIDENT.ROUND_DEG * unit(seed, 1);
  // The turns to try, from straight behind: the seed's own, then on to 25° round, then back from it towards none.
  const turns = [first];
  for (let t = first - RESIDENT.STEP_DEG; t >= -RESIDENT.ROUND_DEG - 1e-9; t -= RESIDENT.STEP_DEG) turns.push(t);
  for (let t = first + RESIDENT.STEP_DEG; t <= 1e-9; t += RESIDENT.STEP_DEG) turns.push(t);
  const at = (t: number) => {
    const azDeg = (((lander.azDeg + 180 + t) % 360) + 360) % 360, a = (azDeg * Math.PI) / 180;
    return { azDeg, distM, x: distM * Math.sin(a), z: -distM * Math.cos(a) };
  };
  // How far a spot is from the nearest rock's reach, metres: to standing on it, or to the line from the eye passing it.
  const room = (p: { x: number; z: number }) =>
    rocks.reduce((least, b) => {
      const s = Math.max(0, Math.min(1, (b.x * p.x + b.z * p.z) / (distM * distM)));
      const sight = Math.hypot(b.x - s * p.x, b.z - s * p.z) - (b.r + RESIDENT.SIGHT_M);
      return Math.min(least, sight, Math.hypot(b.x - p.x, b.z - p.z) - (b.r + RESIDENT.CLEAR_M));
    }, Infinity);
  let best = at(first), most = -Infinity;
  for (const t of turns) {
    const p = at(t), r = room(p);
    if (r >= 0) return p;
    if (r > most) [best, most] = [p, r];
  }
  return best;
}
