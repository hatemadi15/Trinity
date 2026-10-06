import { describe, expect, it } from 'vitest';
import { LANDER_GLSL } from './landerShape';
import { CRATER, craterLook, craterShape, GROUND_FRAG, HIDE_FADE, hiddenShare, NIGHT, STAR_FRAG } from './shaders';
import { hiddenShadowShare, SHADOW_GLSL } from './shadowRule';

describe('the ground shader', () => {

  it('lights the night ground by the sky it sees: slopes by how much they face up, bowls darker than their rims, in one bounded loop', () => {
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main).toContain('float skySeen = 1.0;');
    // One loop for the slope's three samples and the night's six, so detailH is written out once in it.
    expect(main).toContain('for (int k = 0; k < (uNight > 0.0 ? 9 : 3) * uOne; k++)');
    expect((main.match(/detailH\(/g) ?? []).length).toBeLessThanOrEqual(3);
    expect(main).toContain(`skySeen = clamp(1.0 - ${(NIGHT.BOWL / 6).toFixed(3)} * w * (around - 2.857 * s0), ${NIGHT.SEEN[0].toFixed(3)}, ${NIGHT.SEEN[1].toFixed(3)});`);
    expect(main).toContain('float upSeen = 0.5 + 0.5 * Nn.y;');
    expect(main).toContain(`col += albedo * vec3(0.62, 0.63, 0.66) * ${NIGHT.GAIN.toFixed(3)} * uNight * pow(upSeen, ${NIGHT.POWER.toFixed(1)}) * skySeen;`);
    expect(main).not.toContain('vec3(0.62, 0.63, 0.66) * uNight;');
    expect(NIGHT.NEAR_M).toBeLessThan(NIGHT.FAR_M);
    expect(Math.abs(3 / NIGHT.NEAR_M + 3 / NIGHT.FAR_M - 2.857)).toBeLessThan(0.001);
  });

  it('cuts each level round and fades its edge into the next level’s light and shadows, the two shadows in one march', () => {
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main).toMatch(/if \(rr < uHoleR \|\| rr > uEdge\.z\) discard;/);
    expect(main).toContain('float edge = smoothstep(uEdge.x, uEdge.y, rr);');
    expect(main).toContain('if (edge > 0.0) N0 = normalize(mix(N0, slopeNormal(uH1, uL1, uS1, m, uNextStep), edge));');
    expect(main.match(/sunMargins\(/g)).toHaveLength(1);
    expect(main).toContain('mTerrain = mix(mt.x, mt.y, edge);');
    expect(GROUND_FRAG).not.toMatch(/uHole\b/);
    expect(SHADOW_GLSL).toMatch(/vec2 sunMargins\(vec3 p, vec3 sun, bool both\)/);
    expect(SHADOW_GLSL).not.toMatch(/float sunMargin\(|float sunFraction\(/);
    expect(SHADOW_GLSL.match(/for \(int /g)).toHaveLength(1);
  });

  it('reads heights from a slot on, each mesh from its own, and takes the flight level’s light from per-pixel slopes of its heights', () => {
    expect(SHADOW_GLSL).toMatch(/float heightAt\(vec2 xz, int from\)/);
    expect(SHADOW_GLSL).toMatch(/float cellAt\(vec2 xz, int from\)/);
    expect(SHADOW_GLSL).toMatch(/vec3 slopeNormal\(sampler2D t, vec3 L, vec2 S, vec2 m, float k\)/);
    expect(SHADOW_GLSL).not.toContain('uMinLevel');
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main).toContain('if (uPixel > 0.5) N0 = slopeNormal(uH0, uL0, uS0, m, 1.0);');
  });
  it('fades each size of drawn crater by how many pixels it covers, so craters smaller than a pixel never sparkle', () => {
    // The footprint is taken once, outside every branch (derivatives are undefined in non-uniform flow).
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main.indexOf('fwidth(vWorld.xz)')).toBeGreaterThan(-1);
    expect(main.indexOf('fwidth(vWorld.xz)')).toBeLessThan(main.indexOf('if ('));
    expect(GROUND_FRAG).toMatch(/float detailH\(vec2 p, float px\)/);
    expect((GROUND_FRAG.match(/smoothstep\(1\.5, 4\.0, /g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('draws craters from about 20 m to about 1.5 km across on ground seen from afar, sparse and mostly worn, each size faded in by the pixels it spans, as shading only', () => {
    // The measured cap's cells are 960 m, so it shows craters of a few kilometres itself: drawn ones stop below
    // that. Fewer than the near ground's and mostly old and soft, so the ground does not read as bubble wrap; the
    // smallest, in 50 m cells, keep the ground between the larger ones from looking smooth from a couple of kilometres up.
    const far = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float farCraters('), GROUND_FRAG.indexOf('void main()'));
    expect(far).toMatch(/float farCraters\(vec2 p, float cell\)/);
    expect(far).toMatch(/float farH\(vec2 p, float px\)/);
    for (const cell of ['800.0', '200.0', '50.0']) expect(far).toContain(`smoothstep(1.5, 4.0, ${cell} / px)`);
    expect(far).not.toContain('3200.0');
    const presence = Number(far.match(/craterField\(p, cell, ([0-9.]+),/)![1]);
    expect(presence).toBeLessThanOrEqual(0.25);
    // On every level (the cap and its context too, not only the finest, which alone has the near detail), unless
    // the view is set to fast; faded in with the distance as the near detail fades out, bending only the shading normal.
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(GROUND_FRAG).toMatch(/uniform float [^;]*uFarDetail/);
    expect(main).toMatch(/if \(uFarDetail > 0\.5 && wFar > 0\.0\)/);
    expect(main).toMatch(/float wFar = smoothstep\([0-9.]+, [0-9.]+, dist\)/);
    expect(main).toMatch(/Nn = normalize\(Nn - vec3\(\(fx - f0\) \/ e, 0\.0, \(fz - f0\) \/ e\) \* wFar/);
  });

  it('shapes every drawn crater with no edge anywhere, so none draws as a thin ring: its height and slope run on smoothly from the floor over the rim, and fall to nothing, with no slope left, where its ejecta ends', () => {
    const slope = (r: number, look: ReturnType<typeof craterLook>) => (craterShape(r + 1e-5, look.depth, look.rim, look.crest) - craterShape(r - 1e-5, look.depth, look.rim, look.crest)) / 2e-5;
    for (const age of [0, 0.3, 0.7, 1]) {
      const look = craterLook(age);
      // No crease: from one step to the next the slope changes by a sliver, where a bowl that meets the plain at an
      // angle (as before) turns it at once by twice the depth.
      let jump = 0;
      for (let r = 0.01; r < 2.5; r += 1e-3) jump = Math.max(jump, Math.abs(slope(r + 1e-3, look) - slope(r, look)));
      expect(jump).toBeLessThan(0.02);
      // Nothing beyond the ejecta, and no step or slope where it ends: the old far craters stopped at 1.6 radii with
      // their rims still standing there, a step drawn as a thin ring round each.
      expect(craterShape(CRATER.OUT, look.depth, look.rim, look.crest)).toBe(0);
      expect(craterShape(CRATER.OUT + 0.4, look.depth, look.rim, look.crest)).toBe(0);
      expect(Math.abs(craterShape(CRATER.OUT - 0.01, look.depth, look.rim, look.crest))).toBeLessThan(1e-3 * look.rim);
      expect(Math.abs(slope(CRATER.OUT - 0.001, look))).toBeLessThan(0.02 * look.rim);
      // A bowl below the plain, under a rim above it.
      expect(craterShape(0, look.depth, look.rim, look.crest)).toBeLessThan(0);
      expect(Math.max(...Array.from({ length: 80 }, (_, k) => craterShape(0.8 + k * 0.01, look.depth, look.rim, look.crest)))).toBeGreaterThan(0);
    }
    // Both the near ground's craters and the far ones are drawn by it, and cut off only where it has fallen to nothing.
    const field = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float craterField('), GROUND_FRAG.indexOf('float craters('));
    expect(GROUND_FRAG).toContain('float craterShape(float r, float depth, float rim, float crest)');
    expect(field).toContain('craterShape(');
    expect(field).not.toMatch(/r < 1\.[0-7]/);
    expect(GROUND_FRAG).toContain('return craterField(p, cell, ');
  });

  it('draws craters of every age, most of them worn, shallow and soft, a few fresh, deep and sharp', () => {
    const worn = craterLook(0), fresh = craterLook(1);
    // Fresh: a bowl a fifth as deep as it is wide (0.4 radii from the crest), its walls steeper than 30 degrees, a
    // rim rounded over little of the radius. Worn: a twentieth as deep, its walls under 15 degrees, a rim three times
    // lower and rounded over most of the radius.
    expect(fresh.depth / 2).toBeGreaterThanOrEqual(0.19);
    expect(worn.depth / 2).toBeLessThanOrEqual(0.06);
    const steepest = (look: ReturnType<typeof craterLook>) => Math.max(...Array.from({ length: 1800 }, (_, k) => Math.abs(craterShape(k / 1000 + 1e-4, look.depth, look.rim, look.crest) - craterShape(k / 1000, look.depth, look.rim, look.crest)) / 1e-4));
    expect(Math.atan(steepest(fresh)) * (180 / Math.PI)).toBeGreaterThan(30);
    expect(Math.atan(steepest(worn)) * (180 / Math.PI)).toBeLessThan(15);
    expect(worn.rim).toBeLessThan(fresh.rim / 3);
    expect(worn.crest).toBeGreaterThan(3 * fresh.crest);
    // Worn rims wander further in and out than fresh ones.
    expect(worn.wander).toBeGreaterThan(fresh.wander);
    // Ages drawn so that about one crater in nine is fresh (an age over 0.7), the rest worn to some degree.
    const ages = Array.from({ length: 10000 }, (_, k) => ((k + 0.5) / 10000) ** CRATER.AGE_POWER);
    const freshShare = ages.filter((a) => a > 0.7).length / ages.length;
    expect(freshShare).toBeGreaterThan(0.05);
    expect(freshShare).toBeLessThan(0.15);
    expect(GROUND_FRAG).toContain(`pow(fract(rnd.x * 21.7 + rnd.y * 4.3), ${CRATER.AGE_POWER.toFixed(1)})`);
  });

  it('fades the near ground’s drawn craters and stones out when seen from above, where they read as bubble wrap', () => {
    const main = GROUND_FRAG.slice(GROUND_FRAG.indexOf('void main()'));
    expect(main).toMatch(/1\.0 - smoothstep\(20\.0, 120\.0, cameraPosition\.y - vWorld\.y\)/);
  });

  it('starts the shadow ray from the measured ground, not from the drawn craters', () => {
    expect(GROUND_FRAG).toContain('vec3 N0 = normalize(vNormal), Nn = N0;');
    expect(GROUND_FRAG).toContain('sunMargins(vWorld + N0 * 0.4, uSun, edge > 0.0)');
  });

  it('keeps every star below the bloom threshold, so only the Sun blooms', () => {
    expect(STAR_FRAG).toContain('min(vC * a * uGain, vec3(0.95))');
  });

  it('scatters craters irregularly, many small and few large, with rocks and fine grain near the eye', () => {
    const field = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float craterField('), GROUND_FRAG.indexOf('float craters('));
    expect(field).toContain('continue;'); // not every cell holds a crater
    expect(GROUND_FRAG).toMatch(/float craters\(vec2 p, float cell\) \{ return craterField\(p, cell, /);
    expect(GROUND_FRAG).toContain('float stones(vec2 p, float cell, float seed, float presence, float r0, float r1, out float bright)');
    expect(GROUND_FRAG).toContain('float grain(vec2 p, float px)');
  });

  it('places the craters by a hash without sines, which holds its randomness at the cap’s large cell numbers, where a sine’s precision gives out and repeats show', () => {
    const field = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float craterField('), GROUND_FRAG.indexOf('float craters('));
    expect(field).toContain('cellHash(');
    const hash = GROUND_FRAG.slice(GROUND_FRAG.indexOf('vec2 cellHash('), GROUND_FRAG.indexOf('float craterShape('));
    expect(hash).not.toContain('sin(');
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

  it('makes crater rims uneven: each wanders in and out round its crater and stands higher in some places than others, so none is a perfect circle and their shadows have ragged edges', () => {
    const field = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float craterField('), GROUND_FRAG.indexOf('float craters('));
    // A noise taken round the crater, by the direction from its middle, moves the rim in and out and raises and lowers it.
    expect(field).toMatch(/float wander = vnoise\(d \/ max\(dl, [0-9.e-]+\) \* [0-9.]+ \+ rnd \* [0-9.]+\)/);
    expect(field).toMatch(/float r = dl \/ \(rad \* \(1\.0 \+ [^;]*\(wander - 0\.5\)\)\)/);
    expect(field).toMatch(/rim \*= [^;]*wander/);
    // Nearly round, not stretched into perfect ellipses.
    expect(field).not.toContain('1.35');
  });

  it('fades the share of the drawn bumps’ shadows they hide from the eye out as the eye comes round square to the Sun, so the near ground has no straight edge there, smooth on one side and pitted on the other', () => {
    // Before, the share dropped at once from about half to none where the eye stood square to the Sun's way along the
    // ground: a straight line through the ground under the eye, across which the drawn relief and its shadows switched on.
    for (const tanSun of [0.03, 0.1, 0.3, 1]) {
      for (const tanDip of [0.05, 0.3, 1, 5]) {
        expect(hiddenShare(tanSun, tanDip, 1e-4)).toBeLessThan(0.002);
        expect(hiddenShare(tanSun, tanDip, -1e-4)).toBe(0);
        // A tenth of a degree further round changes it by little anywhere: no step.
        let step = 0;
        for (let deg = 0; deg < 180; deg += 0.1) step = Math.max(step, Math.abs(hiddenShare(tanSun, tanDip, Math.cos((deg * Math.PI) / 180)) - hiddenShare(tanSun, tanDip, Math.cos(((deg + 0.1) * Math.PI) / 180))));
        expect(step).toBeLessThan(0.01);
        // Looking within 60 degrees of straight down-Sun it is the share the bumps hide, as before.
        for (const cosPlan of [HIDE_FADE, 0.7, 0.9, 1]) expect(hiddenShare(tanSun, tanDip, cosPlan)).toBeCloseTo(hiddenShadowShare(tanSun, tanDip, cosPlan), 9);
      }
    }
    expect(GROUND_FRAG).toMatch(new RegExp(`float hide = hiddenShadowShare\\([^;]*cosPlan\\) \\* smoothstep\\(0\\.0, ${HIDE_FADE.toFixed(2).replace('.', '\\.')}, cosPlan\\);`));
  });

  it('holds each shadow’s margin within a few widths of the Sun before softening it by its change across a pixel, so a jump from one clear margin to another (where your shadow’s reach ends, square to the Sun under your feet) never darkens a thin line', () => {
    const soft = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float soft(float m)'), GROUND_FRAG.indexOf('void main()'));
    expect(soft).toMatch(/m = clamp\(m, -0\.05, 0\.05\);[^}]*fwidth\(m\)/);
  });

  it('fades each stone’s own shadow out towards the end of its march along the ray, so no stone’s shadow stops along a cell’s edge where its cell drops out of the march', () => {
    const march = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float rockMargin('), GROUND_FRAG.indexOf('float capsuleClear('));
    expect(march).toMatch(/smoothstep\([0-9.]+ \* reach, reach, tc\)/);
  });

  it('keeps each stone inside its own cell, so none is cut off straight along a cell’s edge', () => {
    // Middles kept a quarter of a cell from its edges, and the largest stone, at its lumpiest, narrower than that.
    const stones = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float stones('), GROUND_FRAG.indexOf('float grain('));
    const march = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float rockMargin('), GROUND_FRAG.indexOf('float capsuleClear('));
    expect(stones).toContain('f - (0.25 + 0.5 * rnd)');
    expect(march).toContain('(g + 0.25 + 0.5 * rnd) * cell - p');
    const lump = Number(stones.match(/float lump = 1\.0 \+ ([0-9.]+) \*/)![1]);
    for (const m of GROUND_FRAG.matchAll(/stones\(vWorld\.xz, ([0-9.]+), [0-9.]+, [0-9.]+, [0-9.]+, ([0-9.]+), [a-z0-9]+\)/g)) {
      expect(Number(m[2]) * (1 + lump / 2)).toBeLessThanOrEqual(0.25 * Number(m[1]));
    }
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

  it('casts your shadow as an astronaut’s: two legs apart, a body, a backpack, two arms and a helmet, square to the Sun', () => {
    const viewer = GROUND_FRAG.slice(GROUND_FRAG.indexOf('float viewerClearance('), GROUND_FRAG.indexOf('float soft('));
    expect(viewer.match(/capsuleClear\(p, L,/g)?.length).toBe(7);
    expect(viewer).toContain('backpack');
    expect(viewer).toContain('helmet');
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
    expect(viewer).toContain('side * 0.26');
    expect(viewer).not.toContain('side * 0.27');
  });

  it('lights the night ground a neutral grey: Earth’s blue only when Earth is up', () => {
    expect(GROUND_FRAG).toContain(`vec3(0.62, 0.63, 0.66) * ${NIGHT.GAIN.toFixed(3)} * uNight`);
  });
});
