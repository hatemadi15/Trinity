/*
 * The arrival's timing, with no three.js in it: the home page's section imports this, and three.js stays in
 * the stage that loads after it.
 */

/**
 * The progress of each key: the Moon, the pole, the pole again (the sweep's end), the cap, the ridge, standing,
 * and standing at the end of the month at the site.
 */
export const STOPS = [0, 1, 1.5, 2, 3, 4, 5] as const;
/** The flight's last stop and the arrival's: standing at the end of the month at the site. */
export const LAST = 5;
/**
 * Where each beat's words stand, a screen each: the first screen, the pole mid-sweep, the cap, the ridge,
 * standing, the month at the site half run, its end.
 */
export const BEAT_STOPS = [0, 1.25, 2, 3, 4, 4.5, 5] as const;
/** While the camera holds over the pole the hours run through one synodic month: the Sun goes once round. */
export const SWEEP = { from: 1, to: 1.5, hours: 708.73 } as const;
/** After landing the hours run on at the site, at an even pace, to the end of the story (`siteEndHour`). */
export const SITE = { from: 4, to: 5 } as const;
/** Seconds of play from stop to stop: fifteen to standing, the video's first fifteen seconds, then six through the month. */
export const PLAY = [3, 3.5, 2, 3, 3.5, 6] as const;

/** 0 to 1 with no speed at either end: the camera rests at each stop. */
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** The hour shown at progress `p`: the landing hour, the month's sweep over the pole, then the month at the site. */
export function hourAt(p: number, startHour: number, reduced = false, siteEndHour = startHour): number {
  if (p >= SITE.to) return siteEndHour;
  if (p > SITE.from) return reduced ? startHour : startHour + ((siteEndHour - startHour) * (p - SITE.from)) / (SITE.to - SITE.from);
  if (reduced || p <= SWEEP.from || p >= SWEEP.to) return startHour;
  return startHour + SWEEP.hours * smoother((p - SWEEP.from) / (SWEEP.to - SWEEP.from));
}

/** Straight between the beats' stops: screen k is beat k. */
export function progressFromScroll(screens: number): number {
  const s = Math.min(BEAT_STOPS.length - 1, Math.max(0, screens)), k = Math.min(BEAT_STOPS.length - 2, Math.floor(s));
  return BEAT_STOPS[k] + (BEAT_STOPS[k + 1] - BEAT_STOPS[k]) * (s - k);
}

export function scrollFromProgress(p: number): number {
  const q = Math.min(LAST, Math.max(0, p));
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
  return LAST;
}

export function playSeconds(p: number): number {
  const q = Math.min(LAST, Math.max(0, p));
  let t = 0;
  for (let k = 0; k < PLAY.length; k++) {
    if (q <= STOPS[k + 1]) return t + (PLAY[k] * (q - STOPS[k])) / (STOPS[k + 1] - STOPS[k]);
    t += PLAY[k];
  }
  return t;
}
