import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { parseExploreQuery, type ExploreQuery } from '../store/query';
import { dateLong } from './format';
import { groundWords } from './ground';

/** Explore's address plus the hour the view opens on: `?site=&start=&days=&hour=`; a malformed hour is left out. */
export function standQuery(search: string | URLSearchParams): ExploreQuery & { hour?: number } {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: ExploreQuery & { hour?: number } = parseExploreQuery(q);
  const raw = q.get('hour');
  if (raw !== null && /^\d{1,5}$/.test(raw)) out.hour = Number(raw);
  return out;
}

const deg = (v: number) => `${v.toFixed(1)}°`;

/**
 * The label beside the Sun or Earth in the sky: "Sun 2.4° up", "Sun, behind the hills", "Earth, below the
 * horizon". Whether the body shows comes from the skyline, as in the ground panel's words: from a high point
 * the skyline dips below level, so a body can show while just below the level horizon, and is then "on the
 * horizon" rather than below it or a negative height up.
 */
export function skyLabel(body: 'sun' | 'earth', s: Series, hour: number): string {
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const el = body === 'sun' ? s.sunEl[hour] : s.earthEl[hour];
  const shows = body === 'sun' ? s.sunFraction[hour] > 0 : s.earthVisible[hour] === 1;
  if (shows) return el >= 0 ? `${name} ${deg(el)} up` : `${name}, on the horizon`;
  return el < 0 ? `${name}, below the horizon` : `${name}, behind the hills`;
}

/** The ground panel's two sentences for the hour, joined: sunlight or shadow and why, Earth in view or not. */
export function liveSentence(s: Series, hour: number): string {
  const w = groundWords(s, hour);
  return `${w.sun} ${w.earth}`;
}

/**
 * Whether the lander has power at the hour, and since or until when. The dates are those of the hour's own
 * stretch with or without power, not the first power cut: a long period can hold several.
 */
export function landerState(p: PowerResult | null, startUtc: string, hour: number): { on: boolean; text: string } {
  if (!p) return { on: true, text: 'Working out the lander’s power…' };
  const from = stretchStart(p.powered, hour);
  if (p.powered[hour] === 1) return { on: true, text: from === 0 ? 'The lander has power.' : `The lander has power again since ${dateLong(startUtc, from)}.` };
  const back = stretchEnd(p.powered, hour);
  const when = back < p.powered.length ? `Power comes back on ${dateLong(startUtc, back)}.` : 'Power does not come back in this period.';
  return { on: false, text: `The lander is off: its battery ran out on ${dateLong(startUtc, from)}. ${when}` };
}

/** The first hour of the stretch, all with power or all without, that holds `hour`. */
function stretchStart(powered: Uint8Array, hour: number): number {
  let h = hour;
  while (h > 0 && powered[h - 1] === powered[hour]) h--;
  return h;
}

/** The first hour after that stretch, or the period's length when it runs to the end. */
function stretchEnd(powered: Uint8Array, hour: number): number {
  let h = hour;
  while (h < powered.length && powered[h] === powered[hour]) h++;
  return h;
}
