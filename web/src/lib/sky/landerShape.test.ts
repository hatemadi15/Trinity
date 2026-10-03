import { describe, expect, it } from 'vitest';
import { dirAzEl, type Vec3 } from './frames';
import { LANDER, LANDER_GLSL, landerClearance, landerSdf, landerSunVisible } from './landerShape';

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

  it('starts about 25 m out at a 2° Sun, for the light passes under the body between the legs', () => {
    const L = sun(0, 2);
    // Straight down-sun from the centre: under the body the ray meets nothing, then the body hides the Sun.
    expect(landerSunVisible(towards(180, 12), L)).toBe(1);
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
