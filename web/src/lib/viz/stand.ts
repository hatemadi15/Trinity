import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { parseExploreQuery, type ExploreQuery } from '../store/query';
import { dateLong } from './format';
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
 * sizes in metres, finest first), the shadows, the sky and Earth, and what is drawn rather than measured.
 * Without levels the ground is drawn flat. Numbers keep their units on the same line.
 */
export function measuredNote(cellsM: number[], starCount: number): string {
  const nb = '\u00a0';
  const rest = `The Sun and Earth are placed by NASA's tables of the planets' positions, the stars come from a catalogue of ${starCount.toLocaleString('en-GB')} stars, and Earth is NASA's Blue Marble photograph. With no air, the sky is black by day as well as by night. Earth stays over the same part of the horizon, rising and sinking a few degrees over the month as the Moon nods. The lander and the small craters underfoot are drawn, not measured.`;
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
 * view, as the time bar draws it) or of the lander's power, with its day; and the other kind's next
 * change when it follows within three days ("the Sun set on 3 January, then the battery run out on 4").
 */
export function watchNext(s: Series, p: PowerResult | null, startUtc: string, hour: number): string {
  const lit = (h: number) => s.sunFraction[h] > 0;
  const next = (from: number, kind?: 'sun' | 'power'): { h: number; kind: 'sun' | 'power'; text: string } | null => {
    for (let h = Math.max(1, from + 1); h < s.hours; h++) {
      const day = dateLong(startUtc, h);
      if (kind !== 'sun' && p && p.powered[h] !== p.powered[h - 1]) return { h, kind: 'power', text: p.powered[h] === 0 ? `the battery run out on ${day}` : `the power come back on ${day}` };
      if (kind !== 'power' && lit(h) !== lit(h - 1)) return { h, kind: 'sun', text: lit(h) ? `the Sun come back on ${day}` : `the Sun set ${s.sunEl[h] < 0 ? 'below the horizon' : 'behind the hills'} on ${day}` };
    }
    return null;
  };
  const first = next(hour);
  if (!first) return 'Press Play to watch the light move across the ground.';
  const then = next(first.h - 1, first.kind === 'sun' ? 'power' : 'sun');
  return then && then.h - first.h <= 72 ? `Press Play to watch ${first.text}, then ${then.text}.` : `Press Play to watch ${first.text}.`;
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
