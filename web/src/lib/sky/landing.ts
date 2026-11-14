import { LANDER } from './landerShape';

/*
 * The landing (the stand view's opening on a landing): from the view's first frame the lander comes down out of the black
 * sky onto its spot, its engine's plume under it, blowing the dust out along the ground as it nears it; it touches down,
 * with a burst of dust and a small shake of the view, settles on its legs, and the dust settles. Every motion is eased,
 * slow then faster or fast then slow, never at a constant speed. Times are milliseconds from the landing's first frame;
 * heights are metres over the lander's spot. Here only the timing, as numbers; landingMesh.ts draws it.
 */

/**
 * The landing's timeline (milliseconds from its first frame) and its sizes. The descent takes DESCENT_MS, from START_EL_DEG
 * up from the eye (the lander's middle, MID_M over its pads' soles: the body's middle), and never from under FLOOR_M over
 * its spot; at touchdown it still moves at LAST_SHARE of the speed a steady descent would have, so its legs have something
 * to take. The legs give by up to SETTLE of its height and settle over SETTLE_MS. The plume (from the bell's mouth,
 * NOZZLE_M over the soles) burns at PLUME_LOW of its brightness high up and brightens over the last PLUME_NEAR_M, and is
 * cut over PLUME_CUT_MS at touchdown. The exhaust blows dust up within DUST_FROM_M of the ground. The touchdown shakes the
 * view for SHAKE_MS, by up to SHAKE_DEG round (yaw) and up and down (pitch), SHAKE_HZ times a second. All of it is over
 * by MS, the last of the dust gone.
 */
export const LANDING = {
  DESCENT_MS: 4400,
  START_EL_DEG: 37,
  MID_M: (LANDER.body.y0 + LANDER.body.y1) / 2,
  FLOOR_M: 8,
  LAST_SHARE: 0.15,
  SETTLE: 0.04,
  SETTLE_MS: 750,
  NOZZLE_M: LANDER.bell.y0,
  PLUME_LOW: 0.5,
  PLUME_NEAR_M: 10,
  PLUME_CUT_MS: 150,
  DUST_FROM_M: 9,
  SHAKE_MS: 800,
  SHAKE_DEG: { yaw: 0.22, pitch: 0.4 },
  SHAKE_HZ: { yaw: 7, pitch: 11 },
  MS: 6800,
} as const;

/**
 * The plume's stream: PUFFS puffs leave the bell's mouth one after another, each living LIFE_MS, travelling LENGTH_M down
 * in a cone that widens by up to SPREAD of the way gone; past the ground, out over it SPLASH times as fast, fading out
 * within SPLASH_M of where it met it, where the dust it blows up carries on.
 */
export const JET = { PUFFS: 160, LIFE_MS: 340, LENGTH_M: 4.5, SPREAD: 0.2, SPLASH: 1.6, SPLASH_M: 1 } as const;

/**
 * The dust: BLOWN puffs blown up as the lander comes down, BURST more thrown up at touchdown; each lives LIFE_MS (the
 * shortest and the longest), flies out REACH_M from where it rises (the most, the burst's further), rises RISE_M, grows
 * from SIZE_M[0] to SIZE_M[1] across and is at most ALPHA opaque (the burst's ranges after the blown dust's).
 */
export const DUST = {
  BLOWN: 640,
  BURST: 240,
  LIFE_MS: { blown: [1300, 2200], burst: [1400, 2300] },
  REACH_M: { blown: [2.5, 8.5], burst: [3.5, 10] },
  RISE_M: { blown: [0.1, 0.45], burst: [0.25, 0.9] },
  SIZE_M: { blown: [[0.25, 0.45], [0.9, 1.7]], burst: [[0.4, 0.7], [1.3, 2.3]] },
  ALPHA: { blown: [0.14, 0.3], burst: [0.22, 0.4] },
} as const;

/**
 * How the dust takes the light, against the ground shader's own terms for level regolith: its albedo (REGOLITH) under the
 * Sun's power (SUN_POWER, as the ground's) times SUN, a cloud of grains lit from the side; Earth's blue light times EARTH;
 * and the night's faint light for eyes adapting to the dark (NIGHT_RGB, as the ground's, times its gain) times NIGHT.
 */
const DUST_LIGHT = { REGOLITH: [0.17, 0.164, 0.156], SUN_RGB: [1, 0.99, 0.975], SUN_POWER: 3.4, SUN: 0.25, EARTH_RGB: [0.5, 0.62, 1], EARTH: 0.5, NIGHT_RGB: [0.62, 0.63, 0.66], NIGHT_GAIN: 1.09, NIGHT: 0.8 } as const;

/**
 * The dust's colour (linear) for the light at the hour, as the ground round it takes it: `sun`, its sunlit part, for the
 * share of the Sun's disc that is up (`sunFraction`), which the view brightens where it looks towards the Sun, as fine
 * dust does; and `rest`, Earth's light on it (`earthshine`, the ground's) and the night's (`night`, the ground's).
 */
export function dustLight(sunFraction: number, earthshine: number, night: number): { sun: [number, number, number]; rest: [number, number, number] } {
  const L = DUST_LIGHT, k = L.SUN_POWER * L.SUN * sunFraction;
  const at = (i: number) => L.REGOLITH[i] * (L.EARTH_RGB[i] * L.EARTH * earthshine + L.NIGHT_RGB[i] * L.NIGHT_GAIN * L.NIGHT * night);
  return { sun: [0, 1, 2].map((i) => L.REGOLITH[i] * L.SUN_RGB[i] * k) as [number, number, number], rest: [at(0), at(1), at(2)] };
}

/** A small seeded random number generator (mulberry32): the same seed gives the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from 0 to 1 for a key, the same each time: an integer hash of it. */
function unit(key: number): number {
  let h = Math.imul(key + 1, 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Fast at first, then slowing to a stop (ease-outs, a cubic and a gentler square), over x from 0 to 1. */
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const outQuad = (x: number) => 1 - (1 - x) ** 2;
/** A share of the way from a to b. */
const mix = (a: number, b: number, share: number) => a + (b - a) * share;
const pick = (r: readonly [number, number] | readonly number[], share: number) => mix(r[0], r[1], share);

/**
 * How high over its spot the lander starts: its middle START_EL_DEG up from the eye, `distM` off, the eye `riseM` over the
 * lander's ground, so it starts as high in the view on a slope as on the level; never lower than FLOOR_M.
 */
export function landingStart(riseM: number, distM: number): number {
  return Math.max(LANDING.FLOOR_M, distM * Math.tan((LANDING.START_EL_DEG * Math.PI) / 180) + riseM - LANDING.MID_M);
}

/**
 * How high over its spot the lander is `ms` into the landing, from `startM`: fast at first, braking all the way down to a
 * slow last metre or two (an ease-out: a fourth power's fall with LAST_SHARE of a steady one's speed kept at the end), on
 * its spot from touchdown on. Fast enough at first to keep pace with the opening view as it tilts down (an ease-out
 * cubic over 3.8 s), so it never climbs the view towards the words over it.
 */
export function descentHeight(ms: number, startM: number): number {
  if (ms <= 0) return startM;
  if (ms >= LANDING.DESCENT_MS) return 0;
  const x = 1 - ms / LANDING.DESCENT_MS, k = LANDING.LAST_SHARE;
  return startM * ((1 - k) * x * x * x * x + k * x);
}

/** How far down the lander has come `ms` into the landing, as a share of the way: 0 as it starts, most of it early, 1 from touchdown on. */
export function descentShare(ms: number): number {
  return 1 - descentHeight(ms, 1);
}

/**
 * How far the lander's legs give (a share of its height, its soles staying where they stand) `ms` into the landing: from
 * touchdown a bounce, down on them and back a little past where it stood, its swings dying away (eased: they start as the
 * lander moves and come to rest without a stop), still SETTLE_MS on.
 */
export function settleSquash(ms: number): number {
  const s = (ms - LANDING.DESCENT_MS) / LANDING.SETTLE_MS;
  if (!(s > 0 && s < 1)) return 0;
  return LANDING.SETTLE * Math.sin(2.5 * Math.PI * s) * (1 - s) * (1 - s);
}

/**
 * How bright the plume is (0 to 1) `ms` into the landing with the lander `heightM` over its spot: PLUME_LOW high up,
 * brightening ever faster over the last PLUME_NEAR_M (an ease-in on how near the ground is), and cut at touchdown, falling
 * fastest at first, to nothing over PLUME_CUT_MS.
 */
export function plumeGain(ms: number, heightM: number): number {
  const cut = (ms - LANDING.DESCENT_MS) / LANDING.PLUME_CUT_MS;
  if (cut >= 1) return 0;
  const near = 1 - Math.min(1, Math.max(0, heightM) / LANDING.PLUME_NEAR_M);
  const g = LANDING.PLUME_LOW + (1 - LANDING.PLUME_LOW) * near * near;
  return cut > 0 ? g * (1 - cut) ** 3 : g;
}

/** How much dust the exhaust blows up with the lander `heightM` over its spot: none from DUST_FROM_M up, the more the nearer, gathering pace (an ease-in). */
export function dustRate(heightM: number): number {
  const near = 1 - Math.min(1, Math.max(0, heightM) / LANDING.DUST_FROM_M);
  return near * near;
}

/**
 * How far the view shakes (degrees round and up) `ms` into the landing: from touchdown, a quick shiver both ways, the
 * view dipping first, that starts from rest and dies away smoothly over SHAKE_MS (its swings shrinking as the cube of what
 * is left), none before or after.
 */
export function cameraShake(ms: number): { yaw: number; pitch: number } {
  const t = ms - LANDING.DESCENT_MS;
  if (!(t > 0 && t < LANDING.SHAKE_MS)) return { yaw: 0, pitch: 0 };
  const k = (1 - t / LANDING.SHAKE_MS) ** 3, sec = t / 1000;
  return { yaw: LANDING.SHAKE_DEG.yaw * k * Math.sin(2 * Math.PI * LANDING.SHAKE_HZ.yaw * sec), pitch: -LANDING.SHAKE_DEG.pitch * k * Math.sin(2 * Math.PI * LANDING.SHAKE_HZ.pitch * sec) };
}

/** How far through its life the plume's k-th puff is `ms` into the landing (0 to 1): they leave the bell one after another, PUFFS a life. */
export function jetShare(k: number, ms: number): number {
  const x = ms / JET.LIFE_MS + (k + 0.6 * unit(k)) / JET.PUFFS;
  return x - Math.floor(x);
}

/**
 * The plume's k-th puff `s` of the way through its life (jetShare), the bell's mouth `gapM` over the ground: how far below
 * the mouth it is (`down`) and how far out from under it (`out`, towards `angle`, radians round), how wide (metres) and
 * how opaque. It leaves fast and slows (an ease-out), the cone widening; past the ground it goes no lower, spreads out
 * over it and fades out within SPLASH_M of where it met it (faster at first: an ease-out). It grows as it goes, comes in
 * quickly and fades out ever faster (an ease-in).
 */
export function jetAt(k: number, s: number, gapM: number): { down: number; out: number; angle: number; size: number; alpha: number } {
  const d = JET.LENGTH_M * outQuad(s), wide = 0.35 + 0.65 * unit(k + 7919), past = Math.max(0, d - Math.max(0, gapM));
  const left = 1 - Math.min(1, past / JET.SPLASH_M);
  return {
    down: Math.min(d, Math.max(0, gapM)),
    out: JET.SPREAD * wide * d + past * JET.SPLASH,
    angle: 2 * Math.PI * unit(k + 104729),
    size: 0.16 + 0.1 * unit(k + 1299709) + 0.5 * outQuad(s),
    alpha: 0.4 * outQuad(Math.min(1, s / 0.1)) * (1 - s * s) * left * left,
  };
}

/**
 * A puff of dust: when it rises (`born`) and how long it lives (ms); the way it flies (`angle`, radians round from +x
 * towards +z), from how far out under the engine (`from`) and how much further (`reach`), how high it rises, its size
 * as it rises and at the end, how opaque it is at most, how much flatter than round it looks (`flat`, 1 round), and
 * whether it is the touchdown's burst.
 */
export interface Puff {
  born: number;
  life: number;
  angle: number;
  from: number;
  reach: number;
  rise: number;
  size0: number;
  size1: number;
  alpha: number;
  flat: number;
  burst: boolean;
}

/**
 * The landing's dust for a site (`seed`) and a descent from `startM`: the dust the exhaust blows up as the lander comes
 * down, the more the nearer it is (dustRate), each puff the further and higher the nearer it was; then a burst at
 * touchdown, from round the pads, flying further and higher. The same puffs for the same site on every visit.
 */
export function dustPuffs(seed: number, startM: number): Puff[] {
  const rnd = seeded(seed ^ 0x5bd1e995);
  // Where the lander comes within DUST_FROM_M: the dust's first moment.
  let lo = 0, hi: number = LANDING.DESCENT_MS;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (descentHeight(mid, startM) > LANDING.DUST_FROM_M) lo = mid;
    else hi = mid;
  }
  // The rate summed from then to touchdown, in N steps, each step's rate at its end; a puff's time is where the sum
  // reaches its share of the whole.
  const N = 400, from = hi, sum = new Float64Array(N + 1), at = (i: number) => from + ((LANDING.DESCENT_MS - from) * i) / N;
  for (let i = 1; i <= N; i++) sum[i] = sum[i - 1] + dustRate(descentHeight(at(i), startM));
  const puffs: Puff[] = [];
  const B = DUST;
  for (let i = 0, j = 1; i < B.BLOWN; i++) {
    const q = ((i + rnd()) / B.BLOWN) * sum[N];
    while (j < N && sum[j] < q) j++;
    const f = (q - sum[j - 1]) / Math.max(1e-12, sum[j] - sum[j - 1]);
    const born = mix(at(j - 1), at(j), Math.min(1, Math.max(0, f)));
    const h = descentHeight(born, startM), near = 1 - Math.min(1, h / LANDING.DUST_FROM_M);
    puffs.push({
      born,
      life: pick(B.LIFE_MS.blown, rnd()),
      angle: 2 * Math.PI * rnd(),
      // From further out under a higher engine, whose exhaust spreads wider before it meets the ground.
      from: 0.25 + 0.15 * h * rnd(),
      reach: pick(B.REACH_M.blown, rnd()) * (0.45 + 0.55 * near),
      rise: pick(B.RISE_M.blown, rnd()) * (0.5 + 0.5 * near),
      size0: pick(B.SIZE_M.blown[0], rnd()),
      size1: pick(B.SIZE_M.blown[1], rnd()),
      alpha: pick(B.ALPHA.blown, rnd()),
      flat: 0.45 + 0.25 * rnd(),
      burst: false,
    });
  }
  for (let i = 0; i < B.BURST; i++) {
    puffs.push({
      born: LANDING.DESCENT_MS + 60 * rnd(),
      life: pick(B.LIFE_MS.burst, rnd()),
      angle: 2 * Math.PI * rnd(),
      from: 0.6 + rnd(),
      reach: pick(B.REACH_M.burst, rnd()),
      rise: pick(B.RISE_M.burst, rnd()),
      size0: pick(B.SIZE_M.burst[0], rnd()),
      size1: pick(B.SIZE_M.burst[1], rnd()),
      alpha: pick(B.ALPHA.burst, rnd()),
      flat: 0.6 + 0.25 * rnd(),
      burst: true,
    });
  }
  return puffs;
}

/**
 * A puff `ms` into the landing, or null before it rises and once it has gone: how far out from the spot it is (`r`),
 * how high over the ground (`lift`), how wide (metres) and how opaque. It flies out fast and slows (an ease-out), rises a
 * little and sinks back a little as it settles, grows, comes in quickly and fades out ever faster (an ease-in).
 */
export function puffAt(p: Puff, ms: number): { r: number; lift: number; size: number; alpha: number } | null {
  if (!(ms >= p.born && ms < p.born + p.life)) return null;
  const s = (ms - p.born) / p.life, up = outQuad(s);
  return {
    r: p.from + p.reach * outCubic(s),
    lift: p.rise * up * (1 - 0.4 * s * s),
    size: mix(p.size0, p.size1, up),
    alpha: p.alpha * outQuad(Math.min(1, s / 0.12)) * (1 - s * s),
  };
}

/**
 * The landing's clock, for the renderer: once asked for (`ask`), it starts at the next frame drawn, so shaders still
 * building never eat into it; then each frame gives the landing's time, held at LANDING.MS once it is over, and null
 * when it was never asked for. It plays once only.
 */
export class LandingClock {
  private asked = false;
  private at: number | null = null;

  ask() {
    this.asked = true;
  }

  /** The landing's time (ms) at a frame drawn at `now`, or null when no landing was asked for. */
  frame(now: number): number | null {
    if (!this.asked) return null;
    if (this.at === null) this.at = now;
    return Math.min(LANDING.MS, now - this.at);
  }
}

/** The landing's part of the frame pacer's key: its time while it plays, so each of its frames is drawn, and nothing once it is over (or never asked for), so the view comes to rest. */
export function landingKey(ms: number | null): string {
  return ms === null || ms >= LANDING.MS ? '' : ms.toFixed(1);
}
