import { describe, expect, it } from 'vitest';
import { hourlySeries, summarize, type Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig, type PowerResult } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { standHref } from '@/lib/links';
import { eph, sites } from '@/test/file-loaders';
import { answerFor } from './answer';
import { hero } from './arrival';
import { spanWords } from './format';
import { groundWords } from './ground';
import {
  betterChip,
  betterLabel,
  keyMoments,
  landerCaption,
  landerState,
  liveSentence,
  measuredNote,
  momentCaption,
  nightHeadline,
  poleLine,
  radioHeadline,
  radioNext,
  shadowWords,
  skyLabel,
  standHeadline,
  standingLine,
  standQuery,
  starLabel,
  statusLine,
  viewCaption,
  watchNext,
  WATCH_LEAD,
  WATCH_LEAD_DOTS,
  whyLines,
  type MomentKind,
} from './stand';

// With nothing given, an hour with the Sun and Earth on the level horizon, neither in view.
const series = (o: Partial<Record<'sunEl' | 'sunAz' | 'sunFraction' | 'earthEl' | 'earthAz' | 'earthVisible', number[]>> = {}): Series => {
  const hours = (o.sunEl ?? [0]).length;
  const f = (a?: number[], v = 0) => Float64Array.from(a ?? new Array(hours).fill(v));
  return { i0: 0, hours, sunAz: f(o.sunAz, 300), sunEl: f(o.sunEl), earthAz: f(o.earthAz, 70), earthEl: f(o.earthEl), sunFraction: f(o.sunFraction), earthVisible: Uint8Array.from(o.earthVisible ?? new Array(hours).fill(0)), sunAu: f(undefined, 1) } as Series;
};
/** A span as the stand view's headline writes it, on one line: "3 days 4 hours" with no-break spaces. */
const unbroken = (span: string) => span.replace(/ /g, '\u00a0');

describe('the stand view’s words', () => {
  it('reads the hour from the address, and leaves out what it cannot use', () => {
    expect(standQuery('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10')).toEqual({ site: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, hour: 10 });
    expect(standQuery('?hour=-3').hour).toBeUndefined();
    expect(standQuery('?hour=ten').hour).toBeUndefined();
    expect(standQuery('?hour=2.5').hour).toBeUndefined();
  });
  it('links to the view for a site, a period and an hour', () => {
    expect(standHref('de_gerlache_rim_2', '2027-01-01T00:00:00', 30, 10)).toBe('/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
  });
  it('labels the Sun and Earth by what they are doing', () => {
    const s = series({ sunEl: [2.4, 1.0, -0.5, 1.6], sunFraction: [1, 0, 0, 1], earthEl: [4.2, 1.2, -3, 1.2], earthVisible: [1, 0, 0, 1] });
    expect(skyLabel('sun', s, 0)).toBe('Sun 2.4° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun behind a hill to the north-west, 1.0° up');
    expect(skyLabel('sun', s, 2)).toBe('Sun, 0.5° below the horizon');
    expect(skyLabel('sun', s, 3)).toBe('Sun 1.6° up');
    expect(skyLabel('earth', s, 0)).toBe('Earth 4.2° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth behind a hill to the east, 1.2° up');
    expect(skyLabel('earth', s, 2)).toBe('Earth, 3.0° below the horizon');
    expect(skyLabel('earth', s, 3)).toBe('Earth 1.2° up');
  });
  // How far below the horizon Earth is says how long the radio waits: a body out of view keeps its height.
  it('gives the height of a body out of view: how far below the horizon, or how high behind the hills', () => {
    const s = series({ sunEl: [0.4, -12.36], sunFraction: [0, 0], earthEl: [-1.2, 0.4], earthVisible: [0, 0] });
    expect(skyLabel('earth', s, 0)).toBe('Earth, 1.2° below the horizon');
    expect(skyLabel('sun', s, 0)).toBe('Sun behind a hill to the north-west, 0.4° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun, 12° below the horizon');
    expect(skyLabel('earth', s, 1)).toBe('Earth behind a hill to the east, 0.4° up');
  });
  it('never gives a body out of view a height of 0.0°: within a twentieth of a degree of level it is on the horizon, or just below it', () => {
    const s = series({ sunEl: [0.02, -0.03], sunFraction: [0, 0], earthEl: [-0.03, 0], earthVisible: [0, 0] });
    expect(skyLabel('sun', s, 0)).toBe('Sun behind a hill to the north-west, on the horizon');
    expect(skyLabel('sun', s, 1)).toBe('Sun, just below the horizon');
    expect(skyLabel('earth', s, 0)).toBe('Earth, just below the horizon');
    expect(skyLabel('earth', s, 1)).toBe('Earth behind a hill to the east, on the horizon');
  });
  it('names the hill that hides a body by its direction, as the ground panel does, and says "up", never "above the horizon" (read D2-2)', () => {
    const s = series({ sunEl: [1.6, 1.6], sunFraction: [0, 0], sunAz: [180, 225] });
    expect(skyLabel('sun', s, 0)).toBe('Sun behind a hill to the south, 1.6° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun behind a hill to the south-west, 1.6° up');
    expect(skyLabel('sun', s, 0)).not.toMatch(/above the horizon/);
  });
  // Near a pole the Sun and Earth stay within a few degrees of the horizon, where a whole degree says too little.
  it('gives a height under 10° to a tenth of a degree, and whole degrees from 10°', () => {
    const s = series({ sunEl: [2.4, 2.0, 9.94, 9.96, 12.36], sunFraction: [1, 1, 1, 1, 1], earthEl: [0.6, 0.83, 1.95, 10, 41.5], earthVisible: [1, 1, 1, 1, 1] });
    expect([0, 1, 2, 3, 4].map((h) => skyLabel('sun', s, h))).toEqual(['Sun 2.4° up', 'Sun 2.0° up', 'Sun 9.9° up', 'Sun 10° up', 'Sun 12° up']);
    expect([0, 1, 2, 3, 4].map((h) => skyLabel('earth', s, h))).toEqual(['Earth 0.6° up', 'Earth 0.8° up', 'Earth 2.0° up', 'Earth 10° up', 'Earth 42° up']);
  });
  it('says when the lander has power, when it went off, when it comes back, and when it never does', () => {
    const powered = Uint8Array.from([...new Array(76).fill(1), ...new Array(390).fill(0), ...new Array(254).fill(1)]);
    const p = { powered, firstBrownoutHour: 76 } as unknown as PowerResult;
    expect(landerState(p, '2027-01-01T00:00:00', 10)).toEqual({ on: true, text: 'The lander has power.' });
    expect(landerState(p, '2027-01-01T00:00:00', 100)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 4 January. Power comes back on 20 January, if the lander survives 16 days 6 hours without power.' });
    expect(landerState(p, '2027-01-01T00:00:00', 500)).toEqual({ on: true, text: 'The lander has power again since 20 January, if it survived 16 days 6 hours without power.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(landerState(never, '2027-01-01T00:00:00', 3).text).toBe('The lander is off: its battery ran out on 1 January. Power does not come back in this period.');
  });
  it('joins the ground panel’s two sentences, in total darkness too', () => {
    const s = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(liveSentence(s, 0)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is below the horizon: no radio contact.');
  });
  it('does not promise radio contact while the lander has no power', () => {
    const s = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [4.2], earthVisible: [1] });
    expect(liveSentence(s, 0, true)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is in view 4.2° above the horizon to the east: radio contact is possible.');
    expect(liveSentence(s, 0, false)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is in view 4.2° above the horizon to the east, but the lander has no power for its radio.');
  });

  // From a high point the skyline dips below level, so the Sun and Earth can show while just below the
  // level horizon: whether a body shows comes from the skyline, as in the ground panel's words.
  it('calls a body that shows over a skyline below level "on the horizon", not below it', () => {
    const s = series({ sunEl: [-0.4], sunFraction: [1], earthEl: [-0.3], earthVisible: [1] });
    expect(skyLabel('sun', s, 0)).toBe('Sun, on the horizon');
    expect(skyLabel('earth', s, 0)).toBe('Earth, on the horizon');
  });
  it('agrees with the ground panel for every hour of a test month, bodies seen from just below level included', () => {
    const site = sites.find((x) => x.id === 'de_gerlache_rim_2')!;
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const s = hourlySeries(site, mask, eph, utcToEt('2027-03-01T00:00:00'), 30 * 24);
    const hours = [...new Array(s.hours).keys()];
    // Hidden: the ground panel's "set behind the hills", the label's "behind a hill".
    const where = (text: string) => (text.includes('below the horizon') ? 'below' : /behind (the hills|a hill)/.test(text) ? 'hidden' : 'seen');
    const differ = hours.filter((h) => {
      const w = groundWords(s, h);
      const sun = w.siteState === 'at night' ? 'below' : w.siteState === 'in shadow' ? 'hidden' : 'seen';
      return where(skyLabel('sun', s, h)) !== sun || where(skyLabel('earth', s, h)) !== where(w.earth);
    });
    expect(differ).toEqual([]);
    // And the same height above the horizon, "2.5°" in both, wherever the ground panel gives one.
    const up = (text: string) => text.match(/(\d+(?:\.\d)?)° (?:up|above)/)?.[1] ?? null;
    const heights = hours.filter((h) => {
      const w = groundWords(s, h);
      return (up(w.sun) !== null && up(skyLabel('sun', s, h)) !== up(w.sun)) || (up(w.earth) !== null && up(skyLabel('earth', s, h)) !== up(w.earth));
    });
    expect(heights).toEqual([]);
    // And the hill that hides a body named by the ground panel's direction (18.2): "behind a hill to the north-west".
    const way = (text: string) => text.match(/behind (?:a hill|the hills) to the ([a-z-]+)/)?.[1] ?? null;
    const ways = hours.filter((h) => {
      const w = groundWords(s, h);
      return (w.sunHidden === 'yes' && way(skyLabel('sun', s, h)) !== way(w.sun)) || (w.earthHidden === 'yes' && way(skyLabel('earth', s, h)) !== way(w.earth));
    });
    expect(ways).toEqual([]);
    expect(hours.some((h) => groundWords(s, h).sunHidden === 'yes')).toBe(true);
    expect(hours.filter((h) => up(groundWords(s, h).sun)?.includes('.')).length).toBeGreaterThan(0);
    expect(hours.some((h) => s.sunFraction[h] > 0 && s.sunEl[h] < 0)).toBe(true);
    expect(hours.some((h) => s.earthVisible[h] === 1 && s.earthEl[h] < 0)).toBe(true);
  });

  // A long period can hold several power cuts: the words date the cut the hour is in, not the first one.
  it('dates the power cut the hour is in, when the period holds more than one', () => {
    const powered = Uint8Array.from([...new Array(48).fill(1), ...new Array(48).fill(0), ...new Array(96).fill(1), ...new Array(48).fill(0), ...new Array(48).fill(1)]);
    const p = { powered, firstBrownoutHour: 48 } as unknown as PowerResult;
    expect(landerState(p, '2027-01-01T00:00:00', 150).text).toBe('The lander has power again since 5 January, if it survived 2 days without power.');
    expect(landerState(p, '2027-01-01T00:00:00', 200)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 9 January. Power comes back on 11 January, if the lander survives 2 days without power.' });
    expect(landerState(p, '2027-01-01T00:00:00', 260).text).toBe('The lander has power again since 11 January, if it survived 2 days without power.');
  });
});

describe('the lander’s power and radio in one sentence', () => {
  // Power until hour 76 (4 January), none until 466 (20 January), then power to the end. Earth is in view
  // for hours 0-14, 90-149 and 480-549; below the horizon for 15-24 and from 550; behind the hills otherwise.
  const powered = Uint8Array.from([...new Array(76).fill(1), ...new Array(390).fill(0), ...new Array(254).fill(1)]);
  const p = { powered, firstBrownoutHour: 76 } as unknown as PowerResult;
  const seen = (h: number) => h < 15 || (h >= 90 && h < 150) || (h >= 480 && h < 550);
  const below = (h: number) => (h >= 15 && h < 25) || h >= 550;
  const s = series({
    sunEl: Array.from({ length: 720 }, () => 1),
    earthEl: Array.from({ length: 720 }, (_, h) => (below(h) ? -3 : 1.5)),
    earthVisible: Array.from({ length: 720 }, (_, h) => (seen(h) ? 1 : 0)),
  });
  const start = '2027-01-01T00:00:00';

  it('says the lander can radio Earth while it has power and Earth is in view', () => {
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, tone: 'radio', text: 'Power on. Radio contact: Earth is in view.' });
  });
  it('says why the lander cannot radio home while Earth is out of view', () => {
    expect(statusLine(s, p, start, 20)).toEqual({ on: true, tone: 'power', text: 'Power on. No radio: Earth is below the horizon.' });
    // Hidden while above the horizon: "behind a hill", one name for it (15.1).
    expect(statusLine(s, p, start, 30)).toEqual({ on: true, tone: 'power', text: 'Power on. No radio: Earth is behind a hill.' });
  });
  it('says since when the lander has had power again after a power cut, and only if it survived', () => {
    expect(statusLine(s, p, start, 500)).toEqual({ on: true, tone: 'radio', text: 'Power on again since 20 January, if the lander survived the night. Radio contact: Earth is in view.' });
    expect(statusLine(s, p, start, 600)).toEqual({ on: true, tone: 'power', text: 'Power on again since 20 January, if the lander survived the night. No radio: Earth is below the horizon.' });
  });
  it('does not promise radio contact while the lander is off, even with Earth in view', () => {
    expect(statusLine(s, p, start, 100)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January. Earth is in view, but the radio has no power.' });
  });
  // The flags on the time bar say when the power comes back; this line says so only when it never does.
  it('stops at the battery running out when the power comes back in the period, and says so when it never does', () => {
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(statusLine(series({ sunEl: [1, 1, 1, 1] }), never, start, 3)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 1 January. Power does not come back in this period.' });
    // With Earth in view too, both: the radio has no power, and the power does not come back.
    expect(statusLine(series({ sunEl: [1, 1, 1, 1], earthEl: [4, 4, 4, 4], earthVisible: [1, 1, 1, 1] }), never, start, 3)).toEqual({
      on: false,
      tone: 'off',
      text: 'Power off: the battery ran out on 1 January. Earth is in view, but the radio has no power. Power does not come back in this period.',
    });
  });
  it('says the power is being worked out until it is known', () => {
    expect(statusLine(s, null, start, 10)).toEqual({ on: true, tone: 'power', text: 'Working out the lander’s power…' });
  });
  it('agrees with the line on the power alone at every hour', () => {
    const differ = [...new Array(720).keys()].filter((h) => statusLine(s, p, start, h).on !== landerState(p, start, h).on);
    expect(differ).toEqual([]);
  });
  it('gives the dot its tone at every hour: radio only with power and Earth in view, power with power alone, off without power', () => {
    const tone = (h: number) => (powered[h] === 0 ? 'off' : seen(h) ? 'radio' : 'power');
    const differ = [...new Array(720).keys()].filter((h) => statusLine(s, p, start, h).tone !== tone(h));
    expect(differ).toEqual([]);
  });
});

describe('why the view looks as it does', () => {
  const pole = "Near the Moon's south pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon (two degrees is about a thumb's width at arm's length), so behind a low hill it can stay set for days.";
  const earthMoves =
    "Earth hangs almost still in the Moon's sky, because the Moon keeps one face towards it. But the Moon wobbles a little as it goes round, and this close to the pole that is enough to lift Earth above the horizon and lower it again over the month.";
  // Why the sky is black by day, that its stars are there, why Apollo's photos show none (the cameras'
  // short exposures), that dazzled eyes see few too, and that looking up, away from the ground, brings more
  // out: the caption after Look up says the first three, in the same words for the cameras.
  const black =
    "With no air to scatter sunlight, the sky stays black by day, and the stars are still there. Apollo's cameras used short exposures for the bright ground, too short to catch the stars. Eyes dazzled by the bright ground also see few; once it is out of view, you see them.";
  const hidden = 'The Sun is still above the horizon, but behind a hill: higher ground farther off still catches its light.';
  const justBelow = 'The Sun is just below the horizon here, but higher ground farther off still catches its light.';
  // Why a Sun just below the horizon, or behind a hill, leaves the site dark at once.
  const noTwilight = 'With no air there is no twilight: once the Sun has set, it is night.';
  const earthLight = 'At night only Earth lights the ground: sunlight bounced off Earth. The picture is brightened so the ground shows, and that light is why it looks blue.';
  const earthSize = 'Earth looks about 2° wide from here, nearly four times as wide as the full Moon looks from Earth.';
  const south = 'North and south still work here: the pole itself is 52 km to the south.';
  const cold = 'The night here is colder than −170 °C. Most landers are not built to survive it, which is why the forecast says "if".';
  // What the radio forecast takes for granted, said at every hour.
  const radio = "The radio forecast is for a link straight to Earth; a relay satellite, as China's Chang'e 4 used, would change it.";

  it('near a pole by day: why the Sun stays low, why Earth rises and sets, why the sky is black, and where the pole is', () => {
    const day = series({ sunEl: [2.4], sunFraction: [1], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, day, 0)).toEqual([pole, earthMoves, black, south, radio]);
    // Any part of the Sun in view is day, and the north pole has the same lines.
    const sliver = series({ sunEl: [0.2], sunFraction: [0.3] });
    expect(whyLines(85, sliver, 0)).toEqual([poleLine(85), earthMoves, black, 'North and south still work here: the pole itself is 152 km to the north.', radio]);
  });
  it('near a pole at night with Earth in view: no twilight, only Earth lights the ground, how big Earth looks, where the pole is, and how cold the night is', () => {
    const night = series({ sunEl: [-3], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, night, 0)).toEqual([pole, earthMoves, noTwilight, earthLight, earthSize, south, cold, radio]);
  });
  it('says how big Earth looks whenever it is in view, by day or by night, after the lines on the light', () => {
    const day = series({ sunEl: [2.4], sunFraction: [1], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, day, 0)).toEqual([pole, earthMoves, black, earthSize, south, radio]);
    const shade = series({ sunEl: [1.2], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, shade, 0)).toEqual([pole, earthMoves, hidden, noTwilight, earthLight, earthSize, south, cold, radio]);
    const dusk = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, dusk, 0)).toEqual([pole, earthMoves, justBelow, noTwilight, earthLight, earthSize, south, cold, radio]);
    // Earth above the level horizon but behind the hills is not in view.
    const hiddenEarth = series({ sunEl: [2.4], sunFraction: [1], earthEl: [2], earthVisible: [0] });
    expect(whyLines(-88.28, hiddenEarth, 0)).toEqual([pole, earthMoves, black, south, radio]);
  });
  it('says the Sun is still above the horizon when it sets behind the hills, and that with no twilight it is night all the same', () => {
    const shade = series({ sunEl: [1.2], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, shade, 0)).toEqual([pole, earthMoves, hidden, noTwilight, south, cold, radio]);
  });
  it('says the Sun is just below the horizon when it is, and not once it is two degrees down', () => {
    const dusk = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, dusk, 0)).toEqual([pole, earthMoves, justBelow, noTwilight, south, cold, radio]);
    expect(whyLines(-88.28, series({ sunEl: [-2], sunFraction: [0] }), 0)).toEqual([pole, earthMoves, noTwilight, south, cold, radio]);
  });
  it('says nothing of the pole, of Earth rising and setting, or of how far the pole is, far from the poles', () => {
    expect(whyLines(-45, series({ sunEl: [30], sunFraction: [1], earthEl: [40], earthVisible: [1] }), 0)).toEqual([black, earthSize, radio]);
    expect(whyLines(-45, series({ sunEl: [-30], sunFraction: [0], earthEl: [40], earthVisible: [1] }), 0)).toEqual([noTwilight, earthLight, earthSize, cold, radio]);
  });
  // A Sun just below the horizon, or a few degrees up behind a hill, reads as dusk unless something says why
  // the site is dark at once.
  it('says there is no twilight whenever none of the Sun is in view, right after where the Sun is, and never by day', () => {
    for (const [sunEl, sunFraction] of [[1.2, 0], [-0.5, 0], [-2, 0], [-30, 0]]) {
      const lines = whyLines(-88.28, series({ sunEl: [sunEl], sunFraction: [sunFraction] }), 0);
      expect(lines).toContain(noTwilight);
      expect(lines.indexOf(noTwilight)).toBe(lines.indexOf(sunEl > -2 ? (sunEl >= 0 ? hidden : justBelow) : earthMoves) + 1);
    }
    // Any part of the Sun in view is day.
    expect(whyLines(-88.28, series({ sunEl: [0.2], sunFraction: [0.3] }), 0)).not.toContain(noTwilight);
    expect(whyLines(-45, series({ sunEl: [30], sunFraction: [1] }), 0)).not.toContain(noTwilight);
  });
  // Explore's radio forecast counts the hours with Earth in view: a relay satellite would make it wrong.
  it('says, last, that the radio forecast is for a link straight to Earth, by day and by night, near a pole and far from it', () => {
    for (const lat of [-88.28, 85, -45, 18.56]) {
      for (const sun of [series({ sunEl: [2.4], sunFraction: [1] }), series({ sunEl: [-3], sunFraction: [0], earthEl: [4], earthVisible: [1] })]) {
        const lines = whyLines(lat, sun, 0);
        expect(lines.at(-1)).toBe(radio);
        expect(lines.filter((l) => l === radio)).toHaveLength(1);
      }
    }
  });
  it('says how far off the pole is, and which way, so that north and south still mean something there', () => {
    // 30.32 km to a degree on the Moon: 1.72° from the pole is 52 km, 5° is 152 km and 10° is 303 km.
    const day = series({ sunEl: [2.4], sunFraction: [1] });
    expect(whyLines(-88.28, day, 0)).toContain(south);
    expect(whyLines(85, day, 0)).toContain('North and south still work here: the pole itself is 152 km to the north.');
    expect(whyLines(-80, day, 0)).toContain('North and south still work here: the pole itself is 303 km to the south.');
    expect(whyLines(-79.9, day, 0).filter((l) => l.startsWith('North and south'))).toEqual([]);
  });
  // Apollo's photos show no stars because its cameras' short exposures, set for the bright ground, were too
  // short for them: not because eyes were dazzled. The caption after Look up keeps to two lines and leaves the
  // cameras to this line; what it does say, the two agree on.
  it('agrees with the caption after Look up that the sky is black by day, and says that Apollo’s cameras used exposures too short to catch the stars, that the stars show once the bright ground is out of view, and that dazzled eyes see few too', () => {
    const day = whyLines(-88.28, series({ sunEl: [2.4], sunFraction: [1] }), 0).find((l) => l.startsWith('With no air'))!;
    const cameras = "Apollo's cameras used short exposures for the bright ground, too short to catch the stars.";
    for (const text of [day, viewCaption('up', -88.28), viewCaption('up', 18.56)]) {
      expect(text).toMatch(/sky (is|stays) black/);
      // Nothing puts Apollo's missing stars down to dazzled eyes.
      expect(text).not.toMatch(/which is why Apollo|Apollo photos show none|hardly see them/);
    }
    expect(day).toMatch(/out of view/);
    expect(day).toContain(cameras);
    // The longer line under More says the stars are still there, and that eyes dazzled by the bright ground see
    // few as well.
    expect(day).toMatch(/the stars are still there/);
    expect(day).toMatch(/Eyes dazzled by the bright ground also see few/);
  });
  it('says how cold the night is, and why the forecast says "if", whenever no part of the Sun shows', () => {
    expect(whyLines(-45, series({ sunEl: [-30], sunFraction: [0] }), 0)).toEqual([noTwilight, cold, radio]);
    expect(whyLines(-88.28, series({ sunEl: [1.2], sunFraction: [0] }), 0)).toContain(cold);
    // Any part of the Sun in view is day.
    expect(whyLines(-88.28, series({ sunEl: [0.2], sunFraction: [0.3] }), 0)).not.toContain(cold);
  });
});

describe('the headline’s night', () => {
  // Sun for `day` hours, then `dark` hours of night, then Sun again to the end of `hours`; the battery lasts
  // `battery` hours into the night, and the power comes back with the Sun.
  const night = (day: number, dark: number, hours: number, battery: number) => {
    const sunrise = day + dark;
    const s = series({ sunEl: Array.from({ length: hours }, () => 1), sunFraction: Array.from({ length: hours }, (_, h) => (h < day || h >= sunrise ? 1 : 0)) });
    const first = day + battery;
    const p = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < first || h >= sunrise ? 1 : 0)), firstBrownoutHour: first } as unknown as PowerResult;
    return { s, p };
  };
  const start = '2027-01-01T00:00:00';

  // The flags on the time bar mark the battery running out (4 January) and the power back (20 January): the
  // headline counts the same stretch, and calls it what it is, so the two add up. Counted from the sunset flag
  // (3 January), the night would be 17 days.
  it('counts the days without power from the power running out to its coming back, so the dates add up', () => {
    // The power runs out at hour 76, 4 January 04:00, and comes back with the Sun at 472, 20 January 16:00:
    // 16.5 days. Rounded up, "17 days without power" after "power for 3 days 4 hours" would bring you to 21
    // January; 16 brings you to 20 January, where the power comes back.
    const { s, p } = night(67, 405, 720, 9);
    expect(nightHeadline('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night', s, p, start)).toBe(
      'Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then 16 days without power',
    );
    // 2 January 16:00 to 4 January 06:00.
    const two = night(30, 48, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', two.s, two.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days without power');
    // Across the end of a year: 28 December to 13 January.
    expect(nightHeadline('Landing at Alpha Ridge on 25 December: power for 3 days 4 hours, then night', s, p, '2027-12-25T00:00:00')).toBe(
      'Landing at Alpha Ridge on 25 December: power for 3 days 4 hours, then 16 days without power',
    );
    // The line on what to watch next counts the same stretch the same way.
    expect(watchNext(s, p, start, 100)).toBe(`${WATCH_LEAD} the Sun rises on 20 January, and the power with it, if the lander survives 16 days without power at night, colder than −170 °C.`);
  });
  it('counts a stretch of a day or less without power as a day, and says "1 day"', () => {
    // 10 hours without power, overnight: 2 January 16:00 to 3 January 02:00.
    const short = night(30, 20, 96, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', short.s, short.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 1 day without power');
    // 6 hours, within 2 January: still a day.
    const brief = night(30, 8, 96, 2);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 8 hours, then night', brief.s, brief.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 8 hours, then 1 day without power');
    // 37 hours: 2 January 16:00 to 4 January 05:00.
    const almost = night(30, 47, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', almost.s, almost.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days without power');
  });
  it('says so when the power does not come back in the period', () => {
    const { s, p } = night(20, 172, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night', s, p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then no power to the end of the period');
  });
  it('leaves any other headline as it is', () => {
    const { s, p } = night(67, 405, 720, 9);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight', s, p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight');
    const all = { powered: Uint8Array.from({ length: 720 }, () => 1), firstBrownoutHour: null } as unknown as PowerResult;
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then night', s, all, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then night');
  });
  it('counts from the power running out when the period starts in the dark too', () => {
    // The night began before the landing, but the count starts where the power runs out, 1 January 10:00,
    // and ends where it comes back, 2 January 06:00.
    const { s, p } = night(0, 30, 96, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 10 hours, then night', s, p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 10 hours, then 1 day without power');
  });
});

describe('the stand view’s headline', () => {
  // 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
  const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
  const start = '2027-01-01T00:00:00';
  const rep = (v: number, n: number) => new Array<number>(n).fill(v);
  // Explore's verdict for a lander at Alpha Ridge from 1 January, hour by hour, and the headline the view makes of it.
  const headline = (sun: number[], cfg: PowerConfig = CFG, earth: number[] = []) => {
    const s = series({ sunEl: sun.map(() => 5), sunFraction: sun, earthVisible: sun.map((_, h) => earth[h] ?? 0) });
    const p = powerBudget(s, cfg);
    const a = answerFor({ siteName: 'Alpha Ridge', series: s, summary: summarize(s), power: p, startUtc: start, days: sun.length / 24, loadW: cfg.loadW, batteryWh: cfg.batteryWh, best: null });
    return { title: a.title, headline: standHeadline(a.title, 'Alpha Ridge', s, p, start, a.contactHours, a.poweredHours) };
  };

  it('leaves the site’s name to the line above, says the radio straight after the power, and counts the days without power', () => {
    // Sun for 30 hours, then night: the battery lasts 10 hours into it, 2 January 16:00, and the power
    // comes back with the Sun at 3 January 22:00.
    expect(headline([...rep(1, 30), ...rep(0, 40), ...rep(1, 26)])).toEqual({
      title: 'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night',
      headline: `Landing on 1 January: power for ${unbroken('1 day 16 hours')}, no radio contact, then ${unbroken('1 day')} without power`,
    });
    // The power does not come back in the period.
    expect(headline([...rep(1, 20), ...rep(0, 28)]).headline).toBe(`Landing on 1 January: power for ${unbroken('1 day 6 hours')}, no radio contact, then no power to the end of the period`);
    // The period starts in the dark.
    expect(headline([...rep(0, 30), ...rep(1, 18)]).headline).toBe(`Landing on 1 January: power for ${unbroken('10 hours')}, no radio contact, then ${unbroken('1 day')} without power`);
  });
  // A span broken across two lines ("3 days" at the end of one, "4 hours" at the start of the next) reads as
  // two figures: every span of the headline keeps to one line. Only the headline: spanWords keeps plain
  // spaces for every other caller, and the date may still wrap.
  it('keeps each span of the headline on one line, and lets the rest wrap', () => {
    const { headline: h } = headline([...rep(1, 30), ...rep(0, 40), ...rep(1, 26)], CFG, rep(1, 12));
    expect(h).toBe(`Landing on 1 January: power for ${unbroken('1 day 16 hours')}, radio for ${unbroken('12 hours')}, then ${unbroken('1 day')} without power`);
    expect(h).not.toMatch(/\d+ (day|hour)/);
    expect(h.startsWith('Landing on 1 January: ')).toBe(true);
    expect(spanWords(40)).toBe('1 day 16 hours');
  });
  it('keeps the words of every other title but the site’s name', () => {
    // Power all the while, with Earth in view for a day of the two.
    expect(headline(rep(1, 48), CFG, rep(1, 24))).toEqual({ title: 'Landing at Alpha Ridge on 1 January: power for all 2 days', headline: `Landing on 1 January: power for all ${unbroken('2 days')}, radio for ${unbroken('1 day')}` });
    // A panel of 68 W against a 100 W load runs the battery down in 31 hours, with the Sun up.
    const weak = { ...CFG, areaM2: 0.05 };
    expect(headline(rep(1, 48), weak, rep(1, 25))).toEqual({
      title: 'Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight',
      headline: `Landing on 1 January: power for ${unbroken('1 day 7 hours')}, radio for ${unbroken('1 day 1 hour')}, then too little sunlight`,
    });
    // No power from the first hour: no radio to speak of.
    expect(headline([...rep(0, 30), ...rep(1, 18)], { ...CFG, batteryWh: 0 }).headline).toBe('Landing on 1 January: no power, it is night');
    expect(headline(rep(1, 48), { ...weak, batteryWh: 0 }).headline).toBe('Landing on 1 January: too little sunlight from the first hour');
  });
  it('drops the name from a period without sunlight too, and adds no radio verdict to a title that says nothing of the power', () => {
    // The battery's ten hours all have Earth in view: "radio all the while" would read as the whole period.
    expect(headline(rep(0, 48), CFG, rep(1, 48))).toEqual({ title: 'No sunlight at Alpha Ridge in these 2 days', headline: `No sunlight in these ${unbroken('2 days')}` });
  });
  it('drops only the site’s own name', () => {
    const s = series({ sunEl: rep(5, 48), sunFraction: rep(1, 48) });
    const p = powerBudget(s, CFG);
    expect(standHeadline('Landing at Alpha Ridge on 1 January: power for all 2 days', 'Alpha', s, p, start, 0, 48)).toBe(`Landing at Alpha Ridge on 1 January: power for all ${unbroken('2 days')}, no radio contact`);
  });
});

describe('the headline’s radio', () => {
  it('says the radio’s verdict straight after the power’s, before what ends the power', () => {
    expect(radioHeadline('Landing on 1 January: power for 3 days 4 hours, then 16 days without power', 0, 76)).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days without power');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days without power', 12, 40)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, radio for 12 hours, then 2 days without power',
    );
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days without power', 40, 40)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, radio all the while, then 2 days without power',
    );
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight', 25, 31)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, radio for 1 day 1 hour, then too little sunlight',
    );
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then no power to the end of the period', 0, 30)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, no radio contact, then no power to the end of the period',
    );
  });
  it('says it at the end when the power lasts the whole period', () => {
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for all 30 days', 291, 720)).toBe('Landing at Alpha Ridge on 1 January: power for all 30 days, radio for 12 days 3 hours');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for all 30 days', 0, 720)).toBe('Landing at Alpha Ridge on 1 January: power for all 30 days, no radio contact');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for all 30 days', 720, 720)).toBe('Landing at Alpha Ridge on 1 January: power for all 30 days, radio all the while');
  });
  it('leaves the headline as it is when the lander has no power from the landing', () => {
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: no power, it is night', 0, 0)).toBe('Landing at Alpha Ridge on 1 January: no power, it is night');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: too little sunlight from the first hour', 0, 0)).toBe('Landing at Alpha Ridge on 1 January: too little sunlight from the first hour');
  });
  it('leaves a headline that says nothing of the power as it is, with no power to follow', () => {
    // The battery alone carries the lander for its first 10 hours, all with Earth in view.
    expect(radioHeadline('No sunlight in these 30 days', 10, 10)).toBe('No sunlight in these 30 days');
    expect(radioHeadline('No sunlight at Alpha Ridge in these 30 days', 0, 10)).toBe('No sunlight at Alpha Ridge in these 30 days');
  });
});

describe('the better landing day’s button', () => {
  it('says what it does, and the power and the radio from that day to the hour, as the headline and the forecast say them', () => {
    // 12 days 15 hours of power, 3 days 3 hours of it with Earth in view: the home page's forecast says "12 days
    // 15 hours" for this landing, and the button must not say 13 days.
    expect(betterLabel('20 January', 303, 75)).toBe(`Try 20 January instead: power for ${unbroken('12 days 15 hours')}, radio for ${unbroken('3 days 3 hours')}`);
    // A whole period's power, as the page passes it.
    expect(betterLabel('13 January 2028', 720, 720)).toBe(`Try 13 January 2028 instead: power for ${unbroken('30 days')}, radio for ${unbroken('30 days')}`);
    // The page passes the hours with Earth in view as a share of the hours with power, not always whole: they read
    // as the whole hours they were counted in.
    expect(betterLabel('20 January', 303, 303 * (77 / 303))).toBe(`Try 20 January instead: power for ${unbroken('12 days 15 hours')}, radio for ${unbroken('3 days 5 hours')}`);
    expect(betterLabel('20 January', 303, 75.6)).toBe(`Try 20 January instead: power for ${unbroken('12 days 15 hours')}, radio for ${unbroken('3 days 4 hours')}`);
  });
  it('keeps each span on one line, as the headline does, so "hours" never stands alone on the next: the rest may wrap', () => {
    expect(betterLabel('20 January', 303, 77)).toBe('Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours');
  });
  it('gives a stretch shorter than a day in hours', () => {
    expect(betterLabel('2 January', 5, 3)).toBe(`Try 2 January instead: power for ${unbroken('5 hours')}, radio for ${unbroken('3 hours')}`);
    expect(betterLabel('2 January', 30, 1)).toBe(`Try 2 January instead: power for ${unbroken('1 day 6 hours')}, radio for ${unbroken('1 hour')}`);
  });
  it('says so when Earth is never in view in that time', () => {
    expect(betterLabel('20 January', 303, 0)).toBe(`Try 20 January instead: power for ${unbroken('12 days 15 hours')}, no radio contact`);
  });
  it('shortens the better day for the row under the status line: the power alone, the radio left to today’s card', () => {
    expect(betterLabel('20 January', 303, 77, true).replace(/\u00a0/g, ' ')).toBe('Try 20 January instead: power for 12 days 15 hours');
    expect(betterLabel('20 January', 303, 77).replace(/\u00a0/g, ' ')).toBe('Try 20 January instead: power for 12 days 15 hours, radio for 3 days 5 hours');
  });
  it('gives a phone its chip: the day short, the power alone, each span on one line', () => {
    expect(betterChip('20 Jan', 303)).toBe(`Try 20 Jan instead: power for ${unbroken('12 days 15 hours')}`);
    expect(betterChip('2 Feb', 20)).toBe(`Try 2 Feb instead: power for ${unbroken('20 hours')}`);
  });
});

describe('the note on how we know this', () => {
  const nb = '\u00a0';
  const rest = "The Sun and Earth are placed by NASA's tables of the planets' positions, the stars come from a catalogue of 8,404 stars, and Earth is NASA's Blue Marble photograph at its true size (Face Earth zooms in on it). Times are Earth's clock (UTC): a day on the Moon lasts about a month. The forecast counts energy only: whether the lander survives the cold of the night is not worked out. The lander, its solar panel standing upright to catch the low Sun, and the small craters underfoot are drawn, not measured.";
  it('says in plain words where the heights, the shadows, the sky and Earth come from, and what is drawn', () => {
    expect(measuredNote([20, 80, 960], 8404)).toBe(
      `Heights measured from orbit by the laser on NASA's Lunar Reconnaissance Orbiter: 20${nb}m steps near you, 80${nb}m out to 20${nb}km and 960${nb}m out to 125${nb}km. The shadows are worked out from those heights for every hour. ${rest}`,
    );
    expect(measuredNote([80, 960], 8404)).toContain(`Orbiter: 80${nb}m steps near you and 960${nb}m out to 125${nb}km.`);
    expect(measuredNote([960, 960], 8404)).toContain(`Orbiter: 960${nb}m steps out to 125${nb}km.`);
  });

  it('says plainly when there is no detailed ground and the ground is drawn flat', () => {
    expect(measuredNote([], 8404)).toBe(`There are no detailed NASA heights for this site, so the ground here is drawn flat. ${rest}`);
  });

  it('leaves the black sky, the blue night and Earth rising and setting to the lines on why the view looks as it does', () => {
    for (const note of [measuredNote([20, 80, 960], 8404), measuredNote([], 8404)]) {
      expect(note).not.toContain('With no air, the sky is black by day as well as by night; at night only Earth lights the ground, which is why it looks blue.');
      expect(note).not.toContain('Earth stays over the same part of the horizon, rising and sinking a few degrees over the month as the Moon nods.');
    }
  });
});

describe('what to watch for', () => {
  // 30 days from 1 January: the Sun sets at hour 76, the battery runs out at 100, the Sun comes back at 466
  // and the power at 470.
  const hours = 720;
  const lit = (h: number) => h < 76 || h >= 466;
  const s = series({
    sunEl: Array.from({ length: hours }, (_, h) => (h >= 200 && h < 400 ? -0.5 : 0.8)),
    sunFraction: Array.from({ length: hours }, (_, h) => (lit(h) ? 1 : 0)),
  });
  const p = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 100 || h >= 470 ? 1 : 0)) } as unknown as PowerResult;
  // The battery runs out at 80, four hours after the Sun sets: both on 4 January.
  const sameDay = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 80 || h >= 470 ? 1 : 0)) } as unknown as PowerResult;
  // The power comes back at 490, on 21 January, the day after the Sun.
  const late = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 100 || h >= 490 ? 1 : 0)) } as unknown as PowerResult;
  // Earth is in view for hours 200-499.
  const e = series({
    sunEl: Array.from({ length: hours }, () => 1),
    sunFraction: Array.from({ length: hours }, (_, h) => (lit(h) ? 1 : 0)),
    earthVisible: Array.from({ length: hours }, (_, h) => (h >= 200 && h < 500 ? 1 : 0)),
  });
  const start = '2027-01-01T00:00:00';
  // The key moments are flags on the time bar under the card: the line says they can be pressed.
  it('names the next thing that happens, and its day, and what follows within three days', () => {
    expect(watchNext(s, p, start, 10)).toBe(`${WATCH_LEAD} the Sun sets behind the hills on 4 January, and the battery runs out on 5 January.`);
    expect(watchNext(s, p, start, 80)).toBe(`${WATCH_LEAD} the battery runs out on 5 January.`);
    // No power from 5 January to 20 January: 15 days.
    expect(watchNext(s, p, start, 467)).toBe(`${WATCH_LEAD} the power comes back on 20 January, if the lander survives 15 days without power at night, colder than −170 °C.`);
    expect(watchNext(s, null, start, 200)).toBe(`${WATCH_LEAD} the Sun rises on 20 January.`);
  });
  it('starts what to watch with Play and the flags, and has a lead for a phone, where the flags are dots', () => {
    expect(WATCH_LEAD).toBe('Press Play, or a flag on the time bar, to watch:');
    expect(WATCH_LEAD_DOTS).toBe('Press Play, or a dot on the time bar, to watch:');
  });
  it('says the day once when the second thing happens the same day', () => {
    // The Sun comes back at 466 and the power at 470, both on 20 January.
    expect(watchNext(s, p, start, 200)).toBe(`${WATCH_LEAD} the Sun rises on 20 January, and the power with it, if the lander survives 15 days without power at night, colder than −170 °C.`);
    expect(watchNext(s, p, start, 300)).toBe(`${WATCH_LEAD} the Sun rises on 20 January, and the power with it, if the lander survives 15 days without power at night, colder than −170 °C.`);
    expect(watchNext(s, sameDay, start, 10)).toBe(`${WATCH_LEAD} the Sun sets behind the hills on 4 January, and the battery runs out the same day.`);
  });
  it('counts the Sun back with the first part of its disc, as the time bar draws it, so it comes back before the power', () => {
    // Three hours without power from the landing: at least a day.
    const dawn = series({ sunEl: [-0.5, -0.2, 0.1, 0.3], sunFraction: [0, 0, 0.3, 1] });
    const off = { powered: Uint8Array.from([0, 0, 0, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, off, start, 0)).toBe(`${WATCH_LEAD} the Sun rises on 1 January, and the power with it, if the lander survives 1 day without power at night, colder than −170 °C.`);
    // In the same hour, the Sun comes first: the power comes back because of it.
    const same = { powered: Uint8Array.from([0, 0, 1, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, same, start, 0)).toBe(`${WATCH_LEAD} the Sun rises on 1 January, and the power with it, if the lander survives 1 day without power at night, colder than −170 °C.`);
  });
  // "At night", not "a night": night is the one name for the hours without the Sun, whether it set below the
  // horizon or behind the hills, as the time bar's key ("night") and its flag ("Sunset") have it.
  it('says the power comes back only if the lander survives so many days without power at night and that cold, never "a night", and nothing of the kind when it does not come back', () => {
    // The Sun comes back on 20 January and the power on 21 January, 16 days after it ran out: the condition
    // ends the sentence.
    expect(watchNext(s, late, start, 200)).toBe(`${WATCH_LEAD} the Sun rises on 20 January, and the power comes back on 21 January, if the lander survives 16 days without power at night, colder than −170 °C.`);
    expect(watchNext(s, late, start, 470)).toBe(`${WATCH_LEAD} the power comes back on 21 January, if the lander survives 16 days without power at night, colder than −170 °C.`);
    expect(watchNext(s, late, start, 10)).toBe(`${WATCH_LEAD} the Sun sets behind the hills on 4 January, and the battery runs out on 5 January.`);
    // The Sun set behind the hills for the whole stretch without power, still up: night all the same, never "a night".
    const hidden = series({ sunEl: Array.from({ length: hours }, () => 0.8), sunFraction: Array.from({ length: hours }, (_, h) => (lit(h) ? 1 : 0)) });
    for (const h of [10, 80, 200, 467]) expect(watchNext(hidden, late, start, h)).not.toMatch(/\ba night\b/);
  });
  it('says how long the lander is without power, and nothing of the dark, when the battery ran down with the Sun still up', () => {
    // Too little sunlight from hour 20; the battery runs out at 30, on 2 January, and the power comes back
    // with a stronger Sun at 60, on 3 January.
    const weak = series({ sunEl: Array.from({ length: 96 }, () => 1), sunFraction: Array.from({ length: 96 }, (_, h) => (h >= 20 && h < 60 ? 0.05 : 1)) });
    const dim = { powered: Uint8Array.from({ length: 96 }, (_, h) => (h < 30 || h >= 60 ? 1 : 0)) } as unknown as PowerResult;
    expect(watchNext(weak, dim, start, 40)).toBe(`${WATCH_LEAD} the power comes back on 3 January, if the lander survives 1 day without power.`);
  });
  it('keeps the condition with the power when the Sun goes after it, so it does not read as a condition on the Sun', () => {
    // The Sun is up from hour 1 to 4; the power comes back at 3, and the Sun sets behind the hills at 5.
    const brief = series({ sunEl: [1, 1, 1, 1, 1, 1, 1, 1], sunFraction: [0, 1, 1, 1, 1, 0, 0, 0] });
    const back = { powered: Uint8Array.from([0, 0, 0, 1, 1, 1, 0, 0]) } as unknown as PowerResult;
    expect(watchNext(brief, back, start, 1)).toBe(`${WATCH_LEAD} the power comes back on 1 January, if the lander survives 1 day without power at night, colder than −170 °C, and the Sun sets behind the hills the same day.`);
  });

  it('says the Sun sets below the horizon when it goes down, and sets behind the hills while it is still up', () => {
    const night = series({ sunEl: [1, 1, -0.4, -0.4], sunFraction: [1, 1, 0, 0] });
    expect(watchNext(night, null, start, 0)).toBe(`${WATCH_LEAD} the Sun sets below the horizon on 1 January.`);
    // A Sun still above the level horizon sets behind the hills.
    const hills = series({ sunEl: [1, 1, 0.4, 0.4], sunFraction: [1, 1, 0, 0] });
    expect(watchNext(hills, null, start, 0)).toBe(`${WATCH_LEAD} the Sun sets behind the hills on 1 January.`);
  });
  // In short parts a student can take one at a time: where you stand, then what each thing drawn comes from.
  it('says where you stand, near which pole, and what is measured and what is drawn, at the top of the card, and under More only the latitude and the site’s own note', () => {
    const site = { name: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, blurb: 'A ridge on a crater rim, 52 km from the pole' };
    expect(standingLine(site, 'de Gerlache Rim 2', 'top')).toBe("Standing at de Gerlache Rim 2, near the Moon's south pole. Hills: NASA height data. Small craters and rocks: added to look real.");
    // Under More, the latitude and the site's own note: two readers found the line repeating the card's top line.
    expect(standingLine(site, 'de Gerlache Rim 2', 'more')).toBe('de Gerlache Rim 2 lies at 88.3° S. A ridge on a crater rim, 52 km from the pole.');
    // Nothing the top line says already: neither where you stand nor what is measured and what is drawn.
    expect(standingLine(site, 'de Gerlache Rim 2', 'more')).not.toMatch(/Standing|NASA|drawn|photograph/i);
    expect(standingLine({ lat: 85 }, 'Peary Rim', 'top')).toBe("Standing at Peary Rim, near the Moon's north pole. Hills: NASA height data. Small craters and rocks: added to look real.");
  });
  it('names the pole from 80° on, and no pole between', () => {
    expect(standingLine({ lat: 80 }, 'Alpha Ridge', 'top')).toMatch(/^Standing at Alpha Ridge, near the Moon's north pole\. /);
    expect(standingLine({ lat: -80 }, 'Alpha Ridge', 'top')).toMatch(/^Standing at Alpha Ridge, near the Moon's south pole\. /);
    expect(standingLine({ lat: -79.9 }, 'Alpha Ridge', 'top')).toBe('Standing at Alpha Ridge. Hills: NASA height data. Small craters and rocks: added to look real.');
    const mare = { name: 'Blue Ghost', lat: 18.56, lon: 61.81 };
    // A site without a note of its own: the latitude alone.
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'more')).toBe('Blue Ghost Mission 1 lies at 18.6° N.');
  });
  // Blue Ghost's site has no NASA heights: its ground is drawn flat, under a flat horizon.
  it('says the ground is drawn flat where there are no NASA heights, and claims no hills', () => {
    const mare = { name: 'Blue Ghost', lat: 18.56, lon: 61.81 };
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'top', true)).toBe('Standing at Blue Ghost Mission 1. Ground drawn flat: no NASA heights here. Small craters and rocks: added to look real.');
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'top', true)).not.toMatch(/Hills/);
    // The line under More says nothing of the ground.
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'more', true)).toBe(standingLine(mare, 'Blue Ghost Mission 1', 'more'));
  });

  it('says why the Sun stays low near a pole, and nothing elsewhere', () => {
    expect(poleLine(-88.28)).toBe("Near the Moon's south pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon (two degrees is about a thumb's width at arm's length), so behind a low hill it can stay set for days.");
    expect(poleLine(80)).toBe("Near the Moon's north pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon (two degrees is about a thumb's width at arm's length), so behind a low hill it can stay set for days.");
    expect(poleLine(-80)).toBe(poleLine(-88.28));
    expect(poleLine(79.9)).toBeNull();
    expect(poleLine(18.56)).toBeNull();
  });

  it('says the first day the lander has both power and a view of Earth, when it does not from the landing', () => {
    // Earth is in view for hours 200-499; the power is on before 100 and from 470.
    expect(radioNext(e, p, start)).toBe('The first day the lander has both power and a view of Earth is 20 January.');
    const always = series({ sunEl: [1, 1], sunFraction: [1, 1], earthVisible: [1, 1] });
    expect(radioNext(always, { powered: Uint8Array.from([1, 1]) } as unknown as PowerResult, start)).toBeNull();
    const never = series({ sunEl: [1, 1], sunFraction: [1, 1], earthVisible: [0, 0] });
    expect(radioNext(never, { powered: Uint8Array.from([1, 1]) } as unknown as PowerResult, start)).toBe('The lander never has both power and a view of Earth in this period.');
  });

  it('lists the key moments of the period, in order, each once, each with its kind', () => {
    // The Sun leaves the view on 4 January and the battery runs out on 5 January: two moments. The Sun is
    // still 1° up as it sets behind the hills: a sunset all the same. The Sun rises at 466 and the power comes
    // back at 470, both on 20 January: one moment, at the Sun's hour.
    expect(keyMoments(e, p, start)).toEqual([
      { kind: 'sunset', label: 'Sunset', hour: 76, day: '4 Jan' },
      { kind: 'battery-out', label: 'Battery runs out', hour: 100, day: '5 Jan' },
      { kind: 'earth-in', label: 'Earth rises', hour: 200, day: '9 Jan' },
      { kind: 'sun-power-back', label: 'Sunrise', hour: 466, day: '20 Jan' },
      { kind: 'earth-out', label: 'Earth sets', hour: 500, day: '21 Jan' },
    ]);
  });

  // The power comes back only if the lander lived through the night, which the forecast does not work out:
  // the flag claims only the Sun, and its kind (and so its caption) still knows the power comes with it.
  it('labels the Sun and the power coming back together after a power cut "Sunrise", keeping its kind', () => {
    const back = keyMoments(e, p, start).find((m) => m.hour === 466)!;
    expect(back).toEqual({ kind: 'sun-power-back', label: 'Sunrise', hour: 466, day: '20 Jan' });
    expect(back.label).not.toMatch(/power/);
    expect(momentCaption(back.kind, e, back.hour)).toMatch(/^Sunrise, and with it the power, if the lander survived the cold\./);
  });

  it('makes one moment of the Sun leaving the view and the battery running out on the same day', () => {
    expect(keyMoments(e, sameDay, start)).toEqual([
      { kind: 'sunset-power-off', label: 'Sunset and power off', hour: 76, day: '4 Jan' },
      { kind: 'earth-in', label: 'Earth rises', hour: 200, day: '9 Jan' },
      { kind: 'sun-power-back', label: 'Sunrise', hour: 466, day: '20 Jan' },
      { kind: 'earth-out', label: 'Earth sets', hour: 500, day: '21 Jan' },
    ]);
  });

  it('calls it a sunset whether the Sun goes below the level horizon or behind the hills while it is still up', () => {
    // At the hour the Sun leaves the view: below the level horizon, on it, or above it.
    const at = (el: number, powered: number[]) => keyMoments(series({ sunEl: [1, el], sunFraction: [1, 0] }), { powered: Uint8Array.from(powered) } as unknown as PowerResult, start);
    expect(at(-0.1, [1, 1])).toEqual([{ kind: 'sunset', label: 'Sunset', hour: 1, day: '1 Jan' }]);
    expect(at(0, [1, 1])).toEqual([{ kind: 'sunset', label: 'Sunset', hour: 1, day: '1 Jan' }]);
    expect(at(0.4, [1, 1])).toEqual([{ kind: 'sunset', label: 'Sunset', hour: 1, day: '1 Jan' }]);
    // And so when the power goes with it.
    expect(at(-0.1, [1, 0])).toEqual([{ kind: 'sunset-power-off', label: 'Sunset and power off', hour: 1, day: '1 Jan' }]);
    expect(at(0.4, [1, 0])).toEqual([{ kind: 'sunset-power-off', label: 'Sunset and power off', hour: 1, day: '1 Jan' }]);
  });

  it('keeps the Sun and the power apart on different days, and when the power goes before the Sun', () => {
    // The power comes back at 490, on 21 January, the day after the Sun.
    expect(keyMoments(e, late, start)).toEqual([
      { kind: 'sunset', label: 'Sunset', hour: 76, day: '4 Jan' },
      { kind: 'battery-out', label: 'Battery runs out', hour: 100, day: '5 Jan' },
      { kind: 'earth-in', label: 'Earth rises', hour: 200, day: '9 Jan' },
      { kind: 'sun-back', label: 'Sunrise', hour: 466, day: '20 Jan' },
      { kind: 'power-back', label: 'Power back', hour: 490, day: '21 Jan' },
      { kind: 'earth-out', label: 'Earth sets', hour: 500, day: '21 Jan' },
    ]);
    // Too little sunlight: the battery runs out at 73, three hours before the Sun leaves the view the same
    // day. The Sun going did not cut the power, so the two stay apart.
    const low = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 73 || h >= 490 ? 1 : 0)) } as unknown as PowerResult;
    expect(keyMoments(e, low, start).slice(0, 2)).toEqual([
      { kind: 'battery-out', label: 'Battery runs out', hour: 73, day: '4 Jan' },
      { kind: 'sunset', label: 'Sunset', hour: 76, day: '4 Jan' },
    ]);
  });

  it('has a caption for every kind of key moment', () => {
    const moments = [p, sameDay, late].flatMap((pw) => keyMoments(e, pw, start));
    expect(new Set(moments.map((m) => m.kind))).toEqual(new Set(['sunset', 'battery-out', 'earth-in', 'earth-out', 'sun-power-back', 'sunset-power-off', 'sun-back', 'power-back']));
    expect(moments.filter((m) => momentCaption(m.kind, e, m.hour) === '')).toEqual([]);
  });

  it('falls back to the light on the ground when nothing more happens in the period', () => {
    expect(watchNext(s, p, start, 600)).toBe('Press Play to watch the light move across the ground.');
  });
});

describe('the caption for a key moment', () => {
  it('marks Earth setting too, the first time Earth leaves the view after the landing: the hero month’s 23 January', () => {
    const h = hero();
    const out = keyMoments(h.series, h.power, h.startUtc).find((m) => m.kind === 'earth-out');
    expect(out).toEqual({ kind: 'earth-out', label: 'Earth sets', hour: 543, day: '23 Jan' });
    expect(momentCaption('earth-out', h.series, 543, h.site.lat)).toMatch(/^Earth sets (behind the hills|below the horizon): the Moon's slight wobble lowers it\. No radio until it rises again\.$/);
    expect(momentCaption('earth-out', h.series, 543, h.site.lat).length).toBeLessThanOrEqual(112);
  });

  // The Sun sets at hour 1: behind the hills, or below the horizon.
  const behind = series({ sunEl: [1, 0.4], sunFraction: [1, 0] });
  const below = series({ sunEl: [0.2, -0.3], sunFraction: [1, 0] });
  // The Sun is up, with Earth out of view or in view.
  const sun = series({ sunEl: [1], sunFraction: [1], earthEl: [-3], earthVisible: [0] });
  const both = series({ sunEl: [1], sunFraction: [1], earthEl: [4], earthVisible: [1] });

  // A Sun just gone reads as dusk unless the caption says why the site is dark at once; a caption says it short.
  const noTwilight = ' No air, so no twilight.';
  // What lights the ground when the battery runs out with the Sun gone: Earth's light alone, or nothing, the
  // picture brightened so you can see it.
  const earthlight = ' Only Earthlight lights the ground; the picture is brightened so you can see it.';
  const brightened = ' With no Sun or Earth in sight, the picture is brightened so you can see it.';

  it('says the Sun sets behind the hills, or that it sinks below the horizon, that near the pole it never climbs high, and that there is no twilight', () => {
    expect(momentCaption('sunset', behind, 1)).toBe(`Sunset behind the hills: near the pole the Sun never climbs more than a few degrees.${noTwilight}`);
    expect(momentCaption('sunset', below, 1)).toBe(`Sunset: the Sun sinks below the horizon; near the pole it never climbs high.${noTwilight}`);
  });
  it('leaves the pole out at a site far from it, when given the site’s latitude', () => {
    expect(momentCaption('sunset', below, 1, 18.56)).toBe(`Sunset: the Sun sinks below the horizon.${noTwilight}`);
    expect(momentCaption('sunset', behind, 1, 18.56)).toBe(`Sunset behind the hills: the Sun is still above the horizon.${noTwilight}`);
    expect(momentCaption('sunset', behind, 1, -88.28)).toBe(`Sunset behind the hills: near the pole the Sun never climbs more than a few degrees.${noTwilight}`);
  });
  // Two readers took the sentence on higher ground farther off, still in sunlight, for a claim the view did not
  // show: when the battery runs out the view is turned to the lander, with no such ground in sight. The line in
  // the dark leaves it to the card's lines on why too, to keep to two lines.
  it('never says higher ground farther off still catches the Sun, however low the Sun is, in a caption or the line in the dark; the lines on why still do', () => {
    const kinds: MomentKind[] = ['sunset', 'sunset-power-off', 'battery-out', 'earth-in', 'sun-back', 'sun-power-back', 'power-back'];
    for (const el of [1.2, 0.4, 0, -0.3, -1.9, -2, -5]) {
      for (const seen of [0, 1]) {
        const gone = series({ sunEl: [1, el], sunFraction: [1, 0], earthEl: [4, 4], earthVisible: [seen, seen] });
        for (const kind of kinds) for (const lat of [undefined, -88.28, 18.56]) expect(momentCaption(kind, gone, 1, lat)).not.toMatch(/farther off|catches the Sun/);
      }
    }
    expect(viewCaption('dark', -88.28)).not.toMatch(/farther off|catches the Sun/);
    expect(whyLines(-88.28, series({ sunEl: [-1.9], sunFraction: [0] }), 0)).toContain('The Sun is just below the horizon here, but higher ground farther off still catches its light.');
  });
  it('says the lander’s power goes with the Sun, set behind the hills or below the horizon, and that there is no twilight', () => {
    expect(momentCaption('sunset-power-off', behind, 1)).toBe(`Sunset behind the hills, and the lander's power goes with it.${noTwilight}`);
    expect(momentCaption('sunset-power-off', below, 1)).toBe(`Sunset below the horizon, and the lander's power goes with it.${noTwilight}`);
    expect(momentCaption('sunset-power-off', series({ sunEl: [0.2, -2.5], sunFraction: [1, 0] }), 1)).toBe(`Sunset below the horizon, and the lander's power goes with it.${noTwilight}`);
  });
  // A teacher found five lines too long for students: every caption over the view keeps to three sentences.
  it('keeps every caption for a key moment to three sentences at most, near a pole and far from it', () => {
    const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    // The Sun gone with Earth in view.
    const earthUp = series({ sunEl: [1, 0.4], sunFraction: [1, 0], earthEl: [4, 4], earthVisible: [1, 1] });
    const cases = [behind, below, earthUp, series({ sunEl: [0.2, -2.5], sunFraction: [1, 0] }), series({ sunEl: [1, 1], sunFraction: [1, 0.4] })];
    const kinds: MomentKind[] = ['sunset', 'sunset-power-off', 'battery-out', 'earth-in', 'sun-back', 'sun-power-back', 'power-back'];
    for (const s of cases) for (const kind of kinds) for (const lat of [undefined, -88.28, 18.56]) expect(sentences(momentCaption(kind, s, 1, lat))).toBeLessThanOrEqual(3);
    // The Sun gone, and the battery out at night with what lights the ground: two sentences each.
    for (const s of [behind, earthUp]) for (const kind of ['sunset', 'battery-out'] as const) expect(sentences(momentCaption(kind, s, 1))).toBe(2);
  });
  // When the battery runs out the view turns to the lander, and still shows the ground about it with the Sun
  // gone: two readers asked what lights it. "At night", as the line on what to watch next says it: the Sun
  // may still be up, set behind the hills, as its label says then.
  it('says why the battery runs out: at night, or with the Sun up but too low for the panel; and at night, what lights the ground', () => {
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0] }), 0)).toBe(`The battery runs out at night.${brightened}`);
    expect(momentCaption('battery-out', series({ sunEl: [-1], sunFraction: [0] }), 0)).toBe(`The battery runs out at night.${brightened}`);
    expect(momentCaption('battery-out', series({ sunEl: [-5], sunFraction: [0] }), 0)).toBe(`The battery runs out at night.${brightened}`);
    // With Earth in view, its light alone.
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0], earthEl: [4], earthVisible: [1] }), 0)).toBe(`The battery runs out at night.${earthlight}`);
    expect(momentCaption('battery-out', series({ sunEl: [-5], sunFraction: [0], earthEl: [4], earthVisible: [1] }), 0)).toBe(`The battery runs out at night.${earthlight}`);
    // Earth above the level horizon but behind the hills is not in view: it lights nothing here.
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0], earthEl: [2], earthVisible: [0] }), 0)).toBe(`The battery runs out at night.${brightened}`);
    // Nothing says the Sun is not up: behind the hills it is.
    expect(brightened).not.toMatch(/\bup\b/);
    // As the line over the view at night says it, with Earth in view and with neither in view: the picture
    // brightened so you can see it, never "like a long exposure" (read D2-2).
    for (const text of [earthlight, brightened, viewCaption('earthlight', -88.28), viewCaption('dark', -88.28)]) {
      expect(text).toMatch(/the picture is brightened so you can see it\./);
      expect(text).not.toMatch(/exposure/);
    }
    // With the Sun in view the site itself is lit: nothing to say about what lights the ground.
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0.4] }), 0)).toBe('The battery runs out: the Sun is up, but too low for the panel to keep the lander going.');
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0.4], earthEl: [4], earthVisible: [1] }), 0)).toBe('The battery runs out: the Sun is up, but too low for the panel to keep the lander going.');
  });
  it('says why Earth rises', () => {
    expect(momentCaption('earth-in', both, 0)).toBe("Earth rises over the hills: the Moon's slight wobble lifts it into view for about two weeks a month.");
  });
  it('says the Sun rises, and that with Earth in view too a working lander could radio home', () => {
    expect(momentCaption('sun-back', sun, 0)).toBe('Sunrise over the hills.');
    expect(momentCaption('sun-back', both, 0)).toBe('Sunrise over the hills. With Earth in view, a working lander could radio home.');
  });
  // The flag says only "Sunrise": the power needs the lander to have lived through the cold of the night.
  it('says the Sun rises, and the power with it if the lander survived the cold, and that with Earth in view it could radio home', () => {
    expect(momentCaption('sun-power-back', sun, 0)).toBe('Sunrise, and with it the power, if the lander survived the cold.');
    expect(momentCaption('sun-power-back', both, 0)).toBe('Sunrise, and with it the power, if the lander survived the cold. Earth is in view: it could radio home.');
  });
  it('says the panel makes enough power again', () => {
    expect(momentCaption('power-back', sun, 0)).toBe('The panel makes enough power again.');
    expect(momentCaption('power-back', both, 0)).toBe('The panel makes enough power again.');
  });
  // The captions go by the moment's kind, so a label's words can change freely: a label is no kind.
  it('says nothing for anything but a kind, labels included', () => {
    expect(momentCaption('Sunset' as MomentKind, behind, 1)).toBe('');
    expect(momentCaption('Battery runs out' as MomentKind, series({ sunEl: [1], sunFraction: [0] }), 0)).toBe('');
    expect(momentCaption('landing' as MomentKind, both, 0)).toBe('');
  });
});

describe('the line over the view', () => {
  it('says why Earth barely moves, after Face Earth, and near a pole why it still rises and sets', () => {
    const near = "Earth barely moves in the Moon's sky; only the Moon's slight wobble makes it rise or set.";
    const far = "Earth barely moves in the Moon's sky: the Moon keeps one face towards it.";
    expect(viewCaption('earth', -88.28)).toBe(near);
    expect(viewCaption('earth', 85)).toBe(near);
    expect(viewCaption('earth', -80)).toBe(near);
    expect(viewCaption('earth', 79.9)).toBe(far);
    expect(viewCaption('earth', 18.56)).toBe(far);
  });
  // By day the view, like a camera set for the sunlit ground, shows no stars until it looks up, so the caption
  // says why they show there: with no air the sky is black, and away from the glare the stars show. Why
  // Apollo's photos show none is left to the card's lines on why, to keep to two lines.
  it('says the sky is black even by day and that away from the glare the stars show, after Look up, and from a southern site first which way the view turned', () => {
    const why = 'With no air the sky is black even by day; away from the glare, the stars show.';
    // From a southern site Look up turns towards the Southern Cross: the caption says so before it says why.
    expect(viewCaption('up', -88.28)).toBe(`Towards the Southern Cross. ${why}`);
    expect(viewCaption('up', 18.56)).toBe(why);
    expect(viewCaption('up', 85)).toBe(why);
    // Nothing that blames eyes for Apollo's photos.
    expect(why).not.toMatch(/dazzled|eyes/);
  });
  it('says what lights the ground when night falls with Earth in view, and why it is blue', () => {
    expect(viewCaption('earthlight', -88.28)).toBe('Earthlight, sunlight bounced off Earth, tints this ground blue; the picture is brightened so you can see it.');
    expect(viewCaption('earthlight', 18.56)).toBe(viewCaption('earthlight', -88.28));
  });
  // Both readers of read D1 found grey ground under "tints it blue" when Earth was a thin crescent.
  it('says a thin crescent Earth gives the ground little light, in two lines at most', () => {
    expect(viewCaption('faint', -88.28)).toBe('A thin crescent Earth gives this ground little light; the picture is brightened so you can see it.');
    expect(viewCaption('faint', -88.28).length).toBeLessThanOrEqual(112);
  });
  // A Sun just gone reads as dusk unless something says there is no twilight, and a brightened view must not
  // pass for what eyes would see. Far peaks still in sunlight over the dark site are left to the lines on why.
  it('says neither the Sun nor Earth lights the ground, that the picture is brightened so you can see it, and that there is no twilight', () => {
    const dark = 'Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight.';
    expect(viewCaption('dark', -88.28)).toBe(dark);
    expect(viewCaption('dark', 18.56)).toBe(dark);
  });
  it('says the picture is brightened so you can see it, never "long exposure" (read D2-2)', () => {
    expect(viewCaption('dark', -88.28)).toBe('Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight.');
    expect(viewCaption('faint', -88.28)).toBe('A thin crescent Earth gives this ground little light; the picture is brightened so you can see it.');
    expect(viewCaption('earthlight', -88.28)).toBe('Earthlight, sunlight bounced off Earth, tints this ground blue; the picture is brightened so you can see it.');
    for (const kind of ['dark', 'faint', 'earthlight'] as const) expect(viewCaption(kind, -88.28)).not.toMatch(/exposure/);
  });
  it('takes no Sun height, for "dark" or any other kind', () => {
    // @ts-expect-error the line in the dark no longer says whether higher ground still catches the Sun
    expect(viewCaption('dark', -88.28, -1.9)).toBe(viewCaption('dark', -88.28));
    // @ts-expect-error no other kind takes it
    expect(viewCaption('up', 18.56, 1.2)).toBe(viewCaption('up', 18.56));
  });
  // The view sees the back of the panel when the lander's cells face the Sun away from you: one caption says
  // both, in two lines.
  it('says why the lander’s solar panel stands upright, after Face the lander, far from the poles that it is drawn as built for them, and why the view sees the panel’s back', () => {
    const near = 'Its solar panel stands upright: here the Sun never climbs more than a few degrees.';
    const nearBack = 'Its panel stands upright for a Sun this low; you see its back, as its cells face the Sun.';
    for (const lat of [-88.28, 85, -80]) {
      expect(landerCaption(lat, false)).toBe(near);
      expect(landerCaption(lat, true)).toBe(nearBack);
    }
    const far = 'The lander is drawn as built for the poles, its solar panel upright for a low Sun.';
    const farBack = "Drawn as built for the poles; you see its panel's back, as its cells face the Sun.";
    for (const lat of [79.9, 18.56]) {
      expect(landerCaption(lat, false)).toBe(far);
      expect(landerCaption(lat, true)).toBe(farBack);
    }
    // The line for "lander" is the one for the panel's face.
    for (const lat of [-88.28, 18.56]) expect(viewCaption('lander', lat)).toBe(landerCaption(lat, false));
  });
});

describe('captions of two lines, the whys where they happen, and the battery’s level', () => {
  const START = '2027-01-01T00:00:00';
  // An hour with the Sun 1.2° up but behind the hills, and Earth below the horizon.
  const hidden = () => series({ sunEl: [1.2], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
  // A 2000 Wh battery's walk from full to empty, an hour a step: power for four hours, then none.
  const power = () => ({ powered: Uint8Array.from([1, 1, 1, 1, 0]), energyWh: Float64Array.from([2000, 1500, 1000, 500, 0]), firstBrownoutHour: 4 }) as unknown as PowerResult;

  // Both readers of read 12 asked for captions of two lines at most: the caption's plate holds about 58
  // characters a line.
  it('keeps every caption to two lines on a wide screen: 112 characters at most', () => {
    const kinds = ['sunset', 'sun-back', 'battery-out', 'power-back', 'earth-in', 'sunset-power-off', 'sun-power-back'] as const;
    const s = (sunEl: number, frac: number, earth: number) => ({ ...series(), sunEl: Float64Array.from([sunEl]), sunFraction: Float64Array.from([frac]), earthVisible: Uint8Array.from([earth]) }) as Series;
    for (const kind of kinds) for (const [el, f, e] of [[1, 0, 0], [-1, 0, 1], [2, 0.5, 1]] as const) for (const lat of [-88.3, 18.6]) expect(momentCaption(kind, s(el, f, e), 0, lat).length, `${kind} ${el} ${f} ${e} ${lat}`).toBeLessThanOrEqual(112);
    for (const kind of ['earth', 'up', 'earthlight', 'lander'] as const) for (const lat of [-88.3, 18.6]) expect(viewCaption(kind, lat).length).toBeLessThanOrEqual(112);
    expect(viewCaption('dark', -88.3).length).toBeLessThanOrEqual(112);
    for (const back of [true, false]) for (const lat of [-88.3, 18.6]) expect(landerCaption(lat, back).length).toBeLessThanOrEqual(112);
  });

  // A reader asked for the lack of twilight and Earth's rise to be explained where they happen, not only under More.
  it('says why where it happens: no twilight when the Sun goes, Earth rising by the Moon’s rocking', () => {
    expect(momentCaption('sunset', hidden(), 0, -88.3)).toMatch(/No air, so no twilight\.$/);
    expect(momentCaption('earth-in', hidden(), 0, -88.3)).toMatch(/wobble lifts it into view/);
  });

  // A reader asked for the battery's level in the view, as on the forecast page; a percentage keeps its sign on
  // its line, as pct0 writes it.
  it('gives the battery’s level while the lander has power', () => {
    const p = power(); // a walk that runs from full to empty over the test series
    expect(statusLine(series(), p, START, 0, 2000).text).toMatch(/^Power on, battery 100\u00a0%\./);
  });
  it('sets the level after the power, and gives none while the lander is off or without the battery’s size', () => {
    const s = series({ sunEl: [1, 1, 1, 1, 1] });
    expect(statusLine(s, power(), START, 1, 2000)).toEqual({ on: true, tone: 'power', text: 'Power on, battery 75\u00a0%. No radio: Earth is behind a hill.' });
    const seen = series({ sunEl: [1, 1, 1, 1, 1], earthEl: [4, 4, 4, 4, 4], earthVisible: [1, 1, 1, 1, 1] });
    expect(statusLine(seen, power(), START, 3, 2000)).toEqual({ on: true, tone: 'radio', text: 'Power on, battery 25\u00a0%. Radio contact: Earth is in view.' });
    // Off: when the battery ran out, as before.
    expect(statusLine(s, power(), START, 4, 2000).text).toBe('Power off: the battery ran out on 1 January. Power does not come back in this period.');
    // Without the battery's size, or with none, no level.
    expect(statusLine(s, power(), START, 1).text).toBe('Power on. No radio: Earth is behind a hill.');
    expect(statusLine(s, power(), START, 1, 0).text).toBe('Power on. No radio: Earth is behind a hill.');
  });
  it('gives the level after a power cut beside the condition', () => {
    const back = { powered: Uint8Array.from([1, 0, 0, 1]), energyWh: Float64Array.from([2000, 0, 0, 800]), firstBrownoutHour: 1 } as unknown as PowerResult;
    expect(statusLine(series({ sunEl: [1, 1, 1, 1] }), back, START, 3, 2000).text).toBe('Power on again since 1 January, if the lander survived the night; battery 40\u00a0%. No radio: Earth is behind a hill.');
    // A battery run down by day, the Sun still up: no night to survive, only the time without power. Short either way,
    // so the line stays within a phone's room (the final review found the long form five lines tall there).
    const day = series({ sunEl: [1, 1, 1, 1], sunFraction: [1, 1, 1, 1] });
    expect(statusLine(day, back, START, 3, 2000).text).toBe('Power on again since 1 January, if the lander survived without power; battery 40\u00a0%. No radio: Earth is behind a hill.');
  });
});

describe('the label on your own shadow', () => {
  // Up a slope the ground rises to meet the shadow and shortens it; down a slope it falls away and stretches
  // it. The length on level ground is the one a reader can check the Sun's height from.
  it('says how long your shadow is on this ground, and how long on level ground when the slope changes it by a tenth or more', () => {
    expect(shadowWords(30, 42)).toBe('Your shadow, about 30 m long up this slope\n(about 42 m on level ground; you are 1.8 m tall)');
    expect(shadowWords(55.4, 42.2)).toBe('Your shadow, about 55 m long down this slope\n(about 42 m on level ground; you are 1.8 m tall)');
    // A tenth exactly, either way.
    expect(shadowWords(36, 40)).toBe('Your shadow, about 36 m long up this slope\n(about 40 m on level ground; you are 1.8 m tall)');
    expect(shadowWords(44, 40)).toBe('Your shadow, about 44 m long down this slope\n(about 40 m on level ground; you are 1.8 m tall)');
    expect(shadowWords(9.2, 42)).toBe('Your shadow, about 9 m long up this slope\n(about 42 m on level ground; you are 1.8 m tall)');
  });
  it('gives the length alone when the slope changes it by less than a tenth', () => {
    expect(shadowWords(42, 42)).toBe('Your shadow, about 42 m long\n(you are 1.8 m tall)');
    expect(shadowWords(51.5, 51.5)).toBe('Your shadow, about 52 m long\n(you are 1.8 m tall)');
    expect(shadowWords(38.2, 42)).toBe('Your shadow, about 38 m long\n(you are 1.8 m tall)');
    expect(shadowWords(45.8, 42)).toBe('Your shadow, about 46 m long\n(you are 1.8 m tall)');
  });
  it('never sets two lengths against each other that read the same in whole metres', () => {
    expect(shadowWords(2.6, 3.4)).toBe('Your shadow, about 3 m long\n(you are 1.8 m tall)');
  });
  // The Sun's label rounds its height: at 2.46° it reads "2.5° up", and a reader who works out 1.8 / tan 2.5°
  // gets 41 m against the 42 m shown. Each length is "about" so, never a figure to check to the metre.
  it('says each length is about so many metres, as the Sun’s height in its label is rounded', () => {
    const sunAt = (deg: number) => 1.8 / Math.tan((deg * Math.PI) / 180);
    expect(Math.round(sunAt(2.5))).toBe(41);
    expect(shadowWords(sunAt(2.463), sunAt(2.463))).toBe('Your shadow, about 42 m long\n(you are 1.8 m tall)');
    for (const text of [shadowWords(42, 42), shadowWords(30, 42)]) expect(text.match(/\d+ m\b(?! tall)/g)!.length).toBe(text.match(/about \d+ m\b/g)!.length);
  });
});

describe('the bright stars’ names', () => {
  it('adds the constellation to a bright star whose name alone means nothing to a student', () => {
    expect(['Atria', 'Miaplacidus', 'Canopus', 'Achernar', 'Peacock', 'Shaula', 'Antares', 'Fomalhaut'].map(starLabel)).toEqual([
      'Atria, Southern Triangle',
      'Miaplacidus, Carina',
      'Canopus, Carina',
      'Achernar, Eridanus',
      'Peacock, Pavo',
      'Shaula, Scorpius',
      'Antares, Scorpius',
      'Fomalhaut, Southern Fish',
    ]);
  });
  // The caption after Look up names the cross, and its pointers lead the eye to it.
  it('keeps the plain names of the Southern Cross’s four stars and of its pointers', () => {
    for (const name of ['Acrux', 'Mimosa', 'Gacrux', 'Imai', 'Alpha Centauri', 'Hadar']) expect(starLabel(name)).toBe(name);
  });
  // One style throughout: a one-word Latin name as English speakers use it, a two-word one in English.
  it('gives every other star the app names its IAU constellation, a two-word Latin name in its English form', () => {
    // The committed copy, as file-loaders reads the catalogue: sync-local only mirrors it into web/public/data.
    const names = readJson<{ names: { name: string }[] }>('data', 'sky', 'star_names.json').names.map((n) => n.name);
    expect(Object.fromEntries(names.map((n) => [n, starLabel(n)]))).toEqual({
      Sirius: 'Sirius, Great Dog',
      Canopus: 'Canopus, Carina',
      Arcturus: 'Arcturus, Boötes',
      'Alpha Centauri': 'Alpha Centauri',
      Vega: 'Vega, Lyra',
      Capella: 'Capella, Auriga',
      Rigel: 'Rigel, Orion',
      Procyon: 'Procyon, Little Dog',
      Achernar: 'Achernar, Eridanus',
      Betelgeuse: 'Betelgeuse, Orion',
      Hadar: 'Hadar',
      Altair: 'Altair, Aquila',
      Aldebaran: 'Aldebaran, Taurus',
      Antares: 'Antares, Scorpius',
      Spica: 'Spica, Virgo',
      Pollux: 'Pollux, Gemini',
      Fomalhaut: 'Fomalhaut, Southern Fish',
      Mimosa: 'Mimosa',
      Deneb: 'Deneb, Cygnus',
      Acrux: 'Acrux',
      Regulus: 'Regulus, Leo',
      Adhara: 'Adhara, Great Dog',
      Gacrux: 'Gacrux',
      Shaula: 'Shaula, Scorpius',
      Miaplacidus: 'Miaplacidus, Carina',
      Alnair: 'Alnair, Grus',
      Avior: 'Avior, Carina',
      Atria: 'Atria, Southern Triangle',
      Peacock: 'Peacock, Pavo',
      Polaris: 'Polaris, Little Bear',
      Imai: 'Imai',
    });
  });
  it('leaves a name it does not know as it is, the Southern Cross’s own included', () => {
    expect(starLabel('Southern Cross')).toBe('Southern Cross');
    expect(starLabel('constructor')).toBe('constructor');
  });
});

describe('the stand view’s words on real data', () => {
  it('reads de Gerlache Rim 2 in January 2027 the way the page shows it', () => {
    const site = sites.find((x) => x.id === 'de_gerlache_rim_2')!;
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const s = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 30 * 24);
    const p = powerBudget(s, DEFAULT_POWER);
    const start = '2027-01-01T00:00:00';
    // The battery runs out on 4 January at 04:00 and the power comes back with the Sun on 20 January at
    // 10:00: 16 days without power, so 1 January, 3 days 4 hours and 16 days bring you to 20 January, and
    // the flags for the battery (4 January) and the power back (20 January) are 16 days apart too.
    expect(nightHeadline('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night', s, p, start)).toBe('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then 16 days without power');
    // The headline from the verdict, as the page builds it: Earth stays below the horizon until 10 January, so
    // the three days with power have no radio contact at all. The better landing day plays no part in it.
    // The site's name is in the line above.
    const a = answerFor({ siteName: 'de Gerlache Rim 2', series: s, summary: summarize(s), power: p, startUtc: start, days: 30, loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, best: null });
    expect(standHeadline(a.title, 'de Gerlache Rim 2', s, p, start, a.contactHours, a.poweredHours)).toBe(`Landing on 1 January: power for ${unbroken('3 days 4 hours')}, no radio contact, then ${unbroken('16 days')} without power`);
    expect(standingLine(site, 'de Gerlache Rim 2', 'top')).toBe("Standing at de Gerlache Rim 2, near the Moon's south pole. Hills: NASA height data. Small craters and rocks: added to look real.");
    // Under More, only what the line above does not say: the latitude and the site's own note.
    expect(standingLine(site, 'de Gerlache Rim 2', 'more')).toBe('de Gerlache Rim 2 lies at 88.3° S. A ridge on a crater rim, 52 km from the pole.');
    // The battery runs out the day after the Sun leaves the view, so the two stay apart; the power comes back
    // with the Sun, if the lander survived the night, so that flag claims only the Sun. The Sun is still 1.7°
    // up as it sets behind the hills on 3 January: a sunset all the same.
    const moments = keyMoments(s, p, start);
    expect(moments.map((m) => `${m.label}, ${m.day}`)).toEqual(['Sunset, 3 Jan', 'Battery runs out, 4 Jan', 'Earth rises, 10 Jan', 'Sunrise, 20 Jan', 'Earth sets, 23 Jan']);
    expect(moments.map((m) => m.kind)).toEqual(['sunset', 'battery-out', 'earth-in', 'sun-power-back', 'earth-out']);
    expect(moments.map((m) => momentCaption(m.kind, s, m.hour, site.lat))).toEqual([
      'Sunset behind the hills: near the pole the Sun never climbs more than a few degrees. No air, so no twilight.',
      'The battery runs out at night. With no Sun or Earth in sight, the picture is brightened so you can see it.',
      "Earth rises over the hills: the Moon's slight wobble lifts it into view for about two weeks a month.",
      'Sunrise, and with it the power, if the lander survived the cold. Earth is in view: it could radio home.',
      "Earth sets behind the hills: the Moon's slight wobble lowers it. No radio until it rises again.",
    ]);
    // In the dark between, neither the Sun nor Earth in view: at hour 200 the Sun is 0.3° below the horizon,
    // and never 2° below it in this period, so the card's lines on why always say that higher ground farther
    // off still catches its light; the line over the view keeps to two lines without it.
    expect(s.sunFraction[200]).toBe(0);
    expect(s.earthVisible[200]).toBe(0);
    expect(viewCaption('dark', site.lat)).toBe('Neither the Sun nor Earth lights this ground; the picture is brightened so you can see it. No air, no twilight.');
    expect(Math.min(...s.sunEl)).toBeGreaterThan(-2);
    expect(whyLines(site.lat, s, 200)).toEqual([
      poleLine(site.lat),
      "Earth hangs almost still in the Moon's sky, because the Moon keeps one face towards it. But the Moon wobbles a little as it goes round, and this close to the pole that is enough to lift Earth above the horizon and lower it again over the month.",
      'The Sun is just below the horizon here, but higher ground farther off still catches its light.',
      'With no air there is no twilight: once the Sun has set, it is night.',
      'North and south still work here: the pole itself is 52 km to the south.',
      'The night here is colder than −170 °C. Most landers are not built to survive it, which is why the forecast says "if".',
      "The radio forecast is for a link straight to Earth; a relay satellite, as China's Chang'e 4 used, would change it.",
    ]);
    // The view opens on the landing: the Sun in view 2.46° up, Earth 5.7° below the horizon, out of view.
    expect(skyLabel('sun', s, 0)).toBe('Sun 2.5° up');
    expect(skyLabel('earth', s, 0)).toBe('Earth, 5.7° below the horizon');
    // The battery runs out at hour 76 with the Sun behind a hill to the west, 1.5° up, and Earth below the horizon:
    // the ground the view shows about the lander is lit by neither. The caption says "at night" and nothing
    // that would deny the Sun's label: the Sun is up.
    expect(moments[1].hour).toBe(76);
    expect(s.earthVisible[76]).toBe(0);
    expect(skyLabel('sun', s, 76)).toBe('Sun behind a hill to the west, 1.5° up');
    expect(momentCaption('battery-out', s, 76, site.lat)).toBe('The battery runs out at night. With no Sun or Earth in sight, the picture is brightened so you can see it.');
    // At hour 219 Earth has come into view 0.24° below level, over a skyline lower still: on the horizon.
    expect(s.earthVisible[219]).toBe(1);
    expect(skyLabel('earth', s, 219)).toBe('Earth, on the horizon');
    // The pole is as far off as the site's own note says.
    expect(site.blurb).toContain('52 km from the pole');
    expect(whyLines(site.lat, s, 10)).toContain('North and south still work here: the pole itself is 52 km to the south.');
    expect(watchNext(s, p, start, 10)).toBe(`${WATCH_LEAD} the Sun sets behind the hills on 3 January, and the battery runs out on 4 January.`);
    // No power from 4 January to 20 January, as the headline counts it, at night: the Sun set behind the hills
    // on 3 January.
    expect(watchNext(s, p, start, 219)).toBe(`${WATCH_LEAD} the Sun rises on 20 January, and the power with it, if the lander survives 16 days without power at night, colder than −170 °C.`);
    expect(radioNext(s, p, start)).toBe('The first day the lander has both power and a view of Earth is 20 January.');
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, tone: 'power', text: 'Power on. No radio: Earth is below the horizon.' });
    // With the battery's size, as the page gives it: still full at hour 10, with the Sun up.
    expect(statusLine(s, p, start, 10, DEFAULT_POWER.batteryWh).text).toBe('Power on, battery 100\u00a0%. No radio: Earth is below the horizon.');
    expect(statusLine(s, p, start, 219)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January. Earth is in view, but the radio has no power.' });
    // Off with Earth out of view: the flags say when the power comes back.
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, tone: 'off', text: 'Power off: the battery ran out on 4 January.' });
    expect(skyLabel('sun', s, 10)).toBe('Sun 2.4° up');
  });
});
