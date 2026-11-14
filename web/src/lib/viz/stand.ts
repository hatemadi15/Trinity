import { hasNo } from '../data/parts';
import type { Series } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { parseExploreQuery, type ExploreQuery } from '../store/query';
import { dateLong, dayMonth, pct0, spanWords } from './format';
import { compassWord, degrees, groundWords } from './ground';

/** Explore's address plus the hour the view opens on: `?site=&start=&days=&hour=`; a malformed hour is left out. */
export function standQuery(search: string | URLSearchParams): ExploreQuery & { hour?: number } {
  const q = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const out: ExploreQuery & { hour?: number } = parseExploreQuery(q);
  const raw = q.get('hour');
  if (raw !== null && /^\d{1,5}$/.test(raw)) out.hour = Number(raw);
  return out;
}

/** Why Earth's path makes a loop, on the path's name where it first shows (teacher, part B read 7). */
export const EARTH_LOOP = 'a loop: the Moon wobbles a little each month';

/**
 * The label beside the Sun or Earth in the sky: "Sun 2.4° up", "Earth 12° up"; and out of view its height
 * still, as how far below the horizon Earth is says how long the radio waits: "Earth, 1.2° below the
 * horizon". Hidden by a hill while above the horizon, the hill is named by its direction, as the ground panel
 * names it, and the height is "up", as for a body in view: "Sun behind a hill to the north-west, 1.6° up"
 * (18.2: both readers of read D2 took "above the horizon" at night for the skyline). Heights are written as
 * `degrees` writes them for the forecast's sentences, a tenth of a degree under 10° and whole from there, so
 * the two give the same height. Whether the body shows comes from the skyline, as in the ground panel's words:
 * from a high point the skyline dips below level, so a body can show while just below the level horizon, and
 * is then "on the horizon" rather than below it or a negative height up. Within a twentieth of a degree of
 * level a body out of view is on the horizon behind its hill, "Sun behind a hill to the north-west, on the
 * horizon", or "just below the horizon", never 0.0°.
 */
export function skyLabel(body: 'sun' | 'earth', s: Series, hour: number): string {
  const name = body === 'sun' ? 'Sun' : 'Earth';
  const el = body === 'sun' ? s.sunEl[hour] : s.earthEl[hour];
  const az = body === 'sun' ? s.sunAz[hour] : s.earthAz[hour];
  const shows = body === 'sun' ? s.sunFraction[hour] > 0 : s.earthVisible[hour] === 1;
  if (shows) return el >= 0.05 ? `${name} ${degrees(el)} up` : `${name}, on the horizon`;
  if (el < 0) return el > -0.05 ? `${name}, just below the horizon` : `${name}, ${degrees(-el)} below the horizon`;
  // Hidden by a hill while above the horizon: the hill named by its direction, as the ground panel names it, and
  // "up" rather than "above the horizon", which at night reads as the skyline (both readers of read D2); never
  // "up" and "set" at once (both readers, part C read 1).
  const hill = `behind a hill to the ${compassWord(az)}`;
  return el >= 0.05 ? `${name} ${hill}, ${degrees(el)} up` : `${name} ${hill}, on the horizon`;
}

/**
 * The label on your own shadow, in whole metres, on two lines: its length along the ground you stand on
 * (`lengthM`), and when the slope makes that a tenth or more shorter or longer than on level ground
 * (`levelM`, for a person 1.8 m tall), the length on level ground too, from which a reader can check the
 * Sun's height: "Your shadow, about 9 m long up this slope\n(about 42 m on level ground; you are 1.8 m
 * tall)", or "down this slope" when the slope makes it longer. Otherwise, and when the two would read the
 * same in whole metres: "Your shadow, about 42 m long\n(you are 1.8 m tall)". Each length is "about": the
 * Sun's label rounds its height (2.46° reads "2.5°"), so a reader's 1.8 / tan 2.5° = 41 m can differ from
 * the 42 m shown. The newline is a line break in the label.
 */
export function shadowWords(lengthM: number, levelM: number): string {
  const length = Math.round(lengthM);
  const level = Math.round(levelM);
  if (length === level || Math.abs(lengthM - levelM) < 0.1 * levelM) return `Your shadow, about ${length} m long\n(you are 1.8 m tall)`;
  return `Your shadow, about ${length} m long ${lengthM < levelM ? 'up' : 'down'} this slope\n(about ${level} m on level ground; you are 1.8 m tall)`;
}

/**
 * The IAU constellations of the bright stars the app names (public/data/sky/star_names.json, by the
 * catalogue designations in pipeline/lunar_pipeline/sky.py), in one style: a one-word Latin name as English
 * speakers use it ("Carina", "Scorpius"), a two-word one in its English form ("Southern Triangle" for
 * Triangulum Australe, "Great Dog" for Canis Major, "Little Bear" for Ursa Minor). The Southern Cross's four
 * stars and its pointers, Alpha Centauri and Hadar, are left out: they keep their plain names.
 */
const CONSTELLATIONS: [string, string[]][] = [
  ['Great Dog', ['Sirius', 'Adhara']],
  ['Little Dog', ['Procyon']],
  ['Little Bear', ['Polaris']],
  ['Southern Fish', ['Fomalhaut']],
  ['Southern Triangle', ['Atria']],
  ['Aquila', ['Altair']],
  ['Auriga', ['Capella']],
  ['Boötes', ['Arcturus']],
  ['Carina', ['Canopus', 'Miaplacidus', 'Avior']],
  ['Cygnus', ['Deneb']],
  ['Eridanus', ['Achernar']],
  ['Gemini', ['Pollux']],
  ['Grus', ['Alnair']],
  ['Leo', ['Regulus']],
  ['Lyra', ['Vega']],
  ['Orion', ['Rigel', 'Betelgeuse']],
  ['Pavo', ['Peacock']],
  ['Scorpius', ['Antares', 'Shaula']],
  ['Taurus', ['Aldebaran']],
  ['Virgo', ['Spica']],
];
const CONSTELLATION_OF = new Map(CONSTELLATIONS.flatMap(([constellation, stars]) => stars.map((star) => [star, constellation] as const)));

/**
 * A bright star's name as the view writes it beside the star: with its constellation, as the name alone
 * means nothing to most students, "Atria, Southern Triangle", "Canopus, Carina". The Southern Cross's own
 * four stars (Acrux, Mimosa, Gacrux, Imai) and its pointers (Alpha Centauri, Hadar) keep their plain names,
 * as the caption after Look up names the cross and the pointers lead the eye to it; so does any name it does
 * not know, the Southern Cross's own included.
 */
export function starLabel(name: string): string {
  const constellation = CONSTELLATION_OF.get(name);
  return constellation ? `${name}, ${constellation}` : name;
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
 * The ground panel's two sentences for the hour, joined: sunlight or night and why, Earth in view or not.
 * With `powered` false, Earth in view no longer promises radio contact: the lander has no power for it.
 */
export function liveSentence(s: Series, hour: number, powered?: boolean): string {
  const w = groundWords(s, hour);
  const earth = powered === false && s.earthVisible[hour] === 1 ? w.earth.replace(': radio contact is possible.', ', but the lander has no power for its radio.') : w.earth;
  return `${w.sun} ${earth}`;
}

/**
 * The start of the line on what to watch next (watchNext): Play, or Next on the time bar, the bar's two buttons at
 * every width, Next stepping to the key moment the line goes on to name (18.2, 21.1; the reads of D2 asked what "a
 * moment on the time bar" was).
 */
export const WATCH_LEAD = 'Press Play, or Next on the time bar, to watch:';
/**
 * WATCH_LEAD with reduced motion, when Play is off (the time bar disables it and the first step names the drag alone):
 * Next still takes the time to its moment, so the line offers Next alone (spec 20.1).
 */
export const WATCH_LEAD_STILL = 'Press Next on the time bar to see:';

/**
 * The first step (19.2), on the line over the view from the arrival until the first turn by hand, the first Play,
 * a flag, Turn to or Look up, or a key moment's line, and then gone for the visit; FIRST_STEP_PHONE under 640 px.
 * With reduced motion Play is off, so FIRST_STEP_STILL names the drag alone.
 */
export const FIRST_STEP = 'Press Play to watch the month go by · drag to look around';
/** FIRST_STEP under 640 px, short enough for one line there. */
export const FIRST_STEP_PHONE = 'Press Play · drag to look around';
/** FIRST_STEP with reduced motion, when Play is off. */
export const FIRST_STEP_STILL = 'Drag to look around';

/**
 * The line over the view the first time the resident comes well into it (spec 20.2), once a visit: that it was found,
 * and what is real, as the card's line on where you stand says it (standingLine): it is made up, as the rocks and the
 * small craters are; the hills, the Sun and Earth are NASA data (the laser's heights, the tables of the planets).
 */
export const RESIDENT_LINE = 'You found Rocky, the only animal here, made up like the rocks. The hills, Sun and Earth are NASA data.';

/**
 * One line on what to watch next: the first change after the hour, of the Sun (any part of its disc in
 * view, as the time bar draws it) or of the lander's power, with its day; and the other kind's next change
 * when it follows within three days. It starts with WATCH_LEAD: "Press Play, or Next on the time bar, to
 * watch: the Sun sets behind the hills on 3 January, and the battery runs out on 4 January." A Sun that
 * leaves the view while still above the level horizon "sets behind the hills"; below it, it "sets below the
 * horizon". On the same day the day is said once: "...:
 * the Sun rises on 20 January, and the power with it, if the lander survives 16 days without power at night,
 * colder than −170 °C." The power coming back always carries that condition, straight after it, as the
 * forecast counts energy only: the whole days of that stretch without power, counted as in the headline
 * (nightHeadline), "at night" however the Sun set, below the horizon or behind the hills (offWords); when the
 * battery ran out with the Sun still up, for too little sunlight, it says nothing of the night: "if the lander
 * survives 2 days without power". With no change left in the period: "Press Play to watch the light move
 * across the ground." With `still`, for reduced motion, Play is off, so the line never offers it (spec 20.1): it
 * starts with WATCH_LEAD_STILL, and with no change left it says "Drag the time bar to see the light move across
 * the ground."
 */
export function watchNext(s: Series, p: PowerResult | null, startUtc: string, hour: number, still = false): string {
  const lit = (h: number) => s.sunFraction[h] > 0;
  type Change = { h: number; kind: 'sun' | 'power'; back: boolean; what: string };
  const next = (from: number, kind?: 'sun' | 'power'): Change | null => {
    for (let h = Math.max(1, from + 1); h < s.hours; h++) {
      // In the same hour the Sun comes first: the power changes because of it.
      if (kind !== 'power' && lit(h) !== lit(h - 1)) return { h, kind: 'sun', back: lit(h), what: lit(h) ? 'the Sun rises' : s.sunEl[h] < 0 ? 'the Sun sets below the horizon' : 'the Sun sets behind the hills' };
      if (kind !== 'sun' && p && p.powered[h] !== p.powered[h - 1]) return { h, kind: 'power', back: p.powered[h] === 1, what: p.powered[h] === 1 ? 'the power comes back' : 'the battery runs out' };
    }
    return null;
  };
  // Kept next to the power coming back, so that it never reads as a condition on the Sun.
  const ifSurvives = (c: Change) => (p && c.kind === 'power' && c.back ? `, if the lander survives ${offWords(s, p, startUtc, c.h)}` : '');
  const lead = still ? WATCH_LEAD_STILL : WATCH_LEAD;
  const first = next(hour);
  if (!first) return still ? 'Drag the time bar to see the light move across the ground.' : 'Press Play to watch the light move across the ground.';
  const day = dateLong(startUtc, first.h);
  const then = next(first.h - 1, first.kind === 'sun' ? 'power' : 'sun');
  if (!then || then.h - first.h > 72) return `${lead} ${first.what} on ${day}${ifSurvives(first)}.`;
  const thenDay = dateLong(startUtc, then.h);
  if (thenDay !== day) return `${lead} ${first.what} on ${day}${ifSurvives(first)}, and ${then.what} on ${thenDay}${ifSurvives(then)}.`;
  // The Sun brings the power back with it.
  if (first.kind === 'sun' && first.back && then.back) return `${lead} ${first.what} on ${day}, and the power with it${ifSurvives(then)}.`;
  return `${lead} ${first.what} on ${day}${ifSurvives(first)}, and ${then.what} the same day${ifSurvives(then)}.`;
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

/**
 * What a key moment is about, for the page to act on whatever its label says: the Sun leaving the view
 * ("sunset", whether it sets below the horizon or behind the hills), the Sun rising ("sun-back"), the battery
 * running out ("battery-out"), the power back ("power-back"), Earth rising ("earth-in"), and the two joined
 * moments, the Sun setting with the power ("sunset-power-off") and the Sun rising with it ("sun-power-back",
 * labelled "Sunrise" like the Sun's alone, as the power needs the lander to have survived the night).
 */
export type MomentKind = 'sunset' | 'sun-back' | 'battery-out' | 'power-back' | 'earth-in' | 'earth-out' | 'sunset-power-off' | 'sun-power-back';

/** A key moment: its kind, the words on its flag, its hour from the period start, and its day ("3 Jan"). */
export interface Moment {
  kind: MomentKind;
  label: string;
  hour: number;
  day: string;
}

/**
 * The labels of the key moments but the two sunsets, which keyMoments names. The Sun and the power back
 * together is "Sunrise" all the same: after a power cut at night the power comes back only if the lander
 * survived the night, which the forecast does not work out (the time bar hatches what depends on it).
 */
const LABELS: Record<Exclude<MomentKind, 'sunset' | 'sunset-power-off'>, string> = {
  'sun-back': 'Sunrise',
  'battery-out': 'Battery runs out',
  'power-back': 'Power back',
  'earth-in': 'Earth rises',
  'earth-out': 'Earth sets',
  'sun-power-back': 'Sunrise',
};

/**
 * The period's key moments, each the first of its kind after the landing, in order of time: one click each.
 * Each has a kind that never changes, and a label, one name for each event: "Sunset" when the Sun leaves the
 * view, whether it sets below the level horizon or behind the hills while still at or above it (the caption,
 * momentCaption, says which); "Sunrise", "Battery runs out", "Power back" and "Earth rises". When the battery
 * runs out later on the day the Sun sets, the two are one moment at the Sun's hour, "Sunset and power off";
 * when the power comes back on the day the Sun rises, one at the Sun's hour of the kind "sun-power-back",
 * labelled "Sunrise": the power back needs the lander to have survived the night, which the forecast does not
 * work out, so the flag claims only the Sun, and its caption (momentCaption) says the rest.
 */
export function keyMoments(s: Series, p: PowerResult | null, startUtc: string): Moment[] {
  const lit = (h: number) => s.sunFraction[h] > 0;
  const found = new Map<MomentKind, number>();
  const mark = (kind: MomentKind, h: number) => {
    if (!found.has(kind)) found.set(kind, h);
  };
  for (let h = 1; h < s.hours; h++) {
    if (lit(h - 1) && !lit(h)) mark('sunset', h);
    if (!lit(h - 1) && lit(h) && found.has('sunset')) mark('sun-back', h);
    if (p && p.powered[h - 1] === 1 && p.powered[h] === 0) mark('battery-out', h);
    if (p && p.powered[h - 1] === 0 && p.powered[h] === 1 && found.has('battery-out')) mark('power-back', h);
    if (s.earthVisible[h - 1] === 0 && s.earthVisible[h] === 1) mark('earth-in', h);
    if (s.earthVisible[h - 1] === 1 && s.earthVisible[h] === 0) mark('earth-out', h);
  }
  // A power cut before the Sun goes on the same day did not come with it, so the two stay apart.
  const join = (sun: MomentKind, power: MomentKind, kind: MomentKind) => {
    const a = found.get(sun);
    const b = found.get(power);
    if (a === undefined || b === undefined || b < a || dayMonth(startUtc, a) !== dayMonth(startUtc, b)) return;
    found.delete(sun);
    found.delete(power);
    found.set(kind, a);
  };
  join('sunset', 'battery-out', 'sunset-power-off');
  join('sun-back', 'power-back', 'sun-power-back');
  // One name for the Sun leaving the sky, whether it sets below the horizon or behind the hills (part C).
  const label = (kind: MomentKind): string => (kind === 'sunset' ? 'Sunset' : kind === 'sunset-power-off' ? 'Sunset and power off' : LABELS[kind]);
  return [...found].map(([kind, hour]) => ({ kind, label: label(kind), hour, day: dayMonth(startUtc, hour) })).sort((a, b) => a.hour - b.hour);
}

/** The captions' word on twilight; the reasons (whyLines) keep the long one. */
const NO_TWILIGHT_SHORT = 'No air, so no twilight.';

/**
 * The caption over the view at a key moment, chosen from its flag or passed as the time moves, for the
 * moment's own hour: what happens then, and why, in plain words, in two sentences and 112 characters at most,
 * two lines on a wide screen; the longer whys stay in the card's lines on why (whyLines). The Sun leaving the
 * view is "Sunset", as on its flag, then where it sets: a Sun still at or above the level horizon sets "behind
 * the hills", and near a pole the caption adds that the Sun never climbs more than a few degrees there; a Sun
 * below the horizon sinks below it, near a pole as one that "never climbs high". Whenever the Sun leaves the
 * view the caption ends "No air, so no twilight." (NO_TWILIGHT_SHORT), so a site dark the hour the Sun goes
 * reads as what it is. When the battery runs out with the Sun still in view, it is too low for the panel; with
 * none of the Sun in view the battery runs out "at night", the words of the line on what to watch next
 * (offWords), which hold whether the Sun set below the horizon or behind the hills. The view, turned to the
 * lander, then still shows the ground about it, so the caption says what lights it, only Earthlight with Earth
 * in view, else no Sun or Earth in sight, and that the picture is brightened so you can see it (18.2: "like a
 * long exposure" puzzled the reads of D2). Earth rises as the Moon's slight rocking lifts it into view, for
 * about two weeks a month. Sunrise with the power brings the power "if the lander survived the cold", which the
 * forecast does not work out. With Earth in view at sunrise, a working lander could radio home. No caption says
 * that higher ground farther off still catches the Sun, as the view of a key moment need not show that ground:
 * whyLines says it. `kind` is the moment's kind from keyMoments, not its label; anything else gets an empty
 * caption. Given the site's latitude, the pole is left out far from the poles; given none, the site is taken
 * to be near one.
 */
export function momentCaption(kind: MomentKind, s: Series, hour: number, lat?: number): string {
  const up = s.sunEl[hour] >= 0, pole = lat === undefined || poleLine(lat) !== null, earth = s.earthVisible[hour] === 1;
  switch (kind) {
    case 'sunset':
      return `${up ? (pole ? 'Sunset behind the hills: near the pole the Sun never climbs more than a few degrees.' : 'Sunset behind the hills: the Sun is still above the horizon.') : pole ? 'Sunset: the Sun sinks below the horizon; near the pole it never climbs high.' : 'Sunset: the Sun sinks below the horizon.'} ${NO_TWILIGHT_SHORT}`;
    case 'sunset-power-off':
      return `${up ? 'Sunset behind the hills' : 'Sunset below the horizon'}, and the lander's power goes with it. ${NO_TWILIGHT_SHORT}`;
    case 'battery-out':
      // With too little sunlight the battery can run out while the Sun is still in view. At night the Sun can
      // still be up, set behind the hills, as its label then says: nothing here says it is not up.
      return s.sunFraction[hour] > 0
        ? 'The battery runs out: the Sun is up, but too low for the panel to keep the lander going.'
        : earth
          ? 'The battery runs out at night. Only Earthlight lights the ground; the picture is brightened so you can see it.'
          : 'The battery runs out at night. With no Sun or Earth in sight, the picture is brightened so you can see it.';
    case 'earth-in':
      return "Earth rises over the hills: the Moon's slight wobble lifts it into view for about two weeks a month.";
    case 'earth-out':
      return `Earth sets ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind the hills'}: the Moon's slight wobble lowers it. No radio until it rises again.`;
    case 'sun-back':
      return `Sunrise over the hills.${earth ? ' With Earth in view, a working lander could radio home.' : ''}`;
    case 'sun-power-back':
      return `Sunrise, and with it the power, if the lander survived the cold.${earth ? ' Earth is in view: it could radio home.' : ''}`;
    case 'power-back':
      return 'The panel makes enough power again.';
    default:
      return '';
  }
}

/**
 * Why Apollo's photos show no stars, in the card's lines on why (whyLines): the cameras' short exposures, not
 * dazzled eyes. The caption after Look up (viewCaption) leaves it to them, to keep to two lines.
 */
const APOLLO = "Apollo's cameras used short exposures for the bright ground, too short to catch the stars.";

/**
 * The line over the view, two lines on a wide screen at most (112 characters), the longer whys left to the
 * card's lines on why (whyLines). After Face Earth ("earth"): that Earth barely moves in the Moon's sky, near a
 * pole that only the Moon's slight rocking makes it rise or set, elsewhere that the Moon keeps
 * one face towards it. After Look up ("up"): that with no air the sky is black even by day, and that away from
 * the glare the stars show, as in the view, which like a camera set for the sunlit ground shows none by day
 * until it looks up; from a southern site, first which way the view turned, towards the Southern Cross. When
 * night falls with Earth in view ("earthlight"): that Earthlight, sunlight bounced off Earth, tints the ground
 * blue (both readers of part B read 7 found the blue unexplained); with Earth a thin crescent ("faint"), that it
 * gives the ground little light, as the ground then looks grey (both readers of read D1); and with either, that
 * the picture is brightened so you can see it. At an hour with neither the Sun nor Earth in view ("dark"): that
 * neither lights the ground, that the picture is brightened so you can see it, and that with no air there is no
 * twilight; that higher ground farther off may still catch the Sun is left to whyLines. The brightening is said
 * plainly, never "like a long exposure", which puzzled the reads of D2 (18.2). After Face the lander
 * ("lander"): landerCaption's line for a view of the panel's face.
 */
export function viewCaption(kind: 'earth' | 'up' | 'earthlight' | 'faint' | 'lander' | 'dark', lat: number): string {
  if (kind === 'earth') return poleLine(lat) === null ? "Earth barely moves in the Moon's sky: the Moon keeps one face towards it." : "Earth barely moves in the Moon's sky; only the Moon's slight wobble makes it rise or set.";
  if (kind === 'up') {
    const why = 'With no air the sky is black even by day; away from the glare, the stars show.';
    return lat > 0 ? why : `Towards the Southern Cross. ${why}`;
  }
  if (kind === 'lander') return landerCaption(lat, false);
  if (kind === 'dark') return 'Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight.';
  if (kind === 'faint') return 'A thin crescent Earth gives this ground little light; the picture is brightened so you can see it.';
  return 'Earthlight, sunlight bounced off Earth, tints this ground blue; the picture is brightened so you can see it.';
}

/**
 * The line over the view after Face the lander, two lines on a wide screen at most, as viewCaption's: near a
 * pole, why its solar panel stands upright, as here the Sun never climbs more than a few degrees; elsewhere,
 * that the lander is drawn as built for the poles, its panel upright for a low Sun. When the view sees the
 * panel's back (`backSeen`), the same line says why: its cells face the Sun.
 */
export function landerCaption(lat: number, backSeen: boolean): string {
  if (poleLine(lat) === null) return backSeen ? "Drawn as built for the poles; you see its panel's back, as its cells face the Sun." : 'The lander is drawn as built for the poles, its solar panel upright for a low Sun.';
  return backSeen ? 'Its panel stands upright for a Sun this low; you see its back, as its cells face the Sun.' : 'Its solar panel stands upright: here the Sun never climbs more than a few degrees.';
}

/**
 * Why a Sun just below the horizon, or behind a hill, leaves the site dark at once: on the Moon no air
 * scatters its light. In the card's lines on why whenever none of the Sun is in view (whyLines); the captions
 * say it shorter, after the Sun leaves the view (NO_TWILIGHT_SHORT, in momentCaption) and in the dark
 * (viewCaption's "No air, no twilight.").
 */
const NO_TWILIGHT = 'With no air there is no twilight: once the Sun has set, it is night.';

/**
 * The line above the headline, which carries the site's name, and what More adds to it. "top", at the top
 * of the card (on a phone once it is opened): where you stand and near which pole, then what is measured
 * and what is drawn, in short parts a student can take one at a time: "Standing at de Gerlache Rim 2, near
 * the Moon's south pole. Hills: NASA height data. Small craters and rocks: added to look real." With
 * `flat`, for a site without NASA heights whose ground is drawn flat, it claims no hills: "Standing at Blue
 * Ghost Mission 1. Ground drawn flat: no NASA heights here. Small craters and rocks: added to look real."
 * "more", under More, below the top line: only what that line does not say, the latitude and the site's own
 * note, "de Gerlache Rim 2 lies at 88.3° S. A ridge on a crater rim, 52 km from the pole.", or the latitude
 * alone for a site without a note, "Blue Ghost Mission 1 lies at 18.6° N." The pole is named from 80° on,
 * south or north, and not at all between.
 */
export function standingLine(site: { lat: number; blurb?: string }, name: string, kind: 'top' | 'more', flat: boolean | 'no-terrain' = false): string {
  if (kind === 'more') return `${name} lies at ${Math.abs(site.lat).toFixed(1)}° ${site.lat < 0 ? 'S' : 'N'}.${site.blurb ? ` ${site.blurb}.` : ''}`;
  const pole = site.lat <= -80 ? ", near the Moon's south pole" : site.lat >= 80 ? ", near the Moon's north pole" : '';
  // Flat where the tool has no NASA heights, or where it has them but this copy lacks the terrain files ('no-terrain').
  const ground = flat === 'no-terrain' ? `Ground drawn flat: ${hasNo('terrain')}.` : flat ? 'Ground drawn flat: no NASA heights here.' : 'Hills: NASA height data.';
  return `Standing at ${name}${pole}. ${ground} Small craters and rocks: added to look real.`;
}

/**
 * Why the Sun stays low, for a site near a pole, and what a few degrees look like, as the labels keep their
 * degrees: two degrees is about a thumb's width at arm's length (18.2). Null elsewhere.
 */
export function poleLine(lat: number): string | null {
  if (Math.abs(lat) < 80) return null;
  return `Near the Moon's ${lat < 0 ? 'south' : 'north'} pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon (two degrees is about a thumb's width at arm's length), so behind a low hill it can stay out of sight for days.`;
}

/** Kilometres to a degree of latitude on the Moon, from its radius of 1,737.4 km. */
const KM_PER_DEGREE = 30.32;

/**
 * Why the view looks as it does at the hour, a line each, in order: near a pole, why the Sun stays low and
 * why Earth rises and sets; by day, why the sky is black, that its stars are there, that Apollo's cameras
 * used short exposures for the bright ground, too short to catch them (APOLLO, which the shorter caption after
 * Look up leaves to this line), that eyes dazzled by the bright ground see few as well, and that looking up,
 * away from it, brings more out; with none of the Sun in view, where it is while farther hills are still
 * lit, and that with no air there is no twilight (NO_TWILIGHT); at night with Earth in view, what lights the
 * ground, that the picture is brightened so the ground shows, and why it looks blue; with Earth
 * in view, how big it looks; near a pole, how far off the pole is and which way, so that north and south
 * still mean something; with none of the Sun in view, how cold the night is, and why the forecast says the
 * power comes back only "if" the lander survives it; and last, at every hour, that the radio forecast is for
 * a link straight to Earth, which a relay satellite such as Chang'e 4's would change. Each line is there only
 * when it applies.
 */
export function whyLines(lat: number, s: Series, hour: number): string[] {
  const lines: string[] = [];
  const pole = poleLine(lat);
  if (pole) {
    lines.push(pole, "Earth hangs almost still in the Moon's sky, because the Moon keeps one face towards it. But the Moon wobbles a little as it goes round, and this close to the pole that is enough to lift Earth above the horizon and lower it again over the month.");
  }
  const el = s.sunEl[hour];
  const earth = s.earthVisible[hour] === 1;
  const lit = s.sunFraction[hour] > 0;
  if (lit) {
    lines.push(`With no air to scatter sunlight, the sky stays black by day, and the stars are still there. ${APOLLO} Eyes dazzled by the bright ground also see few; once it is out of view, you see them.`);
  } else {
    if (el >= 0) lines.push('The Sun is still above the horizon, but behind a hill: higher ground farther off still catches its light.');
    else if (el > -2) lines.push('The Sun is just below the horizon here, but higher ground farther off still catches its light.');
    lines.push(NO_TWILIGHT);
    if (earth) lines.push('At night only Earth lights the ground: sunlight bounced off Earth. The picture is brightened so the ground shows, and that light is why it looks blue.');
  }
  if (earth) lines.push('Earth looks about 2° wide from here, nearly four times as wide as the full Moon looks from Earth.');
  // At the pole itself every way leads away from it; a site off the pole still has one way towards it.
  if (pole) lines.push(`North and south still work here: the pole itself is ${Math.round((90 - Math.abs(lat)) * KM_PER_DEGREE)} km to the ${lat < 0 ? 'south' : 'north'}.`);
  if (!lit) lines.push('The night here is colder than −170 °C. Most landers are not built to survive it, which is why the forecast says "if".');
  // The radio hours are those with Earth in view and the lander powered: a relay satellite would change them.
  lines.push("The radio forecast is for a link straight to Earth; a relay satellite, as China's Chang'e 4 used, would change it.");
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
 * The stand view's status line for the hour (spec 16.2), short, for the one line at the top: the lander's power and
 * its radio. With power from the landing: "Power on, battery 87 %." (the battery's level after the hour, as the
 * forecast page gives it, a whole percentage that keeps its sign on its line), or "Power on." without a battery size;
 * after a power cut, the date of the hour's own stretch and the condition, as the forecast counts energy only, short so
 * the line keeps to a phone's room (the headline and the flags give the stretch's length): "Power on again since 20
 * January, if the lander survived the night; battery 40 %.", or "if the lander survived without power" when the
 * battery ran down with the Sun still up (as offWords tells the two apart). Then the radio:
 * "Radio contact: Earth is in view.", "No radio: Earth is below the horizon." or "No radio: Earth is behind a hill."
 * Without power: "Power off: the battery ran out on 4 January.", then "Earth is in view, but the radio has no
 * power." with Earth in view, and "Power does not come back in this period." when it does not; when it does, the
 * flags on the time bar say when. `on` is whether it has power; true until that is worked out. `tone` is for the
 * page's dot: "radio" with power and Earth in view, "power" with power alone or while the power is being worked
 * out, and "off" without power.
 */
export function statusLine(s: Series, p: PowerResult | null, startUtc: string, hour: number, batteryWh?: number): { on: boolean; tone: 'radio' | 'power' | 'off'; text: string } {
  if (!p) return { on: true, tone: 'power', text: WORKING };
  const seen = s.earthVisible[hour] === 1;
  const from = stretchStart(p.powered, hour);
  if (p.powered[hour] !== 1) {
    const back = stretchEnd(p.powered, hour) < p.powered.length;
    return { on: false, tone: 'off', text: `Power off: the battery ran out on ${dateLong(startUtc, from)}.${seen ? ' Earth is in view, but the radio has no power.' : ''}${back ? '' : ' Power does not come back in this period.'}` };
  }
  // Without a battery there is no level to give.
  const level = batteryWh !== undefined && batteryWh > 0 ? `battery ${pct0(p.energyWh[hour] / batteryWh)}` : '';
  const power =
    from === 0
      ? `Power on${level ? `, ${level}` : ''}.`
      : `Power on again since ${dateLong(startUtc, from)}, if the lander survived ${s.sunFraction[stretchStart(p.powered, from - 1)] === 0 ? 'the night' : 'without power'}${level ? `; ${level}` : ''}.`;
  const radio = seen ? 'Radio contact: Earth is in view.' : `No radio: Earth is ${s.earthEl[hour] < 0 ? 'below the horizon' : 'behind a hill'}.`;
  return { on: true, tone: seen ? 'radio' : 'power', text: `${power} ${radio}` };
}

/**
 * The stand view's headline, from Explore's answer title (answerFor's): the site's name goes to the line
 * above (standingLine), so "Landing at <siteName> on 1 January: ..." becomes "Landing on 1 January: ..." and
 * "No sunlight at <siteName> in these 30 days" becomes "No sunlight in these 30 days"; the night becomes a
 * count of the days without power that adds up with the power (nightHeadline); and the radio's verdict goes
 * straight after the power (radioHeadline): "Landing on 1 January: power for 3 days 4 hours, no radio
 * contact, then 16 days without power". Every span of days and hours keeps to one line, with no-break spaces
 * inside it, so "3 days 4 hours" never breaks after "days"; the rest may wrap. The better day's link and the
 * arrival's line do the same (unbrokenSpans); spanWords keeps plain spaces for every other caller. Every other title keeps its words but the site's name.
 * `poweredHours` is the answer's hours with power from the landing, and `contactHours` those of them with
 * Earth in view.
 */
export function standHeadline(title: string, siteName: string, s: Series, p: PowerResult, startUtc: string, contactHours: number, poweredHours: number): string {
  const landing = `Landing at ${siteName} on `;
  const dark = `No sunlight at ${siteName} in `;
  const unnamed = title.startsWith(landing) ? `Landing on ${title.slice(landing.length)}` : title.startsWith(dark) ? `No sunlight in ${title.slice(dark.length)}` : title;
  return unbrokenSpans(radioHeadline(nightHeadline(unnamed, s, p, startUtc), contactHours, poweredHours));
}

/**
 * The headline's short form, the phone's first line on the status plate (19.1): the day, the power and the radio,
 * "1 January: power for 3 days 4 hours, no radio", in two lines beside More at 360 px; the night is left to today's
 * card, which keeps the whole headline. It drops "Landing on ", everything from the first ", then", and "contact"
 * after "no radio"; any other title keeps its words ("No sunlight in these 30 days").
 */
export function phoneHeadline(title: string): string {
  const landing = 'Landing on ';
  const day = title.startsWith(landing) ? title.slice(landing.length) : title;
  const then = day.indexOf(', then ');
  return (then < 0 ? day : day.slice(0, then)).replace('no radio contact', 'no radio');
}

/**
 * The headline with the stretch without power as a count of days that adds up with the power, when the power
 * runs out at night (no part of the Sun in view at the first hour without power) and the title ends ", then
 * night": "...: power for 3 days 4 hours, then 16 days without power", the whole days from the first hour
 * without power to the first with power again (daysOff: between their dates, at least one, "1 day without
 * power"), so that 1 January, 3 days 4 hours and 16 days bring you to 20 January, where the power comes back.
 * It is called what it is, the time without power: the time bar's flags for the battery running out and the
 * power back are those 16 days apart, while from the Sun going down the night is longer. That holds when the
 * period starts in the dark too, as the count starts where the power runs out. When the power does not come
 * back in the period: "..., then no power to the end of the period". Any other title comes back as it is.
 */
export function nightHeadline(title: string, s: Series, p: PowerResult, startUtc: string): string {
  const tail = ', then night';
  const first = p.firstBrownoutHour;
  if (first === null || s.sunFraction[first] !== 0 || !title.endsWith(tail)) return title;
  const head = title.slice(0, -tail.length);
  const back = stretchEnd(p.powered, first);
  if (back >= p.powered.length) return `${head}, then no power to the end of the period`;
  return `${head}, then ${spanWords(daysOff(startUtc, first, back) * 24)} without power`;
}

/**
 * The headline, after nightHeadline, with the radio's verdict beside the power's, as the challenge asks
 * about both: of the hours with power from the landing, those with Earth in view, as "no radio contact",
 * "radio all the while" or "radio for 12 days 3 hours". It goes straight after the power, before the first
 * ", then" when the title has one, else at the end: "...: power for 3 days 4 hours, no radio contact, then
 * 16 days without power", "...: power for all 30 days, radio for 12 days 3 hours". Without power from the
 * landing the title comes back as it is, and so does a title that says nothing of the power, as "No
 * sunlight in these 30 days": there is no power for the verdict to follow, and "radio all the while" for
 * the battery's few hours would read as the whole period.
 */
export function radioHeadline(title: string, contactHours: number, poweredHours: number): string {
  if (poweredHours <= 0 || !title.includes(': power for ')) return title;
  const radio = contactHours <= 0 ? 'no radio contact' : contactHours >= poweredHours ? 'radio all the while' : `radio for ${spanWords(contactHours)}`;
  const then = title.indexOf(', then ');
  return then < 0 ? `${title}, ${radio}` : `${title.slice(0, then)}, ${radio}${title.slice(then)}`;
}

/**
 * The better landing day's button, a suggestion that says what it does, to the hour as the headline says its
 * spans: "Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours", or "...: power for 12
 * days 15 hours, no radio contact" when Earth is never in view in that time. The home page's forecast and the
 * arrival give that landing the same "12 days 15 hours", so no page gives one landing two lengths. `dayLong` is
 * the day as dateLong writes it; the hours are those with power from that day, and those of them with Earth in
 * view, which the page passes as a share of the hours with power: both read as the whole hours they were
 * counted in. Each span keeps to one line, with no-break spaces inside it, as the headline's do, so "hours"
 * never wraps onto a line of its own; the rest may wrap.
 * `short`: the power alone, for the row under the status line; today's card gives the radio too.
 */
export function betterLabel(dayLong: string, poweredHours: number, radioHours: number, short = false): string {
  const radio = Math.round(radioHours) <= 0 ? 'no radio contact' : `radio for ${spanWords(radioHours)}`;
  return unbrokenSpans(`Try ${dayLong} instead: power for ${spanWords(poweredHours)}${short ? '' : `, ${radio}`}`);
}

/**
 * The better landing day on a phone's first screen (18.3): the day short, as the flags write it ("20 Jan"), and the
 * power alone, each span on one line; today's card keeps the long form with the radio (betterLabel).
 */
export function betterChip(dayShort: string, poweredHours: number): string {
  return unbrokenSpans(`Try ${dayShort} instead: power for ${spanWords(poweredHours)}`);
}

/**
 * The words for the hour's own stretch with or without power. With power: "The lander has power", or after a cut
 * "The lander has power again since 20 January, if it survived 15 days 12 hours without power". Without: "The
 * lander is off: its battery ran out on 4 January." and when the power comes back, if it does in the period, with
 * the same condition. The forecast counts energy only: surviving the cold without power is the hard part, and no
 * line says the lander simply restarts.
 */
function stretchWords(p: PowerResult, startUtc: string, hour: number): { on: true; has: string } | { on: false; off: string; back: string } {
  const from = stretchStart(p.powered, hour);
  if (p.powered[hour] === 1) {
    if (from === 0) return { on: true, has: 'The lander has power' };
    const off = from - stretchStart(p.powered, from - 1);
    return { on: true, has: `The lander has power again since ${dateLong(startUtc, from)}, if it survived ${spanWords(off)} without power` };
  }
  const end = stretchEnd(p.powered, hour);
  return {
    on: false,
    off: `The lander is off: its battery ran out on ${dateLong(startUtc, from)}.`,
    back: end < p.powered.length ? `Power comes back on ${dateLong(startUtc, end)}, if the lander survives ${spanWords(end - from)} without power.` : 'Power does not come back in this period.',
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

/**
 * The whole days without power from the hour `from` to the hour `back` with power again, counted between
 * their dates, and at least one: with the date the battery runs out, the count brings you to the date the
 * power comes back. That is the stretch's length rounded to the nearest day whenever that rounding adds up,
 * and a day off it only where the rounding would not: 4 January 04:00 to 20 January 16:00 is 16.5 days, and
 * 16 days, as 17 would bring you to 21 January.
 */
function daysOff(startUtc: string, from: number, back: number): number {
  const t0 = Date.parse(startUtc.endsWith('Z') ? startUtc : `${startUtc}Z`);
  const day = (h: number) => Math.floor((t0 + h * 3_600_000) / 86_400_000);
  return Math.max(1, day(back) - day(from));
}

/**
 * The stretch without power that ends at `back`, the first hour with power again, for the condition on the
 * power coming back, its days counted by daysOff as the headline counts them: "16 days without power at
 * night, colder than −170 °C" when the power ran out at night (no part of the Sun in view at the stretch's
 * first hour), else "2 days without power", when the battery ran down for too little sunlight with the Sun
 * still up. Night is the one name for the hours without the Sun, whether it set below the horizon or behind
 * the hills, as the time bar's key ("night") and its flag ("Sunset") have it.
 */
function offWords(s: Series, p: PowerResult, startUtc: string, back: number): string {
  const from = stretchStart(p.powered, back - 1);
  const off = `${spanWords(daysOff(startUtc, from, back) * 24)} without power`;
  return s.sunFraction[from] === 0 ? `${off} at night, colder than −170 °C` : off;
}

/** A span of days or hours as spanWords writes it: "3 days 4 hours", "16 days", "1 hour". */
const SPAN = /\b\d+ (?:days?|hours?)(?: \d+ hours?)?\b/g;

/** The text with no-break spaces inside each span of days and hours, so that none breaks across two lines. */
export function unbrokenSpans(text: string): string {
  return text.replace(SPAN, (span) => span.replace(/ /g, '\u00a0'));
}
