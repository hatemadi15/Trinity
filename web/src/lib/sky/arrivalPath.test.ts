import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { R_MOON_M } from '@/lib/engine/constants';
import { dirAzEl, enuBasis, type Vec3 } from './frames';
import { aimAt, BESIDE, flightKeys, moonCentre, polePoint, poseAt, siteEndHour, siteTrack, type PathInput, type Pose } from './arrivalPath';
import { HERO_HOUR, hero } from '@/lib/viz/arrival';
import { keyMoments } from '@/lib/viz/stand';
import { BEAT_STOPS, hourAt, PLAY, playProgress, playSeconds, progressFromScroll, scrollFromProgress, STOPS } from './arrivalTiming';

const level = (x: number, z: number) => -(x * x + z * z) / (2 * R_MOON_M);
const e = dirAzEl(71.09, -5.95), km = 393550e3;
/** The lander 16 m from the site, 40 degrees left of the Sun at the period's start (20 on a phone), as standLander puts it. */
const landerAt = (aspect: number) => {
  const a = ((aspect < 1 ? 307.4 : 287.4) * Math.PI) / 180;
  return { x: 16 * Math.sin(a), z: -16 * Math.cos(a) };
};
const input = (aspect = 1.6, groundAt = level): PathInput => ({
  basis: enuBasis(-88.28, -64.31), siteHeightM: 190.33, sun: dirAzEl(322.33, 2.37), earth: [e[0] * km, 2 + e[1] * km, e[2] * km], groundAt, aspect, lander: landerAt(aspect),
});
/** The lander's middle and top (1.6 m and 3.4 m over the ground under it). */
const landerParts = (i: PathInput) => {
  const g = i.groundAt(i.lander.x, i.lander.z);
  return { mid: new THREE.Vector3(i.lander.x, g + 1.6, i.lander.z), top: new THREE.Vector3(i.lander.x, g + 3.4, i.lander.z) };
};
/** The lander's left edge seen from a pose: its middle moved half its width (1.9 m) to the camera's left. */
const leftEdge = (pose: Pose, mid: THREE.Vector3) => mid.clone().addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion(...pose.quaternion)).setY(0).normalize(), -1.9);
/** A direction's point far out from a pose's camera. */
const far = (pose: Pose, d: Vec3) => new THREE.Vector3(...pose.position).addScaledVector(new THREE.Vector3(...d), 1e5);
/** The hero month's track for a view's shape, and the flight's input with it. */
const heroTrack = (aspect: number) => {
  const h = hero(), moments = keyMoments(h.series, h.power, h.startUtc), last = siteEndHour(moments, h.series.hours);
  const track = siteTrack({ series: h.series, moments, aspect, startHour: HERO_HOUR, endHour: last });
  return { h, moments, last, track, i: { ...input(aspect), sun: dirAzEl(h.series.sunAz[HERO_HOUR], h.series.sunEl[HERO_HOUR]), track } as PathInput };
};
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

  it('holds straight over the pole, 900 km up, while its words are read', () => {
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

  it('comes down over the ridge, 2 km above the ground, looking past the site at the Sun just over the hills, and lands beside the lander: it stands in the foreground under the Sun', () => {
    // Over the ridge the words say the Sun stands just above the hills: the Sun is in the picture, the site below it.
    for (const aspect of [1.6, 390 / 844]) {
      const j = input(aspect), ridge = poseAt(flightKeys(j), 3, j), see = viewOf(ridge, aspect), site = see([0, 0, 0]), sun = see(far(ridge, j.sun));
      expect(ridge.position[1] - j.groundAt(ridge.position[0], ridge.position[2])).toBeCloseTo(2000, 0);
      expect(inView(site), `site ${aspect}`).toBe(true);
      expect(inView(sun), `Sun ${aspect}`).toBe(true);
      expect(sun.y).toBeGreaterThan(site.y + 0.2);
      // On a wide screen both right of the words' column.
      if (aspect > 1) expect(Math.min(site.x, sun.x)).toBeGreaterThan(0.1);
    }
    for (const aspect of [1.6, 390 / 844]) {
      const j = input(aspect), end = poseAt(flightKeys(j), 4, j), see = viewOf(end, aspect), { mid, top } = landerParts(j);
      const cam = new THREE.Vector3(...end.position), lander = see(mid), sun = see(far(end, j.sun));
      // A few metres up, a dozen or so from the lander, its middle in the lower half of the view.
      expect(cam.distanceTo(mid)).toBeLessThan(20);
      expect(cam.y - j.groundAt(cam.x, cam.z)).toBeGreaterThan(1.5);
      expect(inView(lander)).toBe(true);
      expect(lander.y).toBeLessThan(-0.1);
      // The Sun in view, over the lander's top: the lander covers none of the sky the story is told in.
      expect(inView(sun)).toBe(true);
      expect(sun.y).toBeGreaterThan(see(top).y);
      expect(end.fov).toBe(aspect < 1 ? BESIDE.tall.fov : BESIDE.wide.fov);
      // On a wide screen right of the words' column at the left (it ends just short of the middle), whole, so no
      // card scrolling by covers it; the Sun further right.
      if (aspect > 1) {
        expect(see(leftEdge(end, mid)).x).toBeGreaterThan(0.02);
        expect(sun.x).toBeGreaterThan(lander.x + 0.4);
      }
    }
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

  it('keeps the lander right of the words’ column on a wide screen through the last of the descent too, as it first comes into view', () => {
    const { i } = heroTrack(1.6), keys = flightKeys(i), { mid } = landerParts(i);
    for (let p = 3.5; p <= 4.0001; p += 0.02) {
      const pose = poseAt(keys, p, i), see = viewOf(pose, 1.6), m = see(mid);
      if (!inView(m, 1)) continue;
      expect(see(leftEdge(pose, mid)).x, `left edge at ${p.toFixed(2)}`).toBeGreaterThan(0.02);
    }
  });

  it('ends with the lander clear of the answer’s card: low in the view on a phone (the card at the top), below the card on a wide screen', () => {
    for (const aspect of [1.6, 390 / 844]) {
      const { i } = heroTrack(aspect), end = poseAt(flightKeys(i), 5, i), see = viewOf(end, aspect), { mid, top } = landerParts(i);
      expect(inView(see(mid))).toBe(true);
      // The card reaches about half way down: the lander's top stands under it.
      expect(see(top).y).toBeLessThan(aspect < 1 ? -0.2 : -0.05);
      expect(end.shift).toEqual([0, 0]);
    }
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

  it('keeps the landing hour over the pole: the month runs once, in order, at the site after landing', () => {
    for (const p of [0.5, 1, 1.25, 1.5, 2, 3, 4]) expect(hourAt(p, 10, 586)).toBe(10);
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

  it('runs the month at the site after landing, from the landing hour to the last of the story, at an even pace', () => {
    expect(hourAt(4, 10, 472)).toBe(10);
    expect(hourAt(4.5, 10, 472)).toBeCloseTo(241, 6);
    expect(hourAt(5, 10, 472)).toBe(472);
  });

  it('at the site the camera keeps beside the lander all month, the lander in the foreground, while the Sun goes behind the hills, Earth comes into view and the Sun comes back', () => {
    for (const aspect of [1.6, 390 / 844]) {
      const { h, moments, last, track, i } = heroTrack(aspect), keys = flightKeys(i), at = (...kinds: string[]) => moments.find((m) => kinds.includes(m.kind))!.hour;
      const hide = at('sunset', 'sunset-power-off'), rise = at('earth-in'), back = at('sun-back', 'sun-power-back');
      expect(last).toBe(back + 120);
      expect(track[0].hour).toBe(HERO_HOUR);
      expect(track.at(-1)!.hour).toBe(last);
      const { mid, top } = landerParts(i);
      const poseAtHour = (t: number) => poseAt(keys, 4 + (t - HERO_HOUR) / (last - HERO_HOUR), i);
      const body = (t: number, which: 'sun' | 'earth') => {
        const p = poseAtHour(t), k = Math.round(t), see = viewOf(p, aspect);
        const d = which === 'sun' ? dirAzEl(h.series.sunAz[k], h.series.sunEl[k]) : dirAzEl(h.series.earthAz[k], h.series.earthEl[k]);
        return { at: see(far(p, d)), top: see(top) };
      };
      // The Sun as it goes behind the hills, Earth as it comes into view, the Sun as it comes back: each in view and
      // over the lander's top.
      for (const [t, which] of [[hide, 'sun'], [rise + 6, 'earth'], [back + 3, 'sun']] as const) {
        const b = body(t, which);
        expect(inView(b.at), `${which} at ${t}`).toBe(true);
        expect(b.at.y).toBeGreaterThan(b.top.y);
      }
      let before: Pose | null = null;
      for (let t = HERO_HOUR; t <= last; t += 1) {
        const p = poseAtHour(t), see = viewOf(p, aspect), cam = new THREE.Vector3(...p.position), m = see(mid);
        // The lander always in view, in the lower half, a dozen or so metres off; the camera never in the ground.
        expect(inView(m), `lander at ${t}`).toBe(true);
        expect(m.y).toBeLessThan(0);
        expect(cam.distanceTo(mid)).toBeLessThan(20);
        expect(cam.y - i.groundAt(cam.x, cam.z)).toBeGreaterThan(1.5);
        // Smooth: never more than two and a half degrees or a metre an hour.
        if (before) {
          expect(new THREE.Quaternion(...before.quaternion).angleTo(new THREE.Quaternion(...p.quaternion))).toBeLessThan((2.5 * Math.PI) / 180);
          expect(new THREE.Vector3(...before.position).distanceTo(cam)).toBeLessThan(1);
        }
        before = p;
      }
      // On a wide screen the lander stands right of the words' column all month, whole: the cards scroll by at the
      // left at any hour, the answer's card at the end too.
      if (aspect > 1) {
        for (let t = HERO_HOUR; t <= last; t += 6) {
          const p = poseAtHour(t);
          expect(viewOf(p, aspect)(leftEdge(p, mid)).x, `left edge at ${t}`).toBeGreaterThan(0.02);
        }
      }
    }
  });

  it('through the month looks where the track says, the lander where the aim puts it, and starts where the landing left the view', () => {
    const { last, track, i } = heroTrack(1.6), keys = flightKeys(i);
    expect(poseAt(keys, 4, i).quaternion).toEqual(poseAt(keys, 4 + 1e-9, i).quaternion.map((x) => expect.closeTo(x, 6)));
    expect(poseAt(keys, 4, i).position).toEqual(poseAt(keys, 4 + 1e-9, i).position.map((x) => expect.closeTo(x, 4)));
    const mid = poseAt(keys, 4.5, i), a = aimAt(track, hourAt(4.5, track[0].hour, last));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...mid.quaternion));
    expect(fwd.angleTo(new THREE.Vector3(...dirAzEl(a.yaw, a.pitch)))).toBeLessThan(1e-6);
    expect(mid.fov).toBeCloseTo(a.fov, 9);
    // The lander's middle at the aim's bearing from the camera, plus its place right of the middle, and below level.
    const to = landerParts(i).mid.sub(new THREE.Vector3(...mid.position));
    const bearing = ((Math.atan2(to.x, -to.z) * 180) / Math.PI + 360) % 360;
    expect(Math.abs(((((bearing - (a.yaw + a.right) + 540) % 360) + 360) % 360) - 180)).toBeLessThan(1e-6);
    expect(to.y).toBeLessThan(0);
  });
});
