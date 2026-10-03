import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { parseExploreQuery, type ExploreQuery } from '../store/query';
import { dateLong, dayMonth, spanWords } from './format';
import { degrees, groundWords } from './ground';

/** Explore's address plus the hour the view opens on: `?site=&start=&days=&hour=`; a malformed hour is left out. */
export function standQuery(search: string | URLSearchParams): ExploreQuery & { hour?: number } {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: ExploreQuery & { hour?: number } = parseExploreQuery(q);
  const raw = q.get('hour');
  if (raw !== null && /^\d{1,5}$/.test(raw)) out.hour = Number(raw);
  return out;
}

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
  // The same height as the sentence for the hour (groundWords), so the label and the words never differ.
  if (shows) return el >= 0.05 ? `${name} ${degrees(el)} up` : `${name}, on the horizon`;
  return el < 0 ? `${name}, below the horizon` : `${name}, behind the hills`;
}

/**
 * The note on how we know this, in plain words: the NASA heights the view stands on, level by level (cell
 * sizes in metres, finest first), the shadows, where the Sun, Earth and stars come from, and what is drawn
 * rather than measured. Without levels the ground is drawn flat. Numbers keep their units on the same line.
 * Why the sky is black and the night ground blue, and why Earth rises and sets, are told by whyLines.
 */
export function measuredNote(cellsM: number[], starCount: number): string {
  const nb = '\u00a0';
  const rest = `The Sun and Earth are placed by NASA's tables of the planets' positions, the stars come from a catalogue of ${starCount.toLocaleString('en-GB')} stars, and Earth is NASA's Blue Marble photograph at its true size (Face Earth zooms in on it). Times are Earth's clock (UTC): a day on the Moon lasts about a month. The forecast counts energy only: whether the lander survives the cold of the night is not worked out. The lander, its solar panel standing upright to catch the low Sun, and the small craters underfoot are drawn, not measured.`;
  if (cellsM.length === 0) return `There are no detailed NASA heights for this site, so the ground here is drawn flat. ${rest}`;
  const steps = [...new Set(cellsM.map((c) => Math.round(c)))].sort((a, b) => a - b);
  const parts = steps.map((c, i) => `${c}${nb}m${i === 0 ? ' steps' : ''} ${c > 200 ? `out to 125${nb}km` : i === 0 ? 'near you' : `out to 20${nb}km`}`);
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Heights measured from orbit by the laser on NASA's Lunar Reconnaissance Orbiter: ${list}. The shadows are worked out from those heights for every hour. ${rest}`;
}

/**
 * The ground panel's two sentences for the hour, joined: sunlight or shadow and why, Earth in view or not.
 * With `powered` false, Earth in view no longer promises radio contact: the lander has no power for it.
 */
export function liveSentence(s: Series, hour: number, powered?: boolean): string {
  const w = groundWords(s, hour);
  const earth = powered === false && s.earthVisible[hour] === 1 ? w.earth.replace(': radio contact is possible.', ', but the lander has no power for its radio.') : w.earth;
  return `${w.sun} ${earth}`;
}

/**
 * One line on what to watch next: the first change after the hour, of the Sun (any part of its disc in
 * view, as the time bar draws it) or of the lander's power, with its day; and the other kind's next change
 * when it follows within three days. "Press Play: the Sun sets behind the hills on 3 January, and the
 * battery runs out on 4 January." On the same day the day is said once: "Press Play: the Sun comes back on
 * 20 January, and the power with it."
 */
export function watchNext(s: Series, p: PowerResult | null, startUtc: string, hour: number): string {
  const lit = (h: number) => s.sunFraction[h] > 0;
  type Change = { h: number; kind: 'sun' | 'power'; back: boolean; what: string };
  const next = (from: number, kind?: 'sun' | 'power'): Change | null => {
    for (let h = Math.max(1, from + 1); h < s.hours; h++) {
      // In the same hour the Sun comes first: the power changes because of it.
      if (kind !== 'power' && lit(h) !== lit(h - 1)) return { h, kind: 'sun', back: lit(h), what: lit(h) ? 'the Sun comes back' : `the Sun sets ${s.sunEl[h] < 0 ? 'below the horizon' : 'behind the hills'}` };
      if (kind !== 'sun' && p && p.powered[h] !== p.powered[h - 1]) return { h, kind: 'power', back: p.powered[h] === 1, what: p.powered[h] === 1 ? 'the power comes back' : 'the battery runs out' };
    }
    return null;
  };
  const first = next(hour);
  if (!first) return 'Press Play to watch the light move across the ground.';
  const day = dateLong(startUtc, first.h);
  const then = next(first.h - 1, first.kind === 'sun' ? 'power' : 'sun');
  if (!then || then.h - first.h > 72) return `Press Play: ${first.what} on ${day}.`;
  const thenDay = dateLong(startUtc, then.h);
  if (thenDay !== day) return `Press Play: ${first.what} on ${day}, and ${then.what} on ${thenDay}.`;
  // The Sun brings the power back with it.
  if (first.kind === 'sun' && first.back && then.back) return `Press Play: ${first.what} on ${day}, and the power with it.`;
  return `Press Play: ${first.what} on ${day}, and ${then.what} the same day.`;
}

/**
 * When the lander has no contact with Earth while it has power from the landing: the first day it has both
 * power and a view of Earth, or that it never does in the period. Null when it has contact from the start.
 */
export function radioNext(s: Series, p: PowerResult, startUtc: string): string | null {
  let h = 0;
  for (; h < s.hours && p.powered[h] === 1; h++) if (s.earthVisible[h] === 1) return null;
  for (; h < s.hours; h++) if (p.powered[h] === 1 && s.earthVisible[h] === 1) return `The first day the lander has both power and a view of Earth is ${dateLong(startUtc, h)}.`;
  return 'The lander never has both power and a view of Earth in this period.';
}

export interface Moment { label: string; hour: number; day: string }

/**
 * The period's key moments, each the first of its kind after the landing, in order of time: one click each.
 * When the battery runs out later on the day of the sunset, the two are one moment at the sunset, "Sunset
 * and power off"; when the power comes back on the day the Sun does, one at the sunrise, "Sun and power back".
 */
export function keyMoments(s: Series, p: PowerResult | null, startUtc: string): Moment[] {
  const lit = (h: number) => s.sunFraction[h] > 0;
  const found = new Map<string, number>();
  const mark = (label: string, h: number) => {
    if (!found.has(label)) found.set(label, h);
  };
  for (let h = 1; h < s.hours; h++) {
    if (lit(h - 1) && !lit(h)) mark('Sunset', h);
    if (!lit(h - 1) && lit(h) && found.has('Sunset')) mark('Sun back', h);
    if (p && p.powered[h - 1] === 1 && p.powered[h] === 0) mark('Battery runs out', h);
    if (p && p.powered[h - 1] === 0 && p.powered[h] === 1 && found.has('Battery runs out')) mark('Power back', h);
    if (s.earthVisible[h - 1] === 0 && s.earthVisible[h] === 1) mark('Earth in view', h);
  }
  // A power cut before the sunset on the same day did not come with it, so the two stay apart.
  const join = (sun: string, power: string, label: string) => {
    const a = found.get(sun);
    const b = found.get(power);
    if (a === undefined || b === undefined || b < a || dayMonth(startUtc, a) !== dayMonth(startUtc, b)) return;
    found.delete(sun);
    found.delete(power);
    found.set(label, a);
  };
  join('Sunset', 'Battery runs out', 'Sunset and power off');
  join('Sun back', 'Power back', 'Sun and power back');
  return [...found].map(([label, hour]) => ({ label, hour, day: dayMonth(startUtc, hour) })).sort((a, b) => a.hour - b.hour);
}

/**
 * The view's first line: that this is the Moon, where, and that it is drawn from NASA data. The short one,
 * for a phone, keeps the Moon and the pole.
 */
export function standingLine(site: { lat: number; blurb?: string }, name: string, short: boolean): string {
  if (short) return `Standing on the Moon${site.lat <= -80 ? ', near its south pole' : site.lat >= 80 ? ', near its north pole' : ''}. Drawn from NASA data.`;
  return `Standing on the Moon at ${name}, ${Math.abs(site.lat).toFixed(1)}° ${site.lat < 0 ? 'S' : 'N'}.${site.blurb ? ` ${site.blurb}.` : ''} Drawn from NASA data, not a photograph.`;
}

/** Why the Sun stays low, for a site near a pole; null elsewhere. */
export function poleLine(lat: number): string | null {
  if (Math.abs(lat) < 80) return null;
  return `Near the Moon's ${lat < 0 ? 'south' : 'north'} pole the Sun never climbs high: it circles just above the horizon once a month, so a low hill can hide it for days.`;
}

/**
 * Why the view looks as it does at the hour, a sentence each, in order: near a pole, why the Sun stays low
 * and why Earth rises and sets; by day, why the sky is black; with none of the Sun in view, where it is
 * while farther hills are still lit; at night with Earth in view, why the ground looks blue. Each sentence
 * is there only when it applies.
 */
export function whyLines(lat: number, s: Series, hour: number): string[] {
  const lines: string[] = [];
  const pole = poleLine(lat);
  if (pole) {
    lines.push(pole, "Earth hangs almost still in the Moon's sky, because the Moon keeps one face towards it. But the Moon rocks a little as it goes round, and this close to the pole that is enough to lift Earth above the horizon and lower it again over the month.");
  }
  const el = s.sunEl[hour];
  if (s.sunFraction[hour] > 0) {
    lines.push('With no air to scatter sunlight, the sky stays black by day, and the stars shine beside the Sun.');
    return lines;
  }
  if (el >= 0) lines.push('The Sun is still up, hidden behind the hills: higher ground farther off still catches its light.');
  else if (el > -2) lines.push('The Sun is just below the horizon here, but higher ground farther off still catches its light.');
  if (s.earthVisible[hour] === 1) lines.push('At night only Earth lights the ground, which is why it looks blue.');
  return lines;
}

/** What the lander's line says while its power is still being worked out. */
const WORKING = 'Working out the lander’s power…';

/**
 * Whether the lander has power at the hour, and since or until when. The dates are those of the hour's own
 * stretch with or without power, not the first power cut: a long period can hold several.
 */
export function landerState(p: PowerResult | null, startUtc: string, hour: number): { on: boolean; text: string } {
  if (!p) return { on: true, text: WORKING };
  const w = stretchWords(p, startUtc, hour);
  return w.on ? { on: true, text: `${w.has}.` } : { on: false, text: `${w.off} ${w.back}` };
}

/**
 * The lander's power and its radio contact for the hour in one sentence: whether it has power, since or
 * until when (the dates of the hour's own stretch, as in landerState), and whether Earth is in view for
 * its radio, or where Earth is when it is not. `on` is whether it has power; true until that is worked out.
 */
export function statusLine(s: Series, p: PowerResult | null, startUtc: string, hour: number): { on: boolean; text: string } {
  if (!p) return { on: true, text: WORKING };
  const w = stretchWords(p, startUtc, hour);
  const seen = s.earthVisible[hour] === 1;
  if (!w.on) return { on: false, text: `${w.off} ${seen ? 'Earth is in view, but the radio has no power.' : w.back}` };
  if (seen) return { on: true, text: `${w.has}${w.again ? ',' : ''} and can radio Earth.` };
  return { on: true, text: `${w.has}, but Earth is ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind the hills'}, so it cannot radio home.` };
}

/**
 * The headline with how long the night lasts, when the power runs out at night and the title ends ", then
 * night": "..., then 17 days of night" (to the nearest day), "..., then a night of 20 hours" for a night
 * shorter than two days, or "..., then night to the end of the period". The night runs from the sunset
 * before the power cut to the next sunrise. Any other title comes back as it is, and so does a night that
 * began before the period, as its length is not known.
 */
export function nightHeadline(title: string, s: Series, p: PowerResult): string {
  const tail = ', then night';
  const first = p.firstBrownoutHour;
  if (first === null || s.sunFraction[first] !== 0 || !title.endsWith(tail)) return title;
  let sunset = first;
  while (sunset > 0 && s.sunFraction[sunset - 1] === 0) sunset--;
  let sunrise = first;
  while (sunrise < s.hours && s.sunFraction[sunrise] === 0) sunrise++;
  const head = title.slice(0, -tail.length);
  if (sunrise >= s.hours) return `${head}, then night to the end of the period`;
  if (sunset === 0) return title;
  const span = sunrise - sunset;
  return span >= 48 ? `${head}, then ${Math.round(span / 24)} days of night` : `${head}, then a night of ${spanWords(span)}`;
}

/**
 * The words for the hour's own stretch with or without power. With power: "The lander has power", or "The
 * lander has power again since 20 January" after a cut. Without: "The lander is off: its battery ran out on
 * 4 January." and when the power comes back, if it does in the period.
 */
function stretchWords(p: PowerResult, startUtc: string, hour: number): { on: true; has: string; again: boolean } | { on: false; off: string; back: string } {
  const from = stretchStart(p.powered, hour);
  if (p.powered[hour] === 1) return { on: true, has: from === 0 ? 'The lander has power' : `The lander has power again since ${dateLong(startUtc, from)}`, again: from > 0 };
  const end = stretchEnd(p.powered, hour);
  return {
    on: false,
    off: `The lander is off: its battery ran out on ${dateLong(startUtc, from)}.`,
    back: end < p.powered.length ? `Power comes back on ${dateLong(startUtc, end)}.` : 'Power does not come back in this period.',
  };
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
