import * as THREE from 'three';
import { R_MOON_M } from '../engine/constants';
import { SITE, smoother, STOPS } from './arrivalTiming';
import { dirAzEl, meToWorld, type Basis, type Vec3 } from './frames';

export * from './arrivalTiming';

const DEG = Math.PI / 180;

/** A camera: where it is (world metres), which way it looks (three's x, y, z, w), how wide (degrees, top to bottom), and a lens shift (fractions of the view; + moves the picture right and up). */
export interface Pose { position: Vec3; quaternion: [number, number, number, number]; fov: number; shift: [number, number] }
/** One stop of the flight: where the camera is, the point it looks at, the view's up, how wide and the lens shift. */
export interface Key { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; fov: number; shift: [number, number] }
/**
 * Where the camera looks at an hour of the month at the site: compass bearing and height (degrees), how wide, and
 * how far right of the view's middle the lander stands (degrees; the camera stands back from it so that it does).
 */
export interface Aim { hour: number; yaw: number; pitch: number; fov: number; right: number }
/** What the flight is built from, in the stand view's world frame (x east, y up, z south, metres, origin on the site's ground). */
export interface PathInput {
  basis: Basis;
  siteHeightM: number;
  /** Unit vector to the Sun at the arrival's hour. */
  sun: Vec3;
  /** Earth's place at the arrival's hour (world metres). */
  earth: Vec3;
  /** The drawn ground's height (world y) at a point: the flight keeps above it. */
  groundAt: (x: number, z: number) => number;
  /** Width over height of the view. */
  aspect: number;
  /** Where the lander stands (world metres; the ground under its middle): the flight lands beside it. */
  lander: { x: number; z: number };
  /** Where the camera looks through the month at the site, hour by hour (siteTrack); without it the flight ends on landing. */
  track?: Aim[];
}

/**
 * The flight's numbers, set by eye at the visual check within the tests' rules: the whole Moon from 9,000 km
 * with Earth beyond its south pole; the pole from 900 km; the cap from 90 km up, 150 km back, lit from the
 * side; the ridge from 2 km up, 5 km back on the side away from the Sun, looking past the site at a point
 * ridgeAhead beyond it, the Sun just over the hills ridgeSun degrees right of the middle on a wide screen; then
 * beside the lander. Metres and degrees.
 */
export const FLIGHT = { wholeDist: 9.0e6, wholeTilt: 14, poleAlt: 9.0e5, poleFov: 40, capBack: 1.5e5, capAlt: 9.0e4, capFov: 50, ridgeBack: 5000, ridgeClear: 2000, ridgeAhead: 10000, ridgeSun: 10, ridgeFov: 45, wideShift: 0.17, tallShift: -0.22 } as const;

/**
 * The shot beside the lander, from landing to the end of the month at the site, by the view's shape: where the
 * lander's middle stands (degrees right of the view's middle and below level, metres away: the camera stands a few
 * metres up behind it), the camera's pitch and the view's height (degrees), and how far right of the middle the
 * Sun and Earth stand when the story is about them. On a wide screen the lander stands right of the words' column
 * (it ends just short of the middle), whole, so no card scrolling by at the left ever covers it, and the Sun or Earth
 * further right, in view on a screen as narrow as 4:3. On a phone, whose view is narrow, the lander stands under the
 * Sun or Earth, above the words at the bottom; at the end the view tips up, so it stands under the answer's card at
 * the top, the Sun beyond the right edge lighting it from the side.
 */
export const BESIDE = {
  wide: { right: 12, below: 13, dist: 14, pitch: 2, fov: 60, sun: 34, earth: 26, end: { right: 12, sun: 34, pitch: 2 } },
  tall: { right: -4, below: 8, dist: 16, pitch: -2, fov: 80, sun: 10, earth: 8, end: { right: -4, sun: 70, pitch: 14 } },
} as const;
/** The lander's middle over the ground under it (it is 3.4 m tall), metres. */
const LANDER_MID_M = 1.6;
/** The least the camera keeps over the ground beside the lander, metres. */
const BESIDE_CLEAR_M = 2;
const shot = (i: { aspect: number }) => (i.aspect < 1 ? BESIDE.tall : BESIDE.wide);

const V = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);
/** On a wide screen what a beat is about stands right of the middle, clear of the words at the left; on a phone, in the middle. */
const aside = (i: PathInput): [number, number] => (i.aspect >= 1 ? [FLIGHT.wideShift, 0] : [0, 0]);
const tallFov = (fov: number, aspect: number) => (aspect >= 1 ? fov : Math.min(80, (2 * Math.atan(Math.tan((fov * DEG) / 2) / Math.max(aspect, 0.45))) / DEG));

export const moonCentre = (siteHeightM: number) => new THREE.Vector3(0, -(R_MOON_M + siteHeightM), 0);
const southOf = (i: PathInput) => V(meToWorld(i.basis, [0, 0, -1]));
export function polePoint(i: PathInput): Vec3 {
  const p = moonCentre(i.siteHeightM).addScaledVector(southOf(i), R_MOON_M);
  return [p.x, p.y, p.z];
}

function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, f: number): THREE.Vector3 {
  const d = Math.min(1, Math.max(-1, a.dot(b))), th = Math.acos(d);
  if (th < 1e-9) return a.clone().lerp(b, f).normalize();
  const s = Math.sin(th);
  return a.clone().multiplyScalar(Math.sin((1 - f) * th) / s).addScaledVector(b, Math.sin(f * th) / s);
}

/**
 * The whole Moon from the far side, tilted towards the south pole, so Earth stands just beyond the pole's limb:
 * north up, as most pictures of the Moon show it, so the south pole is at the bottom and Earth below it.
 */
function wholeMoon(i: PathInput): Key {
  const C = moonCentre(i.siteHeightM), E = V(i.earth), toEarth = E.clone().sub(C).normalize(), anti = toEarth.clone().negate();
  const towardsPole = southOf(i).addScaledVector(anti, -southOf(i).dot(anti)).normalize();
  const t = FLIGHT.wholeTilt * DEG;
  const from = C.clone().addScaledVector(anti.multiplyScalar(Math.cos(t)).addScaledVector(towardsPole, Math.sin(t)).normalize(), FLIGHT.wholeDist);
  const toC = C.clone().sub(from).normalize(), toE = E.clone().sub(from).normalize();
  const rho = Math.asin(R_MOON_M / FLIGHT.wholeDist), sep = toC.angleTo(toE), earthR = Math.asin(6371e3 / E.distanceTo(from));
  const span = rho + sep + earthR; // from the far limb to Earth's far edge
  const look = toC.clone().applyAxisAngle(new THREE.Vector3().crossVectors(toC, toE).normalize(), span / 2 - rho);
  const up = toE.clone().addScaledVector(look, -toE.dot(look)).normalize().negate(); // Earth towards the bottom
  const tall = i.aspect < 1;
  const fov = Math.max((span / DEG) * 1.25, tall ? (2 * Math.atan(Math.tan(rho * 1.2) / i.aspect)) / DEG : 0);
  // On a wide screen the Moon sits right of the middle, clear of the words, as far as the view's width allows:
  // in a view barely wider than tall the shift gives way, so the whole disc stays in view.
  const half = (Math.tan(rho) * 1.04) / (i.aspect * Math.tan((fov * DEG) / 2));
  const wide = Math.max(0, Math.min(FLIGHT.wideShift, (0.96 - half) / 2));
  return { position: from, target: from.clone().addScaledVector(look, FLIGHT.wholeDist), up, fov, shift: tall ? [0, FLIGHT.tallShift] : [wide, 0] };
}

/**
 * Straight down on the south pole, the far side at the top: from the whole Moon (north up) the camera pitches
 * down onto the pole, and from here it pitches up onto the cap, which it looks across towards the far side,
 * so the picture never rolls over.
 */
function abovePole(i: PathInput): Key {
  const C = moonCentre(i.siteHeightM), south = southOf(i), toEarth = V(i.earth).sub(C).normalize();
  return { position: C.clone().addScaledVector(south, R_MOON_M + FLIGHT.poleAlt), target: V(polePoint(i)), up: toEarth.addScaledVector(south, -toEarth.dot(south)).normalize().negate(), fov: tallFov(FLIGHT.poleFov, i.aspect), shift: aside(i) };
}

/** Square to the Sun along the ground, on the side away from the pole: the camera looks past the site at it. */
function capSide(i: PathInput): THREE.Vector3 {
  const along = new THREE.Vector3(i.sun[0], 0, i.sun[2]).normalize(), side = new THREE.Vector3(-along.z, 0, along.x);
  const pole = polePoint(i);
  if (side.dot(new THREE.Vector3(pole[0], 0, pole[2]).normalize()) > 0) side.negate();
  return side;
}

function overCap(i: PathInput, side: THREE.Vector3): Key {
  const from = side.clone().multiplyScalar(FLIGHT.capBack).setY(FLIGHT.capAlt);
  return { position: from, target: V(polePoint(i)).lerp(new THREE.Vector3(0, i.groundAt(0, 0), 0), 0.5), up: new THREE.Vector3(0, 1, 0), fov: tallFov(FLIGHT.capFov, i.aspect), shift: aside(i) };
}

/**
 * Over the ridge, on the side away from the Sun: the camera looks past the site towards the Sun, so the words'
 * "the Sun stands just above the hills" is in the picture, the site below it; and it comes down from here behind the
 * lander, as the view beside it looks, so the lander comes into view right of the words.
 */
function overRidge(i: PathInput): Key {
  const sunAz = (Math.atan2(i.sun[0], -i.sun[2]) / DEG + 360) % 360, toward = V(dirAzEl(sunAz - (i.aspect >= 1 ? FLIGHT.ridgeSun : 0), 0));
  const from = toward.clone().multiplyScalar(-FLIGHT.ridgeBack);
  from.y = i.groundAt(from.x, from.z) + FLIGHT.ridgeClear;
  const target = toward.clone().multiplyScalar(FLIGHT.ridgeAhead);
  target.y = i.groundAt(0, 0);
  return { position: from, target, up: new THREE.Vector3(0, 1, 0), fov: tallFov(FLIGHT.ridgeFov, i.aspect), shift: aside(i) };
}

/**
 * The camera beside the lander for an aim: back from the lander's middle along the bearing that puts it `right` of
 * the view's middle and `below` level, a few metres up, never closer to the ground than BESIDE_CLEAR_M.
 */
function besideAt(i: PathInput, a: { yaw: number; pitch: number; right: number }): { position: THREE.Vector3; look: THREE.Vector3 } {
  const b = shot(i), mid = new THREE.Vector3(i.lander.x, i.groundAt(i.lander.x, i.lander.z) + LANDER_MID_M, i.lander.z);
  const position = mid.addScaledVector(V(dirAzEl(a.yaw + a.right, -b.below)), -b.dist);
  position.y = Math.max(position.y, i.groundAt(position.x, position.z) + BESIDE_CLEAR_M);
  return { position, look: V(dirAzEl(a.yaw, a.pitch)) };
}

/** The first aim of the month at the site: the track's, or the Sun at the arrival's hour where the story starts. */
function firstAim(i: PathInput): Aim {
  if (i.track && i.track.length > 0) return i.track[0];
  const b = shot(i), az = (Math.atan2(i.sun[0], -i.sun[2]) / DEG + 360) % 360;
  return { hour: 0, yaw: (az - b.sun + 360) % 360, pitch: b.pitch, fov: b.fov, right: b.right };
}

/** Landed: beside the lander, the Sun beyond it, where the month at the site starts. */
function standing(i: PathInput): Key {
  const a = firstAim(i), { position, look } = besideAt(i, a);
  return { position, target: position.clone().addScaledVector(look, 1000), up: new THREE.Vector3(0, 1, 0), fov: a.fov, shift: [0, 0] };
}

/** The signed turn from bearing a to bearing b, the short way round, in degrees. */
const turn = (a: number, b: number) => ((((b - a + 540) % 360) + 360) % 360) - 180;

/**
 * The month at the site ends five days after the Sun comes back (or with the period): the lander lit and running
 * again, the eye turned to it slowly enough to follow.
 */
export const siteEndHour = (moments: { kind: string; hour: number }[], hours: number) => {
  const back = moments.find((m) => m.kind === 'sun-back' || m.kind === 'sun-power-back');
  return Math.min(hours - 1, back ? back.hour + 120 : hours - 1);
};

/**
 * Where the camera looks through the month at the site, told as the hero's month goes, the lander always in the
 * foreground (BESIDE): the Sun as it skims the hills and slips behind one (the lander's light goes out soon after,
 * in view); Earth as it comes into view; the Sun as it comes back; and at the end the lander, lit from the side
 * and running again. The camera stands back from the lander along each aim, so it circles the lander as the aim
 * turns.
 */
export function siteTrack(o: {
  series: { hours: number; sunAz: ArrayLike<number>; earthAz: ArrayLike<number> };
  moments: { kind: string; hour: number }[];
  aspect: number;
  startHour: number;
  endHour: number;
}): Aim[] {
  const b = shot(o);
  const at = (...kinds: string[]) => o.moments.find((m) => kinds.includes(m.kind) && m.hour > o.startHour)?.hour;
  const az = (bearings: ArrayLike<number>, h: number) => Number(bearings[Math.min(o.series.hours - 1, Math.max(0, Math.round(h)))]);
  const aim = (hour: number, yaw: number, pitch: number = b.pitch, right: number = b.right): Aim => ({ hour, yaw: ((yaw % 360) + 360) % 360, pitch, fov: b.fov, right });
  const aims: Aim[] = [aim(o.startHour, az(o.series.sunAz, o.startHour) - b.sun)];
  const add = (hour: number, yaw: number) => {
    if (hour > aims[aims.length - 1].hour && hour < o.endHour) aims.push(aim(hour, yaw));
  };
  const hide = at('sunset', 'sunset-power-off'), rise = at('earth-in'), back = at('sun-back', 'sun-power-back');
  if (hide !== undefined) {
    add(hide - 10, az(o.series.sunAz, hide) - b.sun);
    add(hide + 2, az(o.series.sunAz, hide) - b.sun);
  }
  if (rise !== undefined) {
    add(rise - 24, az(o.series.earthAz, rise) - b.earth);
    add(rise + 30, az(o.series.earthAz, rise + 30) - b.earth);
  }
  if (back !== undefined) {
    add(back - 10, az(o.series.sunAz, back) - b.sun);
    add(back + 6, az(o.series.sunAz, back) - b.sun);
  }
  aims.push(aim(o.endHour, az(o.series.sunAz, o.endHour) - b.end.sun, b.end.pitch, b.end.right));
  return aims;
}

/** The track's aim at an hour: eased from one aim to the next, the short way round. */
export function aimAt(track: Aim[], hour: number): Omit<Aim, 'hour'> {
  if (hour <= track[0].hour) return track[0];
  let k = 0;
  while (k < track.length - 2 && hour > track[k + 1].hour) k++;
  const a = track[k], b = track[k + 1], f = smoother(Math.min(1, Math.max(0, (hour - a.hour) / Math.max(1e-9, b.hour - a.hour))));
  const mix = (u: number, v: number) => u + (v - u) * f;
  return { yaw: (((a.yaw + turn(a.yaw, b.yaw) * f) % 360) + 360) % 360, pitch: mix(a.pitch, b.pitch), fov: mix(a.fov, b.fov), right: mix(a.right, b.right) };
}

/** The six keys at STOPS (the month at the site follows the track from the last). */
export function flightKeys(i: PathInput): Key[] {
  const side = capSide(i), pole = abovePole(i);
  return [wholeMoon(i), pole, { ...pole, position: pole.position.clone(), target: pole.target.clone(), up: pole.up.clone() }, overCap(i, side), overRidge(i), standing(i)];
}

/**
 * Round the Moon: the height above the sphere on a log scale, and the point under the camera along the great
 * circle as far as the height has come down (the share of the way left is the share of the height left to
 * lose), so the ground never rushes past as the camera nears it.
 */
function orbit(a: Key, b: Key, f: number, i: PathInput): THREE.Vector3 {
  const C = moonCentre(i.siteHeightM), ra = a.position.clone().sub(C), rb = b.position.clone().sub(C);
  const ha = Math.max(1, ra.length() - R_MOON_M), hb = Math.max(1, rb.length() - R_MOON_M);
  const h = Math.exp(Math.log(ha) + (Math.log(hb) - Math.log(ha)) * f);
  const left = Math.abs(ha - hb) < 1 ? 1 - f : (h - hb) / (ha - hb);
  return C.add(slerpUnit(rb.normalize(), ra.normalize(), left).multiplyScalar(R_MOON_M + h));
}

/** Down to the eye: the height above the end's ground on a log scale, the way across shrinking with it, never nearer the ground than the eye stands. */
function descend(a: Key, b: Key, f: number, i: PathInput): THREE.Vector3 {
  const g = i.groundAt(b.position.x, b.position.z), ca = Math.max(0.5, a.position.y - g), cb = Math.max(0.5, b.position.y - g);
  const clear = Math.exp(Math.log(ca) + (Math.log(cb) - Math.log(ca)) * f);
  const left = Math.abs(ca - cb) < 1e-6 ? 1 - f : (clear - cb) / (ca - cb);
  const x = b.position.x + (a.position.x - b.position.x) * left, z = b.position.z + (a.position.z - b.position.z) * left;
  return new THREE.Vector3(x, Math.max(g + clear, i.groundAt(x, z) + cb + 60 * left * left), z);
}

/** The turn that points a camera from a stop at its target, its up as the stop's. */
const aimOf = (k: Key) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(k.position, k.target, k.up));

export function poseAt(keys: Key[], p: number, i: PathInput): Pose {
  // The month at the site: beside the lander, looking where the track says at the hour (hourAt's even pace).
  if (p > SITE.from && i.track && i.track.length > 1) {
    const t = i.track, f = Math.min(1, (p - SITE.from) / (SITE.to - SITE.from)), a = aimAt(t, t[0].hour + (t[t.length - 1].hour - t[0].hour) * f);
    const { position: from, look } = besideAt(i, a), q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, from.clone().add(look), new THREE.Vector3(0, 1, 0)));
    return { position: [from.x, from.y, from.z], quaternion: [q.x, q.y, q.z, q.w], fov: a.fov, shift: [0, 0] };
  }
  const q = Math.min(SITE.from, Math.max(0, p));
  let k = 0;
  while (k < keys.length - 2 && q > STOPS[k + 1]) k++;
  const a = keys[k], b = keys[k + 1], f = smoother((q - STOPS[k]) / (STOPS[k + 1] - STOPS[k]));
  const position = k === keys.length - 2 ? descend(a, b, f, i) : orbit(a, b, f, i);
  const target = a.target.clone().lerp(b.target, f);
  // Where both stops share the up it is held (the horizon stays level on the way down). Elsewhere it is the up of
  // the two stops' aims turned part way, square to the line of sight, so the picture turns as one smooth turn:
  // an up swung straight from one stop's to the next could pass by the line of sight and roll in a moment.
  let up = a.up.equals(b.up) ? a.up.clone() : new THREE.Vector3(0, 1, 0).applyQuaternion(aimOf(a).slerp(aimOf(b), f));
  const fwd = target.clone().sub(position).normalize();
  if (Math.abs(fwd.dot(up)) > 0.999) up = new THREE.Vector3(1, 0, 0).addScaledVector(fwd, -fwd.x).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, up));
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quat.x, quat.y, quat.z, quat.w],
    fov: a.fov + (b.fov - a.fov) * f,
    shift: [a.shift[0] + (b.shift[0] - a.shift[0]) * f, a.shift[1] + (b.shift[1] - a.shift[1]) * f],
  };
}
