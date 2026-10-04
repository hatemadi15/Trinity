/*
 * The arrival's timing, with no three.js in it: the home page's section imports this, and three.js stays in
 * the stage that loads after it.
 */

/** The progress of each key: the Moon, the pole, the pole again (the sweep's end), the cap, the ridge, standing. */
export const STOPS = [0, 1, 1.5, 2, 3, 4] as const;
/** Where each beat's words stand: the first screen, the pole mid-sweep, the cap, the ridge, standing. */
export const BEAT_STOPS = [0, 1.25, 2, 3, 4] as const;
/** While the camera holds over the pole the hours run through one synodic month: the Sun goes once round. */
export const SWEEP = { from: 1, to: 1.5, hours: 708.73 } as const;
/** Seconds of play from stop to stop: fifteen in all, the video's first fifteen seconds. */
export const PLAY = [3, 3.5, 2, 3, 3.5] as const;

/** 0 to 1 with no speed at either end: the camera rests at each stop. */
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function hourAt(p: number, startHour: number, reduced = false): number {
  if (reduced || p <= SWEEP.from || p >= SWEEP.to) return startHour;
  return startHour + SWEEP.hours * smoother((p - SWEEP.from) / (SWEEP.to - SWEEP.from));
}

/** Straight between the beats' stops: screen k is beat k. */
export function progressFromScroll(screens: number): number {
  const s = Math.min(BEAT_STOPS.length - 1, Math.max(0, screens)), k = Math.min(BEAT_STOPS.length - 2, Math.floor(s));
  return BEAT_STOPS[k] + (BEAT_STOPS[k + 1] - BEAT_STOPS[k]) * (s - k);
}

export function scrollFromProgress(p: number): number {
  const q = Math.min(4, Math.max(0, p));
  let k = 0;
  while (k < BEAT_STOPS.length - 2 && q > BEAT_STOPS[k + 1]) k++;
  return k + (q - BEAT_STOPS[k]) / (BEAT_STOPS[k + 1] - BEAT_STOPS[k]);
}

export function playProgress(seconds: number): number {
  let t = Math.max(0, seconds);
  for (let k = 0; k < PLAY.length; k++) {
    if (t <= PLAY[k]) return STOPS[k] + (STOPS[k + 1] - STOPS[k]) * (t / PLAY[k]);
    t -= PLAY[k];
  }
  return 4;
}

export function playSeconds(p: number): number {
  const q = Math.min(4, Math.max(0, p));
  let t = 0;
  for (let k = 0; k < PLAY.length; k++) {
    if (q <= STOPS[k + 1]) return t + (PLAY[k] * (q - STOPS[k])) / (STOPS[k + 1] - STOPS[k]);
    t += PLAY[k];
  }
  return t;
}
