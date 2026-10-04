import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { R_MOON_M } from '@/lib/engine/constants';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { aimAt, flightKeys, moonCentre, polePoint, poseAt, siteEndHour, siteTrack, type PathInput, type Pose } from './arrivalPath';
import { HERO_HOUR, hero } from '@/lib/viz/arrival';
import { keyMoments } from '@/lib/viz/stand';
import { openingYaw, standLander } from '@/lib/viz/standOpening';
import { BEAT_STOPS, hourAt, PLAY, playProgress, playSeconds, progressFromScroll, scrollFromProgress, STOPS, SWEEP } from './arrivalTiming';

const level = (x: number, z: number) => -(x * x + z * z) / (2 * R_MOON_M);
const e = dirAzEl(71.09, -5.95), km = 393550e3;
const input = (aspect = 1.6, groundAt = level): PathInput => ({
  basis: enuBasis(-88.28, -64.31), siteHeightM: 190.33, eyeY: 2, stand: { yaw: 287.3, pitch: 2, fov: aspect < 1 ? 80 : 60 },
  sun: dirAzEl(322.33, 2.37), earth: [e[0] * km, 2 + e[1] * km, e[2] * km], groundAt, aspect,
});
/** Where a world point falls in a pose's view: x and y from -1 to 1 across it, and whether it is in front. */
function viewOf(p: Pose, aspect: number) {
  const c = new THREE.PerspectiveCamera(p.fov, aspect, 1, 1e10);
  c.position.set(...p.position);
  c.quaternion.set(...p.quaternion);
  if (p.shift[0] || p.shift[1]) c.setViewOffset(1000 * aspect, 1000, -p.shift[0] * 1000 * aspect, p.shift[1] * 1000, 1000 * aspect, 1000);
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return (w: Vec3 | THREE.Vector3) => {
    const v = (w instanceof THREE.Vector3 ? w.clone() : new THREE.Vector3(...w)).project(c);
    return { x: v.x, y: v.y, inFront: v.z < 1 };
  };
}
const inView = (s: { x: number; y: number; inFront: boolean }, margin = 0.95) => s.inFront && Math.abs(s.x) < margin && Math.abs(s.y) < margin;

describe('the flight', () => {
  it('opens on the whole Moon with Earth beyond it, the south pole on the side that faces you', () => {
    const i = input(), keys = flightKeys(i), p = poseAt(keys, 0, i), see = viewOf(p, i.aspect);
    const cam = new THREE.Vector3(...p.position), C = moonCentre(i.siteHeightM), E = new THREE.Vector3(...i.earth);
    const rho = Math.asin(R_MOON_M / cam.distanceTo(C)), earthR = Math.asin(6371e3 / cam.distanceTo(E));
    expect(C.clone().sub(cam).angleTo(E.clone().sub(cam))).toBeGreaterThan(rho + earthR); // Earth clear of the disc
    expect(inView(see(E))).toBe(true);
    expect(inView(see(C))).toBe(true);
    const pole = new THREE.Vector3(...polePoint(i));
    expect(pole.clone().sub(C).dot(cam.clone().sub(pole))).toBeGreaterThan(0); // the pole faces the camera
    expect(inView(see(pole))).toBe(true);
  });

  it('looks straight down on the pole for the month’s sweep, 900 km up', () => {
    const i = input(), keys = flightKeys(i);
    for (const p of [1, 1.25, 1.5]) {
      // Aimed straight at it; the picture stands aside by the shift that keeps it clear of the words.
      const pose = poseAt(keys, p, i), s = viewOf(pose, i.aspect)(polePoint(i));
      expect(Math.hypot(s.x - 2 * pose.shift[0], s.y - 2 * pose.shift[1])).toBeLessThan(0.02);
      expect(new THREE.Vector3(...pose.position).distanceTo(moonCentre(i.siteHeightM)) - R_MOON_M).toBeCloseTo(9.0e5, -3);
    }
  });

  it('then looks across the polar cap from 90 km up with the Sun at its side, the pole and the site in view', () => {
    const i = input(), pose = poseAt(flightKeys(i), 2, i), see = viewOf(pose, i.aspect);
    expect(inView(see(polePoint(i)))).toBe(true);
    expect(inView(see([0, 0, 0]))).toBe(true);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...pose.quaternion)).setY(0).normalize();
    const sunAlong = new THREE.Vector3(i.sun[0], 0, i.sun[2]).normalize();
    expect(Math.abs(fwd.dot(sunAlong))).toBeLessThan(Math.sin((15 * Math.PI) / 180)); // shadows run across the view
    expect(pose.position[1]).toBeCloseTo(9.0e4, -3);
  });

  it('comes down over the ridge, 2 km above the ground, the site in the middle, and ends on the stand view’s opening', () => {
    const i = input(), keys = flightKeys(i);
    const ridge = poseAt(keys, 3, i), s = viewOf(ridge, i.aspect)([0, 0, 0]);
    expect(Math.hypot(s.x - 2 * ridge.shift[0], s.y - 2 * ridge.shift[1])).toBeLessThan(0.1);
    expect(ridge.position[1] - i.groundAt(ridge.position[0], ridge.position[2])).toBeCloseTo(2000, 0);
    const end = poseAt(keys, 4, i);
    expect(end.position).toEqual([0, 2, 0]);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...end.quaternion));
    expect(fwd.angleTo(new THREE.Vector3(...dirAzEl(287.3, 2)))).toBeLessThan(1e-6);
    expect(end.fov).toBe(60);
  });

  it('moves smoothly both ways: the ground never rushes past (each step a small share of the height), and the stops are the keys', () => {
    const i = input(), keys = flightKeys(i);
    let last = poseAt(keys, 0, i);
    for (let p = 0.002; p <= 4; p += 0.002) {
      const now = poseAt(keys, p, i);
      const a = new THREE.Vector3(...last.position), b = new THREE.Vector3(...now.position);
      const alt = Math.max(2, b.distanceTo(moonCentre(i.siteHeightM)) - R_MOON_M - i.siteHeightM);
      expect(a.distanceTo(b)).toBeLessThan(0.08 * alt + 5);
      expect(now.quaternion.every(Number.isFinite)).toBe(true);
      last = now;
    }
    // Each flight key at its stop (the last stop, the month at the site's end, has the standing key's place).
    keys.forEach((key, k) => expect(new THREE.Vector3(...poseAt(keys, STOPS[k], i).position).distanceTo(key.position)).toBeLessThan(1e-3));
  });

  it('opens with the Moon north up, as most pictures show it: the south pole at the bottom of the disc and Earth just beyond it', () => {
    for (const aspect of [1.6, 390 / 844]) {
      const i = input(aspect), see = viewOf(poseAt(flightKeys(i), 0, i), aspect);
      const C = see(moonCentre(i.siteHeightM)), pole = see(polePoint(i)), E = see(i.earth);
      expect(pole.y).toBeLessThan(C.y);
      expect(E.y).toBeLessThan(pole.y);
      expect(Math.abs(pole.x - C.x)).toBeLessThan(0.05);
    }
  });

  it('on a phone ends with the picture moved down, so the Sun shows under the answer’s card at the top', () => {
    // A phone opens 15 degrees left of the Sun (standOpening), not 35 as on a wide screen.
    const i = { ...input(390 / 844), stand: { yaw: 322.33 - 15, pitch: 2, fov: 80 } }, pose = poseAt(flightKeys(i), 4, i), see = viewOf(pose, i.aspect);
    const sun = see(new THREE.Vector3(0, i.eyeY, 0).addScaledVector(new THREE.Vector3(...i.sun), 1e5));
    expect(inView(sun)).toBe(true);
    expect(sun.y).toBeLessThan(-0.1);
    // On a wide screen the card stands at the left, and the frame is the stand view's own.
    expect(poseAt(flightKeys(input()), 4, input()).shift).toEqual([0, 0]);
  });

  it('pitches from over the pole down onto the cap without rolling the picture over', () => {
    const i = input(), keys = flightKeys(i);
    const right = (p: number) => new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...poseAt(keys, p, i).quaternion));
    const from = right(1.5);
    for (let p = 1.5; p <= 2; p += 0.01) expect(right(p).angleTo(from)).toBeLessThan((45 * Math.PI) / 180);
  });

  it('turns smoothly too: no step turns the view by more than two degrees, so the picture never whips round', () => {
    const i = input(), keys = flightKeys(i);
    let last = new THREE.Quaternion(...poseAt(keys, 0, i).quaternion);
    for (let p = 0.002; p <= 4; p += 0.002) {
      const now = new THREE.Quaternion(...poseAt(keys, p, i).quaternion);
      expect(last.angleTo(now)).toBeLessThan((2 * Math.PI) / 180);
      last = now;
    }
  });

  it('never goes under the ground on the way down, even over hills', () => {
    const hills = (x: number, z: number) => level(x, z) + 600 * Math.sin(x / 1500) * Math.cos(z / 1700);
    const i = input(1.6, hills), keys = flightKeys(i);
    for (let p = 2; p <= 4; p += 0.005) {
      const pose = poseAt(keys, p, i);
      expect(pose.position[1] - hills(pose.position[0], pose.position[2])).toBeGreaterThanOrEqual(1.5 - 1e-6);
    }
  });

  it('fits a phone: the whole Moon across a tall view and the pole’s cap in it', () => {
    const i = input(390 / 844), keys = flightKeys(i), p = poseAt(keys, 0, i);
    const see = viewOf(p, i.aspect), C = moonCentre(i.siteHeightM);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...p.quaternion));
    for (const k of [-1, 1]) expect(inView(see(C.clone().addScaledVector(right, k * R_MOON_M)), 1)).toBe(true);
  });

  it('keeps what each beat is about right of the middle on a wide screen, clear of the words at the left, and not aside on a phone', () => {
    const site: Vec3 = [0, 0, 0];
    for (const [p, subject] of [[1, 'pole'], [1.25, 'pole'], [2, 'site'], [3, 'site']] as const) {
      for (const aspect of [1.6, 390 / 844]) {
        const i = input(aspect), at = subject === 'pole' ? polePoint(i) : site, pose = poseAt(flightKeys(i), p, i), s = viewOf(pose, aspect)(at);
        expect(inView(s)).toBe(true);
        if (aspect > 1) expect(s.x).toBeGreaterThan(0.25);
        else expect(pose.shift[0]).toBe(0);
      }
    }
  });

  it('on a phone opens with the Moon low in the view, its south pole and Earth below it still in view, so the words above stay clear', () => {
    const i = input(390 / 844), keys = flightKeys(i), p = poseAt(keys, 0, i), see = viewOf(p, i.aspect);
    const C = moonCentre(i.siteHeightM), up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...p.quaternion));
    expect(see(C.clone().addScaledVector(up, R_MOON_M)).y).toBeLessThan(0.2); // its top in the lower part
    expect(inView(see(i.earth), 0.98)).toBe(true);
  });

  it('keeps the whole Moon in a view barely wider than tall: the shift for the words gives way first', () => {
    for (const aspect of [1, 1.03, 1.2, 1.6, 2.4]) {
      const i = input(aspect), keys = flightKeys(i), p = poseAt(keys, 0, i);
      const see = viewOf(p, i.aspect), C = moonCentre(i.siteHeightM);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...p.quaternion));
      for (const k of [-1, 1]) expect(inView(see(C.clone().addScaledVector(right, k * R_MOON_M)), 0.97)).toBe(true);
      // Still to the right of the middle, clear of the words, where there is room.
      if (aspect >= 1.6) expect(see(C).x).toBeGreaterThan(0.25);
    }
  });

  it('sweeps one synodic month while it holds over the pole, and none with reduced motion', () => {
    expect(hourAt(0.5, 10)).toBe(10);
    expect(hourAt(SWEEP.from + 0.25, 10)).toBeCloseTo(10 + SWEEP.hours / 2, 6);
    expect(hourAt(SWEEP.to - 1e-9, 10)).toBeCloseTo(10 + SWEEP.hours, 3);
    expect(hourAt(1.25, 10, true)).toBe(10);
  });

  it('maps scroll to progress beat by beat, and plays fifteen seconds from the first screen to standing, then six through the month at the site', () => {
    BEAT_STOPS.forEach((p, k) => expect(progressFromScroll(k)).toBeCloseTo(p, 9));
    for (let s = 0; s <= 5; s += 0.1) expect(scrollFromProgress(progressFromScroll(s))).toBeCloseTo(s, 9);
    expect(PLAY.reduce((a, b) => a + b, 0)).toBe(21);
    expect(playProgress(0)).toBe(0);
    expect(playProgress(15)).toBe(4);
    expect(playProgress(21)).toBe(5);
    expect(playProgress(99)).toBe(5);
    for (let p = 0; p <= 5; p += 0.25) expect(playProgress(playSeconds(p))).toBeCloseTo(p, 9);
  });

  it('runs the month at the site after landing, from the landing hour to the last of the story, at an even pace; with reduced motion it cuts to the end', () => {
    expect(hourAt(4, 10, false, 472)).toBe(10);
    expect(hourAt(4.5, 10, false, 472)).toBeCloseTo(241, 6);
    expect(hourAt(5, 10, false, 472)).toBe(472);
    expect(hourAt(4.5, 10, true, 472)).toBe(10);
    expect(hourAt(5, 10, true, 472)).toBe(472);
  });

  it('at the site the view follows the month: the Sun as it goes behind the hills, the lander as its battery runs out, Earth as it comes into view, then the Sun back beside the lander', () => {
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), at = (...kinds: string[]) => moments.find((m) => kinds.includes(m.kind))!.hour;
    for (const aspect of [1.6, 390 / 844]) {
      const tall = aspect < 1, lander = standLander(h.series, h.power, tall)!, open = { yaw: openingYaw(h.series, HERO_HOUR, tall, true), pitch: 2, fov: tall ? 80 : 60 };
      const hide = at('sunset', 'sunset-power-off'), out = at('battery-out', 'sunset-power-off'), rise = at('earth-in'), back = at('sun-back', 'sun-power-back'), last = siteEndHour(moments, h.series.hours);
      expect(last).toBe(back + 120);
      const track = siteTrack({ series: h.series, moments, landerAzDeg: lander.azDeg, open, aspect, startHour: HERO_HOUR, endHour: last });
      // It starts where the landing left the view, and ends at the last hour.
      expect(track[0]).toEqual({ hour: HERO_HOUR, ...open });
      expect(track.at(-1)!.hour).toBe(last);
      const inView = (az: number, hour: number) => {
        const a = aimAt(track, hour), half = (Math.atan(Math.tan((a.fov * Math.PI) / 360) * aspect) * 180) / Math.PI;
        return Math.abs(((((az - a.yaw + 540) % 360) + 360) % 360) - 180) < half - 3;
      };
      expect(inView(h.series.sunAz[hide], hide)).toBe(true); // the Sun going behind the hills
      // The lander as its battery runs out; on a phone, whose view is narrow, soon after.
      expect(inView(lander.azDeg, tall ? out + 48 : out)).toBe(true);
      expect(inView(h.series.earthAz[rise], rise)).toBe(true);
      expect(inView(h.series.sunAz[back], back + 3)).toBe(true);
      expect(inView(lander.azDeg, last)).toBe(true); // and at the end the lander, lit and running again
      // It turns smoothly: never more than two and a half degrees an hour.
      for (let t = HERO_HOUR; t < last; t += 1) {
        const d = Math.abs(((((aimAt(track, t + 1).yaw - aimAt(track, t).yaw + 540) % 360) + 360) % 360) - 180);
        expect(d).toBeLessThan(2.5);
      }
    }
  });

  it('stands at the eye through the month at the site, looking where the track says, and starts on the stand view’s opening', () => {
    const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), last = siteEndHour(moments, h.series.hours);
    const track = siteTrack({ series: h.series, moments, landerAzDeg: 250, open: { yaw: 287.3, pitch: 2, fov: 60 }, aspect: 1.6, startHour: HERO_HOUR, endHour: last });
    const i = { ...input(), track }, keys = flightKeys(i);
    expect(poseAt(keys, 4, i).quaternion).toEqual(poseAt(keys, 4 + 1e-9, i).quaternion.map((x) => expect.closeTo(x, 6)));
    const mid = poseAt(keys, 4.5, i);
    expect(mid.position).toEqual([0, 2, 0]);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...mid.quaternion));
    const a = aimAt(track, hourAt(4.5, track[0].hour, false, last));
    expect(fwd.angleTo(new THREE.Vector3(...dirAzEl(a.yaw, a.pitch)))).toBeLessThan(1e-6);
    expect(mid.fov).toBeCloseTo(a.fov, 9);
  });
});
