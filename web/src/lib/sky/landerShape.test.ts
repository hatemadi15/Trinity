import { describe, expect, it } from 'vitest';
import { dirAzEl, type Vec3 } from './frames';
import { LANDER, LANDER_GLSL, LEG_ENDS, PODS, TANKS, landerClearance, landerSdf, landerSunVisible } from './landerShape';

// The lander's own frame: +x is the face that looks towards faceAzDeg, y up, origin on the ground under it.
// These tests stand it with +x towards the east (its frame and the world's then share their axes).
const sun = (azDeg: number, elDeg: number): Vec3 => dirAzEl(azDeg, elDeg);
const towards = (azDeg: number, m: number): Vec3 => {
  const d = dirAzEl(azDeg, 0);
  return [d[0] * m, 0, d[2] * m];
};

describe('the lander’s shadow', () => {
  it('falls away from a low Sun: a point down-sun is in it, a point up-sun is not', () => {
    const L = sun(315, 2);
    expect(landerSunVisible(towards(135, 40), L)).toBe(0);
    expect(landerSunVisible(towards(315, 30), L)).toBe(1);
    expect(landerSunVisible(towards(45, 40), L)).toBe(1);
  });

  it('starts some way out at a 2° Sun, for the light passes under the body and its tanks, between the legs', () => {
    const L = sun(0, 2);
    // Straight down-sun from the centre, under the two tanks on that line (their bottoms 0.46 m up): near the lander
    // the ray passes beneath them, from about 13 m out they hide the Sun, and from about 25 m the body does.
    expect(landerSunVisible(towards(180, 10), L)).toBe(1);
    expect(landerSunVisible(towards(180, 18), L)).toBe(0);
    expect(landerSunVisible(towards(180, 34), L)).toBe(0);
    expect(landerSunVisible(towards(180, 44), L)).toBe(0);
    // Near the top of the shadow the Sun's upper edge peeks over the deck: a soft edge, as on the Moon.
    expect(landerSunVisible(towards(180, 52), L)).toBeLessThan(0.3);
    // Beyond the top of the panel the Sun shows again.
    expect(landerSunVisible(towards(180, 140), L)).toBe(1);
  });

  it('runs from each foot along its leg, so the shadow is attached to the lander', () => {
    const L = sun(0, 2);
    const foot: Vec3 = [LANDER.legs.foot[0] / Math.SQRT2, 0, -LANDER.legs.foot[0] / Math.SQRT2];
    // Just down-sun of the north-east footpad (local +x, -z), the pad and the leg above it hide the Sun.
    expect(landerSunVisible([foot[0], 0, foot[2] + LANDER.legs.padR + 0.4], L)).toBeLessThan(0.2);
  });

  it('has a soft edge as wide as the Sun’s disc seen from there, about a third of a metre 40 m away', () => {
    const L = sun(0, 2);
    // Walk sideways across the edge of the body's shadow 40 m down-sun.
    const vis = (x: number) => landerSunVisible([x, 0, 40], L);
    let dark = 0, lit = 0;
    for (let x = 0; x < 3; x += 0.01) {
      if (vis(x) < 0.05) dark = x;
      if (vis(x) < 0.95) lit = x;
    }
    const width = lit - dark;
    expect(width).toBeGreaterThan(0.25);
    expect(width).toBeLessThan(0.5);
  });

  it('measures the gap between the ray and the lander as an angle, negative inside it', () => {
    const L = sun(0, 2);
    expect(landerSdf([0, LANDER.body.y0 + 0.5, 0])).toBeLessThan(0);
    expect(landerSdf([5, 1, 5])).toBeGreaterThan(3);
    expect(landerClearance(towards(180, 44), L)).toBeLessThan(0);
    expect(landerClearance(towards(315, 30), L)).toBeGreaterThan(0.01);
  });

  it('gives the ground shader the same shape, from the same numbers', () => {
    expect(LANDER_GLSL).toContain('float landerSdf(vec3 p)');
    expect(LANDER_GLSL).toContain('float landerClearance(vec3 p, vec3 L)');
    expect(LANDER_GLSL).toContain(LANDER.body.r.toFixed(3));
    expect(LANDER_GLSL).toContain(LANDER.legs.r.toFixed(3));
    expect(LANDER_GLSL).toContain(LANDER.panel.size[0].toFixed(3));
  });
});

describe('the finer lander’s shadow shape', () => {
  const inside = (p: Vec3, r: number) => expect(landerSdf(p)).toBeLessThanOrEqual(-r + 1e-6);
  it('holds every leg’s main strut, side struts, pad, tank and pod inside by its radius, in all four quarters', () => {
    for (const { top, foot, knee, corners } of LEG_ENDS) {
      for (const t of [0.1, 0.5, 0.9]) inside([top[0] + (foot[0] - top[0]) * t, top[1] + (foot[1] - top[1]) * t, top[2] + (foot[2] - top[2]) * t], LANDER.legs.r);
      for (const c of corners) for (const t of [0.2, 0.8]) inside([knee[0] + (c[0] - knee[0]) * t, knee[1] + (c[1] - knee[1]) * t, knee[2] + (c[2] - knee[2]) * t], LANDER.legs.sideR);
      inside([foot[0], LANDER.legs.padH / 2, foot[2]], LANDER.legs.padH / 2);
    }
    for (const t of TANKS) inside(t, LANDER.tanks.r);
    for (const p of PODS) inside(p, 0.05);
  });
  it('writes the same shape for the ground shader, folded into one eighth', () => {
    expect(LANDER_GLSL).toContain('vec3 q = vec3(max(abs(p.x), abs(p.z)), p.y, min(abs(p.x), abs(p.z)));');
    for (const n of [LANDER.tanks.r, LANDER.legs.sideR, LANDER.pods.size[2] / 2]) expect(LANDER_GLSL).toContain(n.toFixed(3));
  });
});
