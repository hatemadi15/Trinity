import { describe, expect, it } from 'vitest';
import { LANDER_GLSL } from './landerShape';
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
    expect(GROUND_FRAG).toContain('sunMargin(vWorld + N0 * 0.4, uSun)');
  });

  it('keeps every star below the bloom threshold, so only the Sun blooms', () => {
    expect(STAR_FRAG).toContain('min(vC * a * uGain, vec3(0.95))');
  });

  it('scatters craters irregularly, many small and few large, with rocks and fine grain near the eye', () => {
    expect(GROUND_FRAG).toMatch(/float craters\(vec2 p, float cell\)[\s\S]*continue;/); // not every cell holds a crater
    expect(GROUND_FRAG).toContain('float stones(vec2 p, float cell, float seed, float presence, float r0, float r1, out float bright)');
    expect(GROUND_FRAG).toContain('float grain(vec2 p, float px)');
  });

  it('keeps a faint earthlit glow on ground that faces away from a low Earth, but lights mostly the slopes that face it', () => {
    expect(GROUND_FRAG).toContain('uEarthshine * 0.07');
    expect(GROUND_FRAG).toContain('uEarthshine * 0.9 * mue / (mue + mu)');
  });

  it('lets the drawn craters and rocks cast long shadows at a low Sun, not only shade', () => {
    // A march towards the Sun over the drawn heights, and each rock's own shadow, judged against the measured slope.
    expect(GROUND_FRAG).toContain('float detailRise(');
    expect(GROUND_FRAG).toContain('float rockMargin(');
    expect(GROUND_FRAG).toMatch(/vis \*= mix\(1\.0, mix\(soft\(mDetail\), 1\.0, hide\), wDetail\)/);
  });

  it('casts the lander’s shadow from its drawn shape, with the Sun’s disc for a soft edge', () => {
    expect(GROUND_FRAG).toContain(LANDER_GLSL.trim().slice(0, 60));
    expect(GROUND_FRAG).toContain('landerClearance(toLander(');
    expect(GROUND_FRAG).not.toContain('uLanderMin');
  });

  it('softens every shadow edge to at least the change across one pixel, so far edges never stair-step', () => {
    expect(GROUND_FRAG).toMatch(/float soft\(float m\) \{[^}]*fwidth\(m\)/);
    expect(GROUND_FRAG).toContain('soft(mTerrain)');
    expect(GROUND_FRAG).toContain('soft(mLander)');
    // The derivatives are taken outside every branch.
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    const lastBrace = main.lastIndexOf('}');
    expect(main.lastIndexOf('soft(mTerrain)')).toBeGreaterThan(main.lastIndexOf('if ('));
    expect(main.lastIndexOf('soft(mTerrain)')).toBeLessThan(lastBrace);
  });

  it('fills the shadows with the light the sunlit dust round them scatters, a share that falls with the Sun (bounceShare)', () => {
    expect(GROUND_FRAG).toContain('uSunPower * uBounce * uSunUp');
  });

  it('gives every loop a length set by a uniform, so the Windows shader compiler cannot unroll them into a minute-long build', () => {
    const loops = GROUND_FRAG.split('\n').filter((l) => /for \(int /.test(l));
    expect(loops.length).toBeGreaterThan(5);
    for (const l of loops) expect(l).toMatch(/uOne|uSteps/);
    expect(GROUND_FRAG).toMatch(/uniform int [^;]*uOne/);
  });

  it('casts your own shadow: a person standing where the view stands, long across the ground at a low Sun', () => {
    expect(GROUND_FRAG).toContain('float viewerClearance(vec3 p, vec3 L)');
    expect(GROUND_FRAG).toContain('uniform vec3 uViewer');
    expect(GROUND_FRAG).toContain('soft(mViewer)');
  });

  it('scatters pebbles as well as rocks, each layer throwing its own shadows', () => {
    // Two layers of stones (rocks in 1.5 m cells, pebbles in 0.6 m cells), each with shadows cell by cell.
    expect((GROUND_FRAG.match(/rockMargin\(vWorld\.xz/g) ?? []).length).toBe(2);
    expect((GROUND_FRAG.match(/stones\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('makes crater rims uneven, so their shadows have ragged edges rather than smooth blots', () => {
    const craters = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float craters('), GROUND_FRAG.indexOf('float stones('));
    expect(craters).toMatch(/rim \*= [^;]*vnoise\(/);
  });

  it('keeps the drawn ground’s gentle swells low, so the near ground does not ripple like dunes', () => {
    const m = GROUND_FRAG.match(/\(vnoise\(p \* 0\.9\) - 0\.5\) \* ([0-9.]+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(0.15);
  });

  it('makes stones lumpy, not round domes, and brightens the regolith less where it looks away from the Sun', () => {
    const stones = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float stones('), GROUND_FRAG.indexOf('float grain('));
    expect(stones).toContain('vnoise(');
    const surge = GROUND_FRAG.match(/surge = 1\.0 \+ ([0-9.]+) \//);
    expect(Number(surge![1])).toBeLessThanOrEqual(0.5);
  });

  it('lets the drawn bumps hide their own shadows and their sides away from the Sun where the eye looks down-Sun', () => {
    expect(GROUND_FRAG).toContain('float hiddenShadowShare(');
    // Judged over the measured ground's own surface.
    expect(GROUND_FRAG).toMatch(/float hide = hiddenShadowShare\(/);
    expect(GROUND_FRAG).toContain('mix(soft(mDetail), 1.0, hide)');
    expect(GROUND_FRAG).toContain('* (1.0 - hide)');
  });

  it('casts your shadow as a person’s, not a post: two legs, a body, two arms and a head, square to the Sun', () => {
    const viewer = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float viewerClearance('), GROUND_FRAG.indexOf('float soft('));
    expect(viewer.match(/capsuleClear\(p, L,/g)?.length).toBe(6);
    expect(viewer).toContain('normalize(vec3(-L.z, 0.0, L.x))');
  });

  it('darkens the ground in the boulders’ shadows, with the Sun’s disc for a soft edge', () => {
    expect(GROUND_FRAG).toContain('float rocksClearance(vec3 p, vec3 L)');
    expect(GROUND_FRAG).toContain('soft(mBoulders)');
  });

  it('lights the ground faintly at night when neither the Sun nor Earth does, as the lander is lit, so it stands on something', () => {
    expect(GROUND_FRAG).toContain('uNight');
  });

  it('gives the dust near the eye a fine grain, so it reads as soil rather than snow', () => {
    expect(GROUND_FRAG).toMatch(/0\.05 \/ px/);
  });

  it('keeps your shadow\u2019s arms against its body, so no thin rails run beside it', () => {
    const viewer = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float viewerClearance('), GROUND_FRAG.indexOf('float soft('));
    expect(viewer).toContain('side * 0.19');
    expect(viewer).not.toContain('side * 0.27');
  });
});
