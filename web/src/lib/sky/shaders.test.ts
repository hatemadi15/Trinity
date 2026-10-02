import { describe, expect, it } from 'vitest';
import { GROUND_FRAG, STAR_FRAG } from './shaders';

describe('the ground shader', () => {
  it('fades each size of drawn crater by how many pixels it covers, so craters smaller than a pixel never sparkle', () => {
    // The footprint is taken once, outside every branch (derivatives are undefined in non-uniform flow).
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main.indexOf('fwidth(vWorld.xz)')).toBeGreaterThan(-1);
    expect(main.indexOf('fwidth(vWorld.xz)')).toBeLessThan(main.indexOf('if ('));
    expect(GROUND_FRAG).toMatch(/float detailH\(vec2 p, float px\)/);
    expect((GROUND_FRAG.match(/smoothstep\(1\.5, 4\.0, /g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('starts the shadow ray from the measured ground, not from the drawn craters', () => {
    expect(GROUND_FRAG).toContain('vec3 N0 = normalize(vNormal), Nn = N0;');
    expect(GROUND_FRAG).toContain('sunFraction(vWorld + N0 * 0.4, uSun)');
  });

  it('keeps every star below the bloom threshold, so only the Sun blooms', () => {
    expect(STAR_FRAG).toContain('min(vC * a * uGain, vec3(0.95))');
  });

  it('scatters craters irregularly, many small and few large, with rocks and fine grain near the eye', () => {
    expect(GROUND_FRAG).toMatch(/float craters\(vec2 p, float cell\)[\s\S]*continue;/); // not every cell holds a crater
    expect(GROUND_FRAG).toContain('float rocks(vec2 p, out float bright)');
    expect(GROUND_FRAG).toContain('float grain(vec2 p, float px)');
  });
});
