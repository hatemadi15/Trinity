import type { Series } from '../engine/metrics';
import { spanShort } from './format';
import { degrees } from './ground';

/**
 * The Sun counts as up while any part of its disc shows over the site's skyline (the hills, or the level horizon where
 * no hill stands in the way): the rule of the time bar's yellow, the "Sunlight" figure, the status sentence and the key
 * moments, so a countdown never disagrees with the words beside it. A Sun partly behind a hill is still up.
 */
export function sunUp(s: Series, hour: number): boolean {
  return s.sunFraction[hour] > 0;
}

/**
 * Earth counts as in view while the centre of its disc stands above the site's skyline by at least the clearance the
 * lander dialog sets ("Earth counts as in view", 0° by default): the series' own flag, which the status sentence,
 * "Contact with Earth" and the radio windows read. Not the Sun's rule: Earth's disc, about 2° wide from the Moon, counts
 * once half of it has risen and stops counting once half of it has set, where the Sun counts from its first sliver to
 * its last. This is geometric direct-to-Earth visibility only: a clear line from the site to Earth's centre.
 */
export function earthInView(s: Series, hour: number): boolean {
  return s.earthVisible[hour] === 1;
}

export type Body = 'sun' | 'earth';

/** Up (the Sun, any part of its disc) or in view (Earth, its centre) at the hour, by the rules above. */
export function isUp(s: Series, body: Body, hour: number): boolean {
  return body === 'sun' ? sunUp(s, hour) : earthInView(s, hour);
}

/**
 * A change to come, counted on the series' hours: `at` is the first hour with the new state (the hour the key moments
 * and the time bar's dots give it), so the change itself happens within the hour before. With no such hour before the
 * period ends, `at` and `inHours` are null: the change is at least `leftHours` away, or never comes, and nothing here
 * says which.
 */
export interface Change {
  at: number | null;
  /** Hours from the hour asked about to `at`. */
  inHours: number | null;
  /** Hours from the hour asked about to the end of the period. */
  leftHours: number;
}

/** Whether the body is up at the hour, and the next change: it sets while up, rises while not. */
export interface Countdown extends Change {
  body: Body;
  up: boolean;
  next: 'sets' | 'rises';
}

/** At an hour of the period: whether the Sun or Earth is up, and the hours until that next changes. */
export function countdown(s: Series, body: Body, hour: number): Countdown {
  const up = isUp(s, body, hour);
  let at: number | null = null;
  for (let h = hour + 1; h < s.hours; h++) {
    if (isUp(s, body, h) !== up) {
      at = h;
      break;
    }
  }
  return { body, up, next: up ? 'sets' : 'rises', at, inHours: at === null ? null : at - hour, leftHours: s.hours - hour };
}

/**
 * The first hour after the landing hour at which the body sets (up the hour before, not at it): the first sunset or the
 * first time Earth sets after landing, after a rise first when the landing finds it set. Null when none comes before the
 * period ends.
 */
export function firstSetAfter(s: Series, body: Body, landing: number): Change {
  for (let h = landing + 1; h < s.hours; h++) {
    if (isUp(s, body, h - 1) && !isUp(s, body, h)) return { at: h, inHours: h - landing, leftHours: s.hours - landing };
  }
  return { at: null, inHours: null, leftHours: s.hours - landing };
}

/**
 * The countdown in words, each change named as its key moment is ("Sunset", "Sunrise", "Earth sets", "Earth rises"), the
 * hours as the cards write them: "Sunset in 2 d 19 h", "Earth rises in 9 d 3 h". With no change before the period ends it
 * says so, and gives no date it cannot know (near the equator Earth may never set at all): "No sunset before the end",
 * "Earth in view to the end". The Sun's are worded as no sunset or sunrise, never "Sun up", since the status sentence beside
 * them keeps "Sun up" for the whole disc and calls a sliver "setting". `end` names the end: the time bar's track ends where
 * the period does, so "the end" there; elsewhere "the end of the period".
 */
export function countdownWords(c: Countdown, end = 'the end'): string {
  if (c.inHours === null) {
    if (c.body === 'sun') return `${c.up ? 'No sunset' : 'No sunrise'} before ${end}`;
    return `Earth ${c.up ? 'in view' : 'out of view'} to ${end}`;
  }
  const name = c.body === 'sun' ? (c.up ? 'Sunset' : 'Sunrise') : c.up ? 'Earth sets' : 'Earth rises';
  return `${name} in ${spanShort(c.inHours)}`;
}

/**
 * Every form the countdown's words take over the period, each digit written 0: in tabular figures each form is as wide as
 * any of its words, so a slot as wide as the widest keeps one width while the hour moves. One pass from the end.
 */
export function countdownForms(s: Series, body: Body, end?: string): string[] {
  const forms = new Set<string>();
  let next = -1;
  for (let h = s.hours - 1; h >= 0; h--) {
    const up = isUp(s, body, h);
    if (h + 1 < s.hours && isUp(s, body, h + 1) !== up) next = h + 1;
    const c: Countdown = { body, up, next: up ? 'sets' : 'rises', at: next < 0 ? null : next, inHours: next < 0 ? null : next - h, leftHours: s.hours - h };
    forms.add(countdownWords(c, end).replace(/\d/g, '0'));
  }
  return [...forms];
}

/**
 * The Sun's elevation above the level horizon (not the hills) in degrees, at the hour and at its highest in the period,
 * with the hour of that highest: the figure that most decides a solar panel's output near a pole.
 */
export function sunHeight(s: Series, hour: number): { deg: number; maxDeg: number; maxHour: number } {
  let maxDeg = -Infinity;
  let maxHour = 0;
  for (let h = 0; h < s.hours; h++) {
    if (s.sunEl[h] > maxDeg) {
      maxDeg = s.sunEl[h];
      maxHour = h;
    }
  }
  return { deg: s.sunEl[hour], maxDeg, maxHour };
}

/**
 * An elevation as the view from the site writes heights (`degrees`: a tenth of a degree under 10°, whole from there),
 * below the horizon with a minus sign, and never "−0.0°".
 */
export function sunHeightWords(deg: number): string {
  const text = degrees(Math.abs(deg));
  return deg < 0 && text !== '0.0°' ? `−${text}` : text;
}
