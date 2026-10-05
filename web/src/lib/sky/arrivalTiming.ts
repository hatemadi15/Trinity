/*
 * The arrival's timing, with no three.js in it: the home page's section imports this, and three.js stays in
 * the stage that loads after it.
 */

/**
 * The progress of each key: the Moon, the pole, the pole again (the camera rests over it while its words are read),
 * the cap, the ridge, standing, and standing at the end of the month at the site.
 */
export const STOPS = [0, 1, 1.5, 2, 3, 4, 5] as const;
/** The flight's last stop and the arrival's: standing at the end of the month at the site. */
export const LAST = 5;
/**
 * Where each beat's words stand, a screen each: the first screen, the pole, the cap, the ridge, standing, the
 * month at the site half run, its end.
 */
export const BEAT_STOPS = [0, 1.25, 2, 3, 4, 4.5, 5] as const;
/** After landing the hours run on at the site, at an even pace, to the end of the story (`siteEndHour`). */
export const SITE = { from: 4, to: 5 } as const;
/** Seconds of play from stop to stop: fifteen to standing, the video's first fifteen seconds, then six through the month. */
export const PLAY = [3, 3.5, 2, 3, 3.5, 6] as const;

/** 0 to 1 with no speed at either end: the camera rests at each stop. */
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * The hour shown at progress `p`: the landing hour all the way down (the camera holds over the pole a moment, at
 * that hour), then the month at the site, once and in order. With reduced motion the progress stops on the beats,
 * so each beat shows its own hour (the month's middle at its middle beat), as its words say, and no hours run.
 */
export function hourAt(p: number, startHour: number, siteEndHour = startHour): number {
  if (p >= SITE.to) return siteEndHour;
  if (p > SITE.from) return startHour + ((siteEndHour - startHour) * (p - SITE.from)) / (SITE.to - SITE.from);
  return startHour;
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
