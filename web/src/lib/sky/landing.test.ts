import { describe, expect, it } from 'vitest';
import { LANDER } from './landerShape';
import { cameraShake, descentHeight, descentShare, dustLight, dustPuffs, dustRate, jetAt, jetShare, JET, LANDING, LandingClock, landingKey, landingStart, plumeGain, puffAt, settleSquash } from './landing';

/** A curve's values at `n + 1` even steps from `a` to `b`. */
const steps = (f: (x: number) => number, a: number, b: number, n = 200) => Array.from({ length: n + 1 }, (_, i) => f(a + ((b - a) * i) / n));
/** The differences from one value to the next. */
const diffs = (v: number[]) => v.slice(1).map((x, i) => x - v[i]);
/** Each step smaller than the one before (a curve that slows down), or larger (one that gathers pace). */
const slowing = (v: number[]) => diffs(diffs(v).map(Math.abs)).every((d) => d < 1e-12);
const quickening = (v: number[]) => diffs(diffs(v).map(Math.abs)).every((d) => d > -1e-12);

describe('the landing’s descent', () => {
  // The eye 2 m over the lander's ground, the lander 16 m off, as the stand view stands it.
  const start = landingStart(2, 16);

  it('starts the lander high in the black sky, a little over the middle of the opening view that looks 34° up, its top well clear of the words over even the narrowest opening', () => {
    expect(Math.atan2(start + LANDING.MID_M - 2, 16) * (180 / Math.PI)).toBeCloseTo(LANDING.START_EL_DEG, 6);
    expect(LANDING.START_EL_DEG).toBeGreaterThan(34);
    // The narrowest opening view is 44° tall (Earth at night on a wide screen), the words over its top 22 % (197 of 900 px
    // at 1440 by 900): the lander's top, its solar panel's, starts 4° or more under them, room for the view tilting a
    // little ahead of it and for its standing to one side of the view's middle.
    const deg = 180 / Math.PI, top = LANDER.panel.c[1] + LANDER.panel.size[1] / 2;
    const words = 34 + Math.atan(((450 - 197) / 450) * Math.tan(22 / deg)) * deg;
    expect(Math.atan2(start + top - 2, 16) * deg).toBeLessThanOrEqual(words - 4);
    // Up a slope from you it starts as high over the eye, so as high in the view; never lower than 8 m over its spot.
    expect(landingStart(-1, 16)).toBeCloseTo(start - 3, 9);
    expect(landingStart(-30, 16)).toBe(LANDING.FLOOR_M);
  });

  it('comes down fast at first, braking all the way to a slow last metre or two, and stands on its spot at touchdown', () => {
    expect(descentHeight(0, start)).toBe(start);
    expect(descentHeight(LANDING.DESCENT_MS, start)).toBe(0);
    expect(descentHeight(LANDING.DESCENT_MS + 500, start)).toBe(0);
    expect(descentHeight(LANDING.MS, start)).toBe(0);
    // Down all the way, and slower all the way: each step drops less than the one before (an ease-out, nothing linear).
    const fall = steps((ms) => descentHeight(ms, start), 0, LANDING.DESCENT_MS);
    for (const d of diffs(fall)) expect(d).toBeLessThan(0);
    expect(slowing(fall)).toBe(true);
    // Fast at first (over 8 m a second), the last two metres slow: well over a second and a half for them.
    expect((descentHeight(0, start) - descentHeight(100, start)) / 0.1).toBeGreaterThan(8);
    const when = (m: number) => steps((ms) => ms, 0, LANDING.DESCENT_MS, 4400).find((ms) => descentHeight(ms, start) <= m)!;
    expect(LANDING.DESCENT_MS - when(2)).toBeGreaterThan(1500);
    expect(LANDING.DESCENT_MS - when(1)).toBeGreaterThan(1000);
    // It still moves as it touches, slowly: half a metre a second or so, which the legs take.
    const last = descentHeight(LANDING.DESCENT_MS - 50, start) / 0.05;
    expect(last).toBeGreaterThan(0.3);
    expect(last).toBeLessThan(0.8);
  });

  it('keeps pace with the opening view as it tilts down: never more than a degree higher in the view than it starts, and below the view’s middle by touchdown', () => {
    // The opening view as StandCanvas tilts it: 34° up, easing out to 2° over 3.8 s; the eye 2 m over level ground.
    const pitch = (ms: number) => 34 + (2 - 34) * (1 - (1 - Math.min(1, ms / 3800)) ** 3);
    const above = (ms: number) => Math.atan2(descentHeight(ms, start) + LANDING.MID_M - 2, 16) * (180 / Math.PI) - pitch(ms);
    const first = above(0);
    for (const ms of steps((t) => t, 0, LANDING.DESCENT_MS, 88)) expect(above(ms)).toBeLessThanOrEqual(first + 1);
    expect(above(LANDING.DESCENT_MS)).toBeLessThan(0);
  });

  it('says how far down the lander has come, from none as it starts to all of it at touchdown, most of it early', () => {
    expect(descentShare(0)).toBe(0);
    expect(descentShare(LANDING.DESCENT_MS)).toBe(1);
    expect(descentShare(LANDING.MS)).toBe(1);
    const v = steps((ms) => descentShare(ms), 0, LANDING.DESCENT_MS, 100);
    for (const d of diffs(v)) expect(d).toBeGreaterThan(0);
    expect(slowing(v)).toBe(true);
    expect(descentShare(LANDING.DESCENT_MS / 2)).toBeCloseTo(1 - descentHeight(LANDING.DESCENT_MS / 2, start) / start, 12);
  });

  it('settles on its legs at touchdown: a bounce that eases in and dies away, still within a second', () => {
    expect(settleSquash(0)).toBe(0);
    expect(settleSquash(LANDING.DESCENT_MS - 1)).toBe(0);
    expect(settleSquash(LANDING.DESCENT_MS)).toBe(0);
    const v = steps((ms) => settleSquash(ms), LANDING.DESCENT_MS, LANDING.DESCENT_MS + LANDING.SETTLE_MS, 300);
    // Down on its legs by a few per cent at most, soon after it touches, then back past where it stood, and home.
    const most = Math.max(...v);
    expect(most).toBeGreaterThan(0.015);
    expect(most).toBeLessThan(0.05);
    expect(v.indexOf(most) / 300).toBeLessThan(0.3);
    expect(Math.min(...v)).toBeLessThan(0);
    expect(Math.abs(Math.min(...v))).toBeLessThan(most / 3);
    // Smooth: no step from one moment to the next, and it comes to rest gently, not to a stop.
    for (const d of diffs(v)) expect(Math.abs(d)).toBeLessThan(0.002);
    expect(Math.abs(v[300] - v[299])).toBeLessThan(1e-6);
    expect(settleSquash(LANDING.DESCENT_MS + LANDING.SETTLE_MS)).toBe(0);
    expect(settleSquash(LANDING.MS)).toBe(0);
    expect(LANDING.SETTLE_MS).toBeLessThanOrEqual(1000);
  });
});

describe('the landing’s plume', () => {
  const start = landingStart(2, 16);

  it('burns from the first frame, brighter the nearer the ground, slowly at first, about twice as bright at the last', () => {
    expect(plumeGain(0, start)).toBeGreaterThan(0.3);
    const g = steps((ms) => plumeGain(ms, descentHeight(ms, start)), 0, LANDING.DESCENT_MS - 1, 100);
    for (const d of diffs(g)) expect(d).toBeGreaterThanOrEqual(0);
    expect(g[100] / g[0]).toBeGreaterThan(1.8);
    expect(Math.max(...g)).toBeLessThanOrEqual(1);
    // As the ground nears it brightens ever faster: an ease-in on how near it is.
    const near = steps((h) => plumeGain(0, h), LANDING.PLUME_NEAR_M, 0, 100);
    for (const d of diffs(near)) expect(d).toBeGreaterThan(0);
    expect(quickening(near)).toBe(true);
  });

  it('cuts at touchdown: gone within a sixth of a second, falling fastest at first', () => {
    expect(plumeGain(LANDING.DESCENT_MS, 0)).toBe(1);
    expect(plumeGain(LANDING.DESCENT_MS + LANDING.PLUME_CUT_MS, 0)).toBe(0);
    expect(plumeGain(LANDING.MS, 0)).toBe(0);
    const cut = steps((ms) => plumeGain(ms, 0), LANDING.DESCENT_MS, LANDING.DESCENT_MS + LANDING.PLUME_CUT_MS, 40);
    for (const d of diffs(cut)) expect(d).toBeLessThan(0);
    expect(slowing(cut)).toBe(true);
    expect(LANDING.PLUME_CUT_MS).toBeLessThanOrEqual(170);
  });

  it('sends its puffs out of the bell one after another, a steady stream', () => {
    const shares = Array.from({ length: JET.PUFFS }, (_, k) => jetShare(k, 1234)).sort((a, b) => a - b);
    for (const s of shares) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
    // No gap in the stream wider than three puffs' turns.
    const gaps = [...diffs(shares), shares[0] + 1 - shares[shares.length - 1]];
    expect(Math.max(...gaps)).toBeLessThan(3 / JET.PUFFS);
    // Each puff a LIFE_MS later is where it was.
    expect(jetShare(5, 1234 + JET.LIFE_MS)).toBeCloseTo(jetShare(5, 1234), 9);
  });

  it('streams each puff down out of the nozzle, fast at first then slowing, widening a little, growing and fading out with an ease-in', () => {
    for (let k = 0; k < JET.PUFFS; k += 9) {
      // High over the ground: straight down a little over 3 m, widening by a fifth of that at most.
      const life = Array.from({ length: 41 }, (_, i) => jetAt(k, i / 41, 12));
      const down = life.map((p) => p.down);
      for (const d of diffs(down)) expect(d).toBeGreaterThan(0);
      expect(slowing(down)).toBe(true);
      expect(Math.max(...down)).toBeLessThanOrEqual(JET.LENGTH_M);
      expect(Math.max(...down)).toBeGreaterThan(0.9 * JET.LENGTH_M);
      for (const p of life) {
        expect(p.out).toBeGreaterThanOrEqual(0);
        expect(p.out).toBeLessThanOrEqual(0.2 * p.down + 1e-9);
      }
      for (const d of diffs(life.map((p) => p.size))) expect(d).toBeGreaterThan(0);
      // In quickly, then out ever faster, to nearly nothing.
      const fade = life.slice(8).map((p) => p.alpha);
      for (const d of diffs(fade)) expect(d).toBeLessThan(0);
      expect(quickening(fade)).toBe(true);
      expect(fade[fade.length - 1]).toBeLessThan(0.1 * Math.max(...life.map((p) => p.alpha)));
    }
  });

  it('spreads its puffs a little way out over the ground once they meet it, fading out as they spread, never under it', () => {
    const low = Array.from({ length: JET.PUFFS }, (_, k) => jetAt(k, jetShare(k, 1234), 0.6));
    for (const p of low) expect(p.down).toBeLessThanOrEqual(0.6);
    // One puff's life on the ground: out and out over it, dimmer and dimmer, gone within SPLASH_M of where it met it.
    for (const k of [0, 17, 63]) {
      const onGround = Array.from({ length: 81 }, (_, i) => jetAt(k, i / 81, 0.6)).filter((p, i) => i / 81 >= 0.1 && p.down >= 0.6);
      expect(onGround.length).toBeGreaterThan(20);
      for (const d of diffs(onGround.map((p) => p.out))) expect(d).toBeGreaterThan(0);
      for (const d of diffs(onGround.map((p) => p.alpha))) expect(d).toBeLessThanOrEqual(0);
      expect(Math.max(...onGround.map((p) => p.out))).toBeGreaterThan(1);
      expect(onGround.at(-1)!.alpha).toBe(0);
      for (const p of onGround) if (p.out > JET.SPREAD * JET.LENGTH_M + JET.SPLASH * JET.SPLASH_M) expect(p.alpha).toBe(0);
    }
  });
});

describe('the landing’s dust', () => {
  const start = landingStart(2, 16);
  const puffs = dustPuffs(1234, start);
  const blown = puffs.filter((p) => !p.burst), burst = puffs.filter((p) => p.burst);
  const heightAt = (ms: number) => descentHeight(ms, start);

  it('blows up dust only within 9 m of the ground, the more the nearer, slowly at first', () => {
    expect(LANDING.DUST_FROM_M).toBe(9);
    expect(dustRate(LANDING.DUST_FROM_M)).toBe(0);
    expect(dustRate(20)).toBe(0);
    expect(dustRate(0)).toBe(1);
    const r = steps((h) => dustRate(h), LANDING.DUST_FROM_M, 0, 90);
    for (const d of diffs(r)) expect(d).toBeGreaterThan(0);
    expect(quickening(r)).toBe(true);
  });

  it('gives each puff of blown dust a time to rise as the lander nears, the more of them the nearer, and a burst at touchdown', () => {
    expect(blown.length).toBeGreaterThanOrEqual(400);
    expect(burst.length).toBeGreaterThanOrEqual(150);
    // None while the lander is still high; the last ones as it touches.
    for (const p of blown) {
      expect(heightAt(p.born)).toBeLessThan(LANDING.DUST_FROM_M);
      expect(p.born).toBeLessThanOrEqual(LANDING.DESCENT_MS);
    }
    // More of them for each metre it comes down than for the metre before.
    const band = (k: number) => blown.filter((p) => Math.floor((heightAt(p.born) / LANDING.DUST_FROM_M) * 4) === 3 - k).length;
    expect(band(1)).toBeGreaterThan(band(0));
    expect(band(2)).toBeGreaterThan(band(1));
    expect(band(3)).toBeGreaterThan(band(2));
    // The burst at touchdown, all within a tenth of a second.
    for (const p of burst) {
      expect(p.born).toBeGreaterThanOrEqual(LANDING.DESCENT_MS);
      expect(p.born).toBeLessThan(LANDING.DESCENT_MS + 100);
    }
    // The same puffs for the same site on every visit.
    expect(dustPuffs(1234, start)).toEqual(puffs);
    expect(dustPuffs(99, start)).not.toEqual(puffs);
  });

  it('sends each puff out along the ground from under the engine, fast at first then slowing, rising a little, growing and fading out with an ease-in', () => {
    for (const p of [...blown.filter((_, i) => i % 16 === 0), ...burst.filter((_, i) => i % 8 === 0)]) {
      expect(puffAt(p, p.born - 1)).toBeNull();
      expect(puffAt(p, p.born + p.life)).toBeNull();
      const life = Array.from({ length: 41 }, (_, i) => puffAt(p, p.born + (p.life - 1) * (i / 40))!);
      const out = life.map((s) => s.r);
      for (const d of diffs(out)) expect(d).toBeGreaterThan(0);
      expect(slowing(out)).toBe(true);
      // Out from under the engine: from within 2 m of the spot to no more than 12 m from it, short of the eye 16 m off.
      expect(life[0].r).toBeLessThan(2);
      expect(life[40].r).toBeLessThan(12);
      // A little above the ground, never under it, never higher than a person.
      for (const s of life) {
        expect(s.lift).toBeGreaterThanOrEqual(0);
        expect(s.lift).toBeLessThan(1.8);
      }
      for (const d of diffs(life.map((s) => s.size))) expect(d).toBeGreaterThan(0);
      // In quickly, then out ever faster, to nearly nothing.
      const top = Math.max(...life.map((s) => s.alpha));
      expect(top).toBeLessThanOrEqual(p.alpha);
      const fade = life.slice(10).map((s) => s.alpha);
      for (const d of diffs(fade)) expect(d).toBeLessThan(0);
      expect(quickening(fade)).toBe(true);
      expect(life[40].alpha).toBeLessThan(0.1 * top);
    }
    // The burst flies further and higher than the dust blown before it, on average.
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(mean(burst.map((p) => p.reach))).toBeGreaterThan(mean(blown.map((p) => p.reach)));
    expect(mean(burst.map((p) => p.rise))).toBeGreaterThan(mean(blown.map((p) => p.rise)));
  });

  it('lights the dust as the ground round it is lit: grey in sunlight, faintly blue by Earthlight, faint at night, black with no light', () => {
    const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const day = dustLight(1, 0, 0), half = dustLight(0.5, 0, 0), earth = dustLight(0, 0.25, 0), night = dustLight(0, 0, 0.35);
    // In sunlight a grey as dim as the regolith's at a low Sun, under the bloom's threshold, and only in its sunlit part.
    expect(Math.max(...day.sun)).toBeLessThan(0.5);
    expect(lum(day.sun)).toBeGreaterThan(0.1);
    expect(day.sun[0]).toBeGreaterThanOrEqual(day.sun[2]);
    expect(day.rest).toEqual([0, 0, 0]);
    for (let i = 0; i < 3; i++) expect(half.sun[i]).toBeCloseTo(day.sun[i] / 2, 9);
    // Earth's light blue, the night's faint grey; both far dimmer than the Sun's.
    expect(earth.sun).toEqual([0, 0, 0]);
    expect(earth.rest[2]).toBeGreaterThan(earth.rest[0]);
    expect(lum(earth.rest)).toBeLessThan(lum(day.sun) / 4);
    expect(lum(night.rest)).toBeGreaterThan(0);
    expect(lum(night.rest)).toBeLessThan(lum(day.sun) / 4);
    expect(dustLight(0, 0, 0)).toEqual({ sun: [0, 0, 0], rest: [0, 0, 0] });
  });

  it('is over in 5 to 7 seconds: the last of the dust gone by the landing’s end, still settling a second and a half after touchdown', () => {
    expect(LANDING.MS).toBeGreaterThanOrEqual(5000);
    expect(LANDING.MS).toBeLessThanOrEqual(7000);
    for (const p of puffs) expect(p.born + p.life).toBeLessThanOrEqual(LANDING.MS);
    expect(puffs.some((p) => puffAt(p, LANDING.DESCENT_MS + 1500) !== null)).toBe(true);
  });
});

describe('the touchdown’s shake', () => {
  it('shakes the view a little at touchdown, from rest and back to it, dying away smoothly', () => {
    for (const ms of [0, LANDING.DESCENT_MS - 1, LANDING.DESCENT_MS, LANDING.DESCENT_MS + LANDING.SHAKE_MS, LANDING.MS]) expect(cameraShake(ms)).toEqual({ yaw: 0, pitch: 0 });
    const s = steps((ms) => cameraShake(ms).pitch, LANDING.DESCENT_MS, LANDING.DESCENT_MS + LANDING.SHAKE_MS, 400);
    const y = steps((ms) => cameraShake(ms).yaw, LANDING.DESCENT_MS, LANDING.DESCENT_MS + LANDING.SHAKE_MS, 400);
    // Small: under half a degree either way, a few pixels; both ways.
    expect(Math.max(...s.map(Math.abs))).toBeGreaterThan(0.1);
    expect(Math.max(...s.map(Math.abs), ...y.map(Math.abs))).toBeLessThan(0.5);
    expect(Math.min(...s)).toBeLessThan(0);
    expect(Math.max(...s)).toBeGreaterThan(0);
    // Each stretch's swing smaller than the last: the biggest at first, next to nothing left at the end.
    const swing = (a: number, b: number) => Math.max(...s.slice(a, b).map(Math.abs));
    expect(swing(0, 80)).toBeGreaterThan(swing(80, 160));
    expect(swing(80, 160)).toBeGreaterThan(swing(160, 240));
    expect(swing(160, 240)).toBeGreaterThan(swing(320, 400));
    expect(swing(320, 400)).toBeLessThan(0.05 * swing(0, 80));
    // No jump from one moment to the next.
    for (const d of [...diffs(s), ...diffs(y)]) expect(Math.abs(d)).toBeLessThan(0.08);
  });
});

describe('the landing’s clock', () => {
  it('starts at the first frame drawn after the landing is asked for, not when it is asked for, and holds at its end', () => {
    const c = new LandingClock();
    // Never asked for (reduced motion, the home page's arrival): no landing at all.
    expect(c.frame(1000)).toBeNull();
    c.ask();
    // The shaders may take seconds to build: the landing waits for the first frame drawn, at 5000 ms.
    expect(c.frame(5000)).toBe(0);
    expect(c.frame(5016)).toBe(16);
    expect(c.frame(5000 + LANDING.DESCENT_MS)).toBe(LANDING.DESCENT_MS);
    expect(c.frame(5000 + LANDING.MS + 3000)).toBe(LANDING.MS);
    // Asked for again, it plays once only.
    c.ask();
    expect(c.frame(20000)).toBe(LANDING.MS);
  });

  it('puts the landing’s time in the frame’s key while it plays, so every frame of it is drawn, and nothing once it is over, so none is', () => {
    expect(landingKey(null)).toBe('');
    expect(landingKey(LANDING.MS)).toBe('');
    const keys = [0, 16, 33, 2000, LANDING.MS - 1].map(landingKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).not.toBe('');
  });
});
